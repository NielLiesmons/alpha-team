/**
 * IndexedDB key-value cache for offline-first Admin (PWA).
 * Stores workspace + track *metadata* only — never media/cover blobs.
 */

const DB_NAME = 'alpha-admin-local';
const DB_VERSION = 1;
const STORE = 'kv';

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function openDb() {
	if (typeof indexedDB === 'undefined') {
		return Promise.reject(new Error('IndexedDB unavailable'));
	}
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE)) {
					db.createObjectStore(STORE);
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
		});
	}
	return dbPromise;
}

/**
 * @param {string} key
 * @returns {Promise<any | undefined>}
 */
export async function idbGet(key) {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readonly');
			const req = tx.objectStore(STORE).get(key);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	} catch {
		return undefined;
	}
}

/**
 * @param {string} key
 * @param {any} value
 */
export async function idbSet(key, value) {
	try {
		const db = await openDb();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put(value, key);
			tx.oncomplete = () => resolve(undefined);
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		/* private mode / quota — ignore */
	}
}

/**
 * @param {string} key
 */
export async function idbDel(key) {
	try {
		const db = await openDb();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).delete(key);
			tx.oncomplete = () => resolve(undefined);
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		/* ignore */
	}
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @param {string} [email]
 */
export function workspaceCacheKey(session, email) {
	const who = (email || 'anon').trim().toLowerCase() || 'anon';
	return `workspace.v1:${session.url}:${who}`;
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @param {string} [email]
 */
export function tracksCacheKey(session, email) {
	const who = (email || 'anon').trim().toLowerCase() || 'anon';
	return `tracks.v1:${session.url}:${who}`;
}

/**
 * Strip non-serializable / heavy fields before IDB write.
 * @param {any} track
 */
export function thinTrack(track) {
	if (!track || typeof track !== 'object') return track;
	const { cover_url: _cu, _pending: _p, ...rest } = track;
	return rest;
}
