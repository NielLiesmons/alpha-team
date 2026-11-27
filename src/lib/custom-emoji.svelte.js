/**
 * Space custom emoji — square PNG on Drive, shortcodes in chat/reactions.
 *
 * Layout:
 *   media/emoji/index.json   alpha.custom_emoji_index/1
 *   media/emoji/{id}.png     96×96 center-cropped PNG (alpha preserved)
 *
 * Display URLs come from media-cache (shared inflight decrypt, IDB, no revoke).
 * Index refresh is single-flight; transient misses never permanently blacklist a path.
 */

import { activePerson } from './actor.svelte.js';
import { getPath, peekCachedTip, putPath } from './drive/client.js';
import { sha256Hex } from './drive/crypto.js';
import { getAttachmentObjectUrl } from './drive/media-cache.js';
import { activeSession } from './drive/session.svelte.js';
import { customEmojiShortcode } from './message-emoji.js';

function nowRfc3339() {
	return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function newId() {
	return crypto.randomUUID().replace(/-/g, '');
}

const INDEX_PATH = 'media/emoji/index.json';
/** Display size in chat is ~32–64px; 96 keeps @2x/@3x sharp without heavy payloads. */
export const CUSTOM_EMOJI_SIZE = 96;

/** Soft cooldown after a path miss before retry (ms). */
const FAIL_RETRY_MS = 4_000;
/** Cap automatic retries so a deleted path cannot spin forever. */
const FAIL_RETRY_MAX = 5;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   path: string,
 *   created_at: string,
 *   created_by: string
 * }} CustomEmoji
 */

/** @type {CustomEmoji[]} */
export const customEmojis = $state([]);

/** @type {Record<string, string>} path → object URL (media-cache owned — never revoke) */
const urlByPath = $state(/** @type {Record<string, string>} */ ({}));

/** @type {Map<string, Promise<string | null>>} */
const loadingUrls = new Map();

/** @type {Map<string, number>} path → last fail timestamp */
const failedAt = new Map();
/** @type {Map<string, number>} path → soft-retry count */
const failCount = new Map();

/** Tick so failed/loaded readers stay reactive. */
let emojiUiTick = $state(0);

let loaded = false;
/** Space root tip observed when index last hydrated successfully. */
let lastIndexTip = '';
/** @type {Promise<CustomEmoji[]> | null} */
let refreshInflight = null;
/** Last time we kicked a background refresh from a renderer. */
let lastKickAt = 0;

/** True after first successful index read (empty index still counts). */
export function customEmojiIndexReady() {
	emojiUiTick;
	return loaded;
}

/**
 * True after soft retries are exhausted for this path (deleted / never uploaded).
 * Transient Drive misses stay soft (skeleton keeps pulsing + retries).
 * @param {string} [path]
 */
export function customEmojiFailed(path) {
	emojiUiTick;
	const p = String(path || '').trim();
	if (!p) return false;
	return (failCount.get(p) || 0) >= FAIL_RETRY_MAX;
}

function bumpUi() {
	emojiUiTick += 1;
}

function normName(name) {
	return String(name || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '')
		.slice(0, 32);
}

/**
 * Center-crop to square and resize to CUSTOM_EMOJI_SIZE PNG (keeps transparency).
 * @param {File | Blob} file
 * @returns {Promise<Uint8Array>}
 */
export async function encodeCustomEmojiPng(file) {
	const size = CUSTOM_EMOJI_SIZE;
	/** @type {number} */
	let width;
	/** @type {number} */
	let height;
	/** @type {(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, sx: number, sy: number, sw: number, sh: number) => void} */
	let draw;

	try {
		const bitmap = await createImageBitmap(file);
		width = bitmap.width;
		height = bitmap.height;
		draw = (ctx, dx, dy, dw, dh, sx, sy, sw, sh) => {
			ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
			bitmap.close();
		};
	} catch {
		const url = URL.createObjectURL(file);
		try {
			const img = await new Promise((resolve, reject) => {
				const el = new Image();
				el.onload = () => resolve(el);
				el.onerror = () => reject(new Error('Couldn’t read that image — try PNG or WebP'));
				el.src = url;
			});
			width = img.naturalWidth || img.width;
			height = img.naturalHeight || img.height;
			draw = (ctx, dx, dy, dw, dh, sx, sy, sw, sh) =>
				ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	if (!width || !height) throw new Error('Couldn’t read that image');
	const side = Math.min(width, height);
	const sx = Math.floor((width - side) / 2);
	const sy = Math.floor((height - side) / 2);
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Couldn’t process emoji image');
	ctx.clearRect(0, 0, size, size);
	draw(ctx, 0, 0, size, size, sx, sy, side, side);

	const blob = await new Promise((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Couldn’t encode emoji PNG'))),
			'image/png'
		);
	});
	return new Uint8Array(await blob.arrayBuffer());
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @returns {Promise<{ items: CustomEmoji[], ok: boolean }>}
 */
async function readIndex(session) {
	try {
		const bytes = await getPath(session, INDEX_PATH);
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		const items = Array.isArray(doc?.items) ? doc.items : Array.isArray(doc) ? doc : [];
		return {
			ok: true,
			items: items
				.map((row) => ({
					id: String(row?.id || '').trim(),
					name: normName(row?.name),
					path: String(row?.path || '').trim(),
					created_at: String(row?.created_at || ''),
					created_by: String(row?.created_by || '')
				}))
				.filter((e) => e.id && e.name && e.path)
		};
	} catch (e) {
		const msg = String(e?.message || e || '');
		/* Missing index = empty Space — success. Network/decrypt errors stay !ok. */
		if (/path not found/i.test(msg)) return { ok: true, items: [] };
		return { ok: false, items: [] };
	}
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @param {CustomEmoji[]} items
 */
async function writeIndex(session, items) {
	await putPath(
		session,
		INDEX_PATH,
		'blob',
		JSON.stringify(
			{
				schema: 'alpha.custom_emoji_index/1',
				items,
				updated_at: nowRfc3339()
			},
			null,
			2
		)
	);
}

/**
 * Load / refresh the Space custom-emoji index.
 * Single-flight; skips when Space tip unchanged unless `force`.
 * @param {{ force?: boolean }} [opts]
 */
export async function refreshCustomEmojis(opts = {}) {
	const force = Boolean(opts.force);
	const session = activeSession();
	if (!session) {
		customEmojis.splice(0, customEmojis.length);
		loaded = false;
		lastIndexTip = '';
		bumpUi();
		return [];
	}

	const tipNow = peekCachedTip(session) || '';
	if (!force && loaded && tipNow && tipNow === lastIndexTip) {
		return customEmojis.slice();
	}

	if (refreshInflight) return refreshInflight;

	refreshInflight = (async () => {
		try {
			const { items, ok } = await readIndex(session);
			if (!ok) {
				/* Keep prior list if any; do not claim ready with a false empty. */
				if (!loaded) bumpUi();
				return customEmojis.slice();
			}
			customEmojis.splice(0, customEmojis.length, ...items);
			loaded = true;
			lastIndexTip = peekCachedTip(session) || tipNow || lastIndexTip;
			/* Clear soft-fails so new/known paths retry after tip move. */
			failedAt.clear();
			failCount.clear();
			bumpUi();
			/* Lazy URL resolve — ChatEmoji / picker kick ensure; avoid decrypt stampede. */
			return items;
		} finally {
			refreshInflight = null;
		}
	})();

	return refreshInflight;
}

/**
 * Kick a background index refresh from a renderer (debounced).
 * Safe to call from $effect / derived paths.
 * @param {{ force?: boolean }} [opts]
 */
export function kickCustomEmojiRefresh(opts = {}) {
	if (!activeSession()) return;
	const now = Date.now();
	if (now - lastKickAt < 1_200) return;
	lastKickAt = now;
	/* Unknown shortcode after hydrate → force tip re-read (peer may have added emoji). */
	void refreshCustomEmojis({ force: Boolean(opts.force) || !loaded }).catch(() => {});
}

/**
 * @param {string} path
 * @param {{ force?: boolean }} [opts]
 */
export async function ensureCustomEmojiUrl(path, opts = {}) {
	const p = String(path || '').trim();
	if (!p) return null;
	if (urlByPath[p] && !opts.force) return urlByPath[p];

	if (!opts.force && (failCount.get(p) || 0) >= FAIL_RETRY_MAX) return null;

	const failTs = failedAt.get(p);
	if (!opts.force && failTs != null && Date.now() - failTs < FAIL_RETRY_MS) {
		const wait = Math.max(50, FAIL_RETRY_MS - (Date.now() - failTs) + 50);
		setTimeout(() => {
			void ensureCustomEmojiUrl(p);
		}, wait);
		return null;
	}

	const pending = loadingUrls.get(p);
	if (pending) return pending;

	const session = activeSession();
	if (!session) return null;

	const work = (async () => {
		try {
			const res = await getAttachmentObjectUrl(session, {
				path: p,
				kind: 'image',
				content_type: 'image/png',
				name: 'emoji.png'
			});
			const url = res?.url || null;
			if (!url) {
				const n = (failCount.get(p) || 0) + 1;
				failCount.set(p, n);
				failedAt.set(p, Date.now());
				bumpUi();
				if (n < FAIL_RETRY_MAX) {
					setTimeout(() => {
						void ensureCustomEmojiUrl(p);
					}, FAIL_RETRY_MS + 50);
				}
				return null;
			}
			failedAt.delete(p);
			failCount.delete(p);
			urlByPath[p] = url;
			bumpUi();
			return url;
		} catch {
			const n = (failCount.get(p) || 0) + 1;
			failCount.set(p, n);
			failedAt.set(p, Date.now());
			bumpUi();
			if (n < FAIL_RETRY_MAX) {
				setTimeout(() => {
					void ensureCustomEmojiUrl(p);
				}, FAIL_RETRY_MS + 50);
			}
			return null;
		} finally {
			loadingUrls.delete(p);
		}
	})();

	loadingUrls.set(p, work);
	return work;
}

/**
 * Reactive object URL for a Drive emoji path.
 * @param {string} [path]
 */
export function customEmojiUrlForPath(path) {
	emojiUiTick;
	const p = String(path || '').trim();
	if (!p) return null;
	const cached = urlByPath[p];
	if (cached) return cached;
	void ensureCustomEmojiUrl(p);
	return null;
}

/**
 * @param {string} nameOrCode
 * @returns {CustomEmoji | null}
 */
export function customEmojiByName(nameOrCode) {
	emojiUiTick;
	const code = customEmojiShortcode(nameOrCode);
	const name = code.replace(/^:|:$/g, '');
	if (!name) return null;
	customEmojis.length;
	return customEmojis.find((e) => e.name === name) || null;
}

/**
 * @param {string} nameOrCode
 */
export function customEmojiUrl(nameOrCode) {
	const hit = customEmojiByName(nameOrCode);
	if (!hit) return null;
	return customEmojiUrlForPath(hit.path);
}

/**
 * Upload a custom emoji (resized/cropped) and append to the Space index.
 * @param {File | Blob} file
 * @param {string} name
 */
export async function uploadCustomEmoji(file, name) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive before uploading emoji.');
	const n = normName(name);
	if (!/^[a-z0-9_]{2,32}$/.test(n)) {
		throw new Error('Name must be 2–32 letters, numbers, or underscores.');
	}
	if (!loaded) await refreshCustomEmojis({ force: true });
	if (customEmojis.some((e) => e.name === n)) {
		throw new Error(`:${n}: already exists — pick another name.`);
	}

	const bytes = await encodeCustomEmojiPng(file);
	const hash = await sha256Hex(bytes);
	const id = newId().slice(0, 12);
	const path = `media/emoji/${id}-${hash.slice(0, 8)}.png`;
	await putPath(session, path, 'blob', bytes);

	/** @type {CustomEmoji} */
	const row = {
		id,
		name: n,
		path,
		created_at: nowRfc3339(),
		created_by: activePerson().email || ''
	};
	const next = [...customEmojis, row];
	await writeIndex(session, next);
	customEmojis.splice(0, customEmojis.length, ...next);
	loaded = true;
	lastIndexTip = peekCachedTip(session) || lastIndexTip;
	bumpUi();
	await ensureCustomEmojiUrl(path, { force: true });
	return row;
}

/**
 * @param {string} id
 */
export async function removeCustomEmoji(id) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive first.');
	const sid = String(id || '').trim();
	const next = customEmojis.filter((e) => e.id !== sid);
	await writeIndex(session, next);
	customEmojis.splice(0, customEmojis.length, ...next);
	lastIndexTip = peekCachedTip(session) || lastIndexTip;
	bumpUi();
}
