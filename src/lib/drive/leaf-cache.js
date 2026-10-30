/**
 * Content-addressed plaintext cache for Drive leaves.
 * Same ciphertext hash ⇒ same plaintext — skip network + decrypt on hit.
 * Memory first; IndexedDB survives hard refresh.
 */

const IDB_NAME = 'alpha.drive.leaf.v1';
const IDB_STORE = 'leaves';

/** @type {Map<string, any>} */
const memory = new Map();

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function openDb() {
	if (typeof indexedDB === 'undefined') return null;
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(IDB_NAME, 1);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		}).catch(() => null);
	}
	return dbPromise;
}

/**
 * @param {string} hash
 * @returns {Promise<any | null>}
 */
export async function getCachedLeaf(hash) {
	if (!hash) return null;
	if (memory.has(hash)) return structuredClone(memory.get(hash));
	const db = await openDb();
	if (!db) return null;
	return new Promise((resolve) => {
		try {
			const tx = db.transaction(IDB_STORE, 'readonly');
			const req = tx.objectStore(IDB_STORE).get(hash);
			req.onsuccess = () => {
				const doc = req.result ?? null;
				if (doc) memory.set(hash, doc);
				resolve(doc ? structuredClone(doc) : null);
			};
			req.onerror = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
}

/**
 * @param {string} hash
 * @param {any} doc
 */
export async function putCachedLeaf(hash, doc) {
	if (!hash || !doc) return;
	memory.set(hash, doc);
	const db = await openDb();
	if (!db) return;
	try {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).put(doc, hash);
	} catch {
		/* ignore quota */
	}
}

/**
 * Bounded parallel map.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, i: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapPool(items, limit, fn) {
	const out = /** @type {R[]} */ (new Array(items.length));
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i], i);
		}
	}
	const n = Math.min(limit, Math.max(1, items.length));
	await Promise.all(Array.from({ length: n }, () => worker()));
	return out;
}
