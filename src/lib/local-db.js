/**
 * IndexedDB + localStorage backup for offline-first Admin (PWA).
 * Stores workspace + track *metadata* only — never media/cover blobs.
 *
 * Important: Svelte 5 $state values are Proxies — structured clone fails.
 * Always JSON-roundtrip before write.
 */

const DB_NAME = 'alpha-admin-local';
const DB_VERSION = 1;
const STORE = 'kv';
const LS_BACKUP_PREFIX = 'alpha-admin-kv:';

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
 * Strip Proxies / non-cloneables. Returns null if not serializable.
 * @param {any} value
 */
export function toPlain(value) {
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return null;
	}
}

/**
 * @param {string} key
 * @returns {Promise<any | undefined>}
 */
export async function idbGet(key) {
	try {
		const db = await openDb();
		const fromIdb = await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readonly');
			const req = tx.objectStore(STORE).get(key);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		if (fromIdb !== undefined) return fromIdb;
	} catch {
		/* fall through to localStorage */
	}
	try {
		if (typeof localStorage === 'undefined') return undefined;
		const raw = localStorage.getItem(LS_BACKUP_PREFIX + key);
		if (!raw) return undefined;
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

/**
 * @param {string} key
 * @param {any} value
 */
export async function idbSet(key, value) {
	const plain = toPlain(value);
	if (plain == null) return;

	// localStorage backup first — survives flaky iOS IDB in PWAs for smaller payloads
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(LS_BACKUP_PREFIX + key, JSON.stringify(plain));
		}
	} catch {
		/* quota */
	}

	try {
		const db = await openDb();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put(plain, key);
			tx.oncomplete = () => resolve(undefined);
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		/* IDB may fail; LS backup may still work */
	}
}

/**
 * @param {string} key
 */
export async function idbDel(key) {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(LS_BACKUP_PREFIX + key);
		}
	} catch {
		/* ignore */
	}
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
 * One cache per Drive host on this device (email mismatch was wiping reopen).
 * @param {import('./drive/client.js').DriveSession} session
 */
export function workspaceCacheKey(session) {
	return `workspace.v2:${session.url}`;
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 */
export function tracksCacheKey(session) {
	return `tracks.v2:${session.url}`;
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
