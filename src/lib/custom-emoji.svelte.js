/**
 * Space custom emoji — square PNG on Drive, shortcodes in chat/reactions.
 *
 * Layout:
 *   media/emoji/index.json   alpha.custom_emoji_index/1
 *   media/emoji/{id}.png     96×96 center-cropped PNG (alpha preserved)
 */

import { activePerson } from './actor.svelte.js';
import { getPath, putPath } from './drive/client.js';
import { sha256Hex } from './drive/crypto.js';
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

/** @type {Record<string, string>} path → object URL */
const urlByPath = $state(/** @type {Record<string, string>} */ ({}));

/** @type {Set<string>} */
const loadingUrls = new Set();

/** @type {Set<string>} paths that failed to load (no raw :name: fallback). */
const failedUrls = $state(/** @type {Set<string>} */ (new Set()));

/** Tick so failed/loaded readers stay reactive. */
let emojiUiTick = $state(0);

let loaded = false;

/** True after first successful index read (empty index still counts). */
export function customEmojiIndexReady() {
	emojiUiTick;
	return loaded;
}

/** @param {string} [path] */
export function customEmojiFailed(path) {
	emojiUiTick;
	const p = String(path || '').trim();
	return Boolean(p && failedUrls.has(p));
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
 */
async function readIndex(session) {
	try {
		const bytes = await getPath(session, INDEX_PATH);
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		const items = Array.isArray(doc?.items) ? doc.items : Array.isArray(doc) ? doc : [];
		return items
			.map((row) => ({
				id: String(row?.id || '').trim(),
				name: normName(row?.name),
				path: String(row?.path || '').trim(),
				created_at: String(row?.created_at || ''),
				created_by: String(row?.created_by || '')
			}))
			.filter((e) => e.id && e.name && e.path);
	} catch {
		return [];
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

export async function refreshCustomEmojis() {
	const session = activeSession();
	if (!session) {
		customEmojis.splice(0, customEmojis.length);
		loaded = false;
		return [];
	}
	const items = await readIndex(session);
	customEmojis.splice(0, customEmojis.length, ...items);
	loaded = true;
	emojiUiTick += 1;
	for (const e of items) void ensureCustomEmojiUrl(e.path);
	return items;
}

/**
 * @param {string} path
 */
export async function ensureCustomEmojiUrl(path) {
	const p = String(path || '').trim();
	if (!p) return null;
	if (urlByPath[p]) return urlByPath[p];
	if (failedUrls.has(p)) return null;
	if (loadingUrls.has(p)) return null;
	const session = activeSession();
	if (!session) return null;
	loadingUrls.add(p);
	try {
		const bytes = await getPath(session, p);
		const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
		const blob = new Blob(
			[copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)],
			{ type: 'image/png' }
		);
		const prev = urlByPath[p];
		if (prev) URL.revokeObjectURL(prev);
		if (failedUrls.has(p)) {
			failedUrls.delete(p);
			emojiUiTick += 1;
		}
		urlByPath[p] = URL.createObjectURL(blob);
		return urlByPath[p];
	} catch {
		failedUrls.add(p);
		emojiUiTick += 1;
		return null;
	} finally {
		loadingUrls.delete(p);
	}
}

/**
 * Reactive object URL for a Drive emoji path.
 * @param {string} [path]
 */
export function customEmojiUrlForPath(path) {
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
	if (!loaded) await refreshCustomEmojis();
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
	await ensureCustomEmojiUrl(path);
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
}
