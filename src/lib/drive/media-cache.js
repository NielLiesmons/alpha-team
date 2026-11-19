/**
 * Decrypted Drive media cache for chat / Player.
 *
 * Zapstore caches HTTP images via the service worker Cache API. Alpha media is
 * encrypted Drive plaintext, so we cache *after* decrypt — same idea as
 * leaf-cache, but for binary blobs + stable object URLs.
 *
 * Layers:
 *  1. Memory — object URL + lastUsed (instant re-render across bubbles)
 *  2. IndexedDB — ArrayBuffer bytes (survives hard refresh)
 *  3. Network — getPath / getMediaBlob
 *
 * LRU eviction by entry count + total bytes. Object URLs are shared; callers
 * must not revoke them.
 */

import { getPath } from './client.js';
import { getMediaBlob } from './media.js';
import { inferMediaKind, isMediaManifestPath, mimeFromNameAndType } from './media-kind.js';

const IDB_NAME = 'alpha.drive.media.v1';
const IDB_STORE = 'blobs';
/** Soft caps — chat thumbs + voice clips; large video still works via miss. */
const MAX_ENTRIES = 280;
const MAX_TOTAL_BYTES = 220 * 1024 * 1024;

/**
 * @typedef {{
 *   url: string,
 *   type: string,
 *   kind: 'image' | 'video' | 'voice' | 'file',
 *   size: number,
 *   lastUsed: number,
 *   bytes?: ArrayBuffer
 * }} MediaCacheEntry
 */

/** @type {Map<string, MediaCacheEntry>} */
const memory = new Map();

/** In-flight fetches so parallel bubbles share one decrypt. */
/** @type {Map<string, Promise<MediaCacheEntry | null>>} */
const inflight = new Map();

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} path
 */
function cacheKey(session, path) {
	return `${session.url}\0${session.rootKey.slice(0, 16)}\0${path}`;
}

function openDb() {
	if (typeof indexedDB === 'undefined') return null;
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(IDB_NAME, 1);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(IDB_STORE)) {
					db.createObjectStore(IDB_STORE);
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		}).catch(() => null);
	}
	return dbPromise;
}

/**
 * @param {string} key
 * @returns {Promise<{ buffer: ArrayBuffer, type: string, kind: string, size: number } | null>}
 */
async function idbGetBlob(key) {
	const db = await openDb();
	if (!db) return null;
	return new Promise((resolve) => {
		try {
			const tx = db.transaction(IDB_STORE, 'readonly');
			const req = tx.objectStore(IDB_STORE).get(key);
			req.onsuccess = () => {
				const row = req.result;
				if (!row?.buffer) {
					resolve(null);
					return;
				}
				resolve({
					buffer: row.buffer,
					type: String(row.type || 'application/octet-stream'),
					kind: String(row.kind || 'file'),
					size: Number(row.size) || row.buffer.byteLength || 0
				});
			};
			req.onerror = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
}

/**
 * @param {string} key
 * @param {{ buffer: ArrayBuffer, type: string, kind: string, size: number, lastUsed: number }} row
 */
async function idbPutBlob(key, row) {
	const db = await openDb();
	if (!db) return;
	try {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).put(row, key);
	} catch {
		/* quota */
	}
}

/**
 * @param {string} key
 */
async function idbDelBlob(key) {
	const db = await openDb();
	if (!db) return;
	try {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).delete(key);
	} catch {
		/* ignore */
	}
}

async function trimCaches() {
	const entries = [...memory.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
	let total = entries.reduce((n, [, e]) => n + (e.size || 0), 0);
	while (entries.length > MAX_ENTRIES || total > MAX_TOTAL_BYTES) {
		const next = entries.shift();
		if (!next) break;
		const [key, ent] = next;
		total -= ent.size || 0;
		memory.delete(key);
		try {
			URL.revokeObjectURL(ent.url);
		} catch {
			/* ignore */
		}
		void idbDelBlob(key);
	}
}

/**
 * @param {string} key
 * @param {ArrayBuffer} buffer
 * @param {string} type
 * @param {'image' | 'video' | 'voice' | 'file'} kind
 */
function remember(key, buffer, type, kind) {
	const existing = memory.get(key);
	if (existing) {
		existing.lastUsed = Date.now();
		return existing;
	}
	const url = URL.createObjectURL(new Blob([buffer], { type }));
	const entry = {
		url,
		type,
		kind,
		size: buffer.byteLength,
		lastUsed: Date.now(),
		bytes: buffer
	};
	memory.set(key, entry);
	void idbPutBlob(key, {
		buffer,
		type,
		kind,
		size: buffer.byteLength,
		lastUsed: entry.lastUsed
	});
	void trimCaches();
	return entry;
}

/**
 * Resolve a displayable object URL for a Drive attachment.
 * Shared across components — do not revoke the returned URL.
 *
 * @param {import('./client.js').DriveSession} session
 * @param {{
 *   path?: string,
 *   kind?: string,
 *   content_type?: string,
 *   name?: string
 * }} att
 * @param {{ signal?: AbortSignal, localOnly?: boolean }} [opts]
 * @returns {Promise<{ url: string, type: string, kind: 'image' | 'video' | 'voice' | 'file' } | null>}
 */
export async function getAttachmentObjectUrl(session, att, opts = {}) {
	const path = String(att?.path || '');
	if (!session || !path || path.startsWith('local:')) return null;

	const key = cacheKey(session, path);
	const kind = inferMediaKind(att);
	const typeHint = mimeFromNameAndType(att?.name, att?.content_type);

	const hit = memory.get(key);
	if (hit) {
		hit.lastUsed = Date.now();
		return { url: hit.url, type: hit.type, kind: /** @type {any} */ (hit.kind) || kind };
	}

	if (opts.signal?.aborted) return null;

	/* Boot / PFP warm — memory + IndexedDB only; never share inflight with network. */
	if (opts.localOnly) {
		const cached = await idbGetBlob(key);
		if (!cached?.buffer) return null;
		const entry = remember(
			key,
			cached.buffer,
			cached.type || typeHint,
			/** @type {any} */ (cached.kind) || kind
		);
		return { url: entry.url, type: entry.type, kind: /** @type {any} */ (entry.kind) };
	}

	const pending = inflight.get(key);
	if (pending) {
		const res = await pending;
		if (opts.signal?.aborted) return null;
		return res;
	}

	/* Once started, finish + cache even if the first waiter unmounts — shared inflight. */
	const work = (async () => {
		const cached = await idbGetBlob(key);
		if (cached?.buffer) {
			const entry = remember(
				key,
				cached.buffer,
				cached.type || typeHint,
				/** @type {any} */ (cached.kind) || kind
			);
			return { url: entry.url, type: entry.type, kind: /** @type {any} */ (entry.kind) };
		}

		/** @type {Uint8Array} */
		let bytes;
		/** @type {string} */
		let type = typeHint;
		try {
			if (isMediaManifestPath(path) || kind === 'voice' || kind === 'video') {
				const loaded = await getMediaBlob(session, path);
				bytes = loaded.bytes;
				type = loaded.manifest?.content_type || type;
			} else {
				bytes = await getPath(session, path);
			}
		} catch {
			return null;
		}

		const buffer =
			bytes.buffer instanceof ArrayBuffer &&
			bytes.byteOffset === 0 &&
			bytes.byteLength === bytes.buffer.byteLength
				? bytes.buffer
				: bytes.slice().buffer;
		const entry = remember(key, buffer, type || typeHint, kind);
		return { url: entry.url, type: entry.type, kind };
	})();

	inflight.set(key, work);
	try {
		const res = await work;
		if (opts.signal?.aborted) return null;
		return res;
	} finally {
		inflight.delete(key);
	}
}

/**
 * Warm cache for a list of attachments (e.g. visible feed window).
 * @param {import('./client.js').DriveSession} session
 * @param {any[]} attachments
 * @param {{ signal?: AbortSignal, concurrency?: number }} [opts]
 */
export async function prefetchAttachments(session, attachments, opts = {}) {
	const list = (Array.isArray(attachments) ? attachments : []).filter(
		(a) => a?.path && !String(a.path).startsWith('local:') && inferMediaKind(a) !== 'file'
	);
	const conc = Math.max(1, opts.concurrency ?? 3);
	let i = 0;
	async function worker() {
		while (i < list.length) {
			if (opts.signal?.aborted) return;
			const a = list[i++];
			await getAttachmentObjectUrl(session, a, { signal: opts.signal });
		}
	}
	await Promise.all(Array.from({ length: Math.min(conc, list.length) }, () => worker()));
}
