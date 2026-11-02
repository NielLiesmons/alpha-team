/**
 * Browser client for alpha-drive ciphertext API.
 * Root key stays in the browser; server never sees plaintext.
 */

import {
	bytesToHex,
	decrypt,
	decryptWithKey,
	encrypt,
	encryptWithKey,
	encryptWithRoot,
	hexToBytes,
	parseRootKey,
	sha256Hex
} from './crypto.js';

/**
 * @typedef {{ url: string, token: string, rootKey: string }} DriveSession
 */

/** @type {{ key: string, tip: string, dir: any } | null} */
let rootDirCache = null;

/**
 * @param {DriveSession} session
 */
function sessionCacheKey(session) {
	return `${session.url}\0${session.rootKey}`;
}

/**
 * In-memory tip from last successful load/put — no network.
 * @param {DriveSession} session
 */
export function peekCachedTip(session) {
	if (!session || !rootDirCache) return '';
	if (rootDirCache.key !== sessionCacheKey(session)) return '';
	return rootDirCache.tip || '';
}

/**
 * @param {string} path
 */
function normalizePath(path) {
	return path
		.split('/')
		.filter((s) => s.length > 0)
		.join('/');
}

/**
 * @param {DriveSession} session
 * @param {string} method
 * @param {string} path
 * @param {BodyInit} [body]
 * @param {string} [contentType]
 * @param {AbortSignal} [signal]
 */
async function api(session, method, path, body, contentType, signal) {
	const headers = { Authorization: `Bearer ${session.token}` };
	if (contentType) headers['Content-Type'] = contentType;
	const res = await fetch(`${session.url.replace(/\/$/, '')}${path}`, {
		method,
		headers,
		body,
		signal
	});
	if (!res.ok) {
		throw new Error(`${method} ${path}: ${res.status}`);
	}
	return res;
}

/**
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 */
export async function getTip(session, signal) {
	const res = await api(session, 'GET', '/v1/tip', undefined, undefined, signal);
	const body = await res.json();
	return body.root_hash ?? '';
}

/**
 * @param {DriveSession} session
 * @param {string} hash
 */
async function putTip(session, hash) {
	await api(session, 'PUT', '/v1/tip', JSON.stringify({ root_hash: hash }), 'application/json');
}

/**
 * @param {DriveSession} session
 * @param {string} hash
 * @param {Uint8Array} ciphertext
 */
export async function putBlock(session, hash, ciphertext) {
	// Blob body is more reliable than raw Uint8Array across browsers/servers.
	const body =
		ciphertext instanceof Uint8Array
			? new Blob([ciphertext])
			: ciphertext;
	await api(session, 'PUT', `/v1/blocks/${hash}`, body);
}

/**
 * @param {DriveSession} session
 * @param {string} hash
 * @param {AbortSignal} [signal]
 */
export async function getBlock(session, hash, signal) {
	const res = await api(session, 'GET', `/v1/blocks/${hash}`, undefined, undefined, signal);
	return new Uint8Array(await res.arrayBuffer());
}

/**
 * @param {any} dir
 * @param {string} tip
 * @param {DriveSession} session
 */
function rememberRootDir(dir, tip, session) {
	rootDirCache = {
		key: sessionCacheKey(session),
		tip,
		dir: structuredClone(dir)
	};
}

/**
 * Load tip + decrypted root dir once per tip (cached in memory).
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ tip: string, dir: any }>}
 */
export async function loadRootDirWithTip(session, signal) {
	const root = parseRootKey(session.rootKey);
	let tip;
	try {
		tip = await getTip(session, signal);
	} catch (e) {
		if (e?.name === 'AbortError') throw e;
		return { tip: '', dir: { schema: 'alpha.dir/1', children: {} } };
	}
	if (!tip) return { tip: '', dir: { schema: 'alpha.dir/1', children: {} } };

	const cacheKey = sessionCacheKey(session);
	if (rootDirCache && rootDirCache.key === cacheKey && rootDirCache.tip === tip) {
		return { tip, dir: structuredClone(rootDirCache.dir) };
	}

	const ct = await getBlock(session, tip, signal);
	const pt = await decrypt(root, '', ct);
	const dir = JSON.parse(new TextDecoder().decode(pt));
	rememberRootDir(dir, tip, session);
	return { tip, dir: structuredClone(dir) };
}

/**
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 */
export async function loadRootDir(session, signal) {
	const { dir } = await loadRootDirWithTip(session, signal);
	return dir;
}

/**
 * Decrypt a path using an already-loaded root dir (no tip round-trip).
 * @param {DriveSession} session
 * @param {any} dir
 * @param {string} logicalPath
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ bytes: Uint8Array, fileKeyHex: string }>}
 */
export async function getPathFromDir(session, dir, logicalPath, signal) {
	const name = normalizePath(logicalPath);
	const child = dir.children?.[name];
	if (!child) throw new Error(`path not found: ${logicalPath}`);
	const ciphertext = await getBlock(session, child.hash, signal);
	if (!child.wrapped_key) throw new Error('missing wrapped_key on entry');
	const bytes = await decryptWithKey(hexToBytes(child.wrapped_key), ciphertext);
	return { bytes, fileKeyHex: child.wrapped_key };
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {string} kind
 * @param {Uint8Array | string} plaintext
 */
export async function putPath(session, logicalPath, kind, plaintext) {
	await putPaths(session, [{ path: logicalPath, kind, plaintext }]);
}

/**
 * Write many logical paths with a single tip update (encrypt + putBlock in parallel).
 * Retries if tip moved between load and commit. Pass `rematerialize` for index docs
 * (e.g. chat/feed.json) so concurrent writers re-merge instead of clobbering ids.
 * @param {DriveSession} session
 * @param {{ path: string, kind: string, plaintext: Uint8Array | string }[]} entries
 * @param {{
 *   mergeFirst?: boolean,
 *   rematerialize?: (
 *     dir: any,
 *     entries: { path: string, kind: string, plaintext: Uint8Array | string }[]
 *   ) => Promise<{ path: string, kind: string, plaintext: Uint8Array | string }[]>
 * }} [opts]
 */
export async function putPaths(session, entries, opts = {}) {
	if (!entries?.length) return;
	const root = parseRootKey(session.rootKey);
	/** @type {{ path: string, kind: string, plaintext: Uint8Array | string }[]} */
	let current = entries;
	/** Reuse ciphertext across tip-conflict retries when plaintext unchanged (chat leaf). */
	/** @type {Map<string, { ptKey: string, row: { name: string, kind: string, hash: string, wrapped_key: string } }>} */
	const preparedByName = new Map();

	let dir = /** @type {any} */ (null);
	let dirHash = '';
	for (let attempt = 0; attempt < 3; attempt++) {
		const { tip: tipAtLoad, dir: fresh } = await loadRootDirWithTip(session);
		if ((attempt > 0 || opts.mergeFirst) && typeof opts.rematerialize === 'function') {
			current = await opts.rematerialize(fresh, current);
		}

		/** @type {{ name: string, kind: string, hash: string, wrapped_key: string }[]} */
		const prepared = await Promise.all(
			current.map(async (entry) => {
				const name = normalizePath(entry.path);
				if (!name) throw new Error('empty path');
				const bytes =
					typeof entry.plaintext === 'string'
						? new TextEncoder().encode(entry.plaintext)
						: entry.plaintext;
				const ptKey =
					typeof entry.plaintext === 'string'
						? entry.plaintext
						: await sha256Hex(bytes);
				const prev = preparedByName.get(name);
				if (prev && prev.ptKey === ptKey) return prev.row;
				const { ciphertext, fileKeyHex } = await encrypt(root, name, bytes);
				const hash = await sha256Hex(ciphertext);
				await putBlock(session, hash, ciphertext);
				const row = { name, kind: entry.kind, hash, wrapped_key: fileKeyHex };
				preparedByName.set(name, { ptKey, row });
				return row;
			})
		);

		dir = fresh;
		dir.schema = 'alpha.dir/1';
		dir.children = dir.children ?? {};
		for (const row of prepared) {
			dir.children[row.name] = {
				hash: row.hash,
				kind: row.kind,
				wrapped_key: row.wrapped_key
			};
		}

		const dirBytes = new TextEncoder().encode(JSON.stringify(dir));
		const dirCt = await encryptWithRoot(root, '', dirBytes);
		dirHash = await sha256Hex(dirCt);
		await putBlock(session, dirHash, dirCt);

		/* Tip moved under us — rematerialize indexes and retry. */
		if (attempt < 2) {
			let tipNow = tipAtLoad;
			try {
				tipNow = await getTip(session);
			} catch {
				/* proceed */
			}
			if (tipNow && tipAtLoad && tipNow !== tipAtLoad) {
				continue;
			}
		}

		await putTip(session, dirHash);
		break;
	}

	rememberRootDir(dir, dirHash, session);
	try {
		const { markTipApplied } = await import('./tip-gate.js');
		markTipApplied(session, dirHash);
	} catch {
		/* ignore */
	}

	/* Warm leaf cache so the next refresh skips re-download of what we just wrote. */
	try {
		const { putCachedLeaf } = await import('./leaf-cache.js');
		for (const entry of current) {
			const name = normalizePath(entry.path);
			const hash = dir.children?.[name]?.hash;
			if (!hash) continue;
			const doc =
				typeof entry.plaintext === 'string'
					? JSON.parse(entry.plaintext)
					: JSON.parse(new TextDecoder().decode(entry.plaintext));
			void putCachedLeaf(hash, doc);
		}
	} catch {
		/* non-JSON blobs (media) — ignore */
	}

	return dirHash;
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {AbortSignal} [signal]
 */
export async function getPath(session, logicalPath, signal) {
	const { bytes } = await getPathWithKey(session, logicalPath, signal);
	return bytes;
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ bytes: Uint8Array, fileKeyHex: string }>}
 */
export async function getPathWithKey(session, logicalPath, signal) {
	const dir = await loadRootDir(session, signal);
	return getPathFromDir(session, dir, logicalPath, signal);
}

/**
 * Remove logical paths from the root dir tip (orphan ciphertext may remain).
 * @param {DriveSession} session
 * @param {string | string[]} logicalPaths
 */
export async function deletePaths(session, logicalPaths) {
	const list = (Array.isArray(logicalPaths) ? logicalPaths : [logicalPaths])
		.map((p) => normalizePath(p))
		.filter(Boolean);
	if (!list.length) return;

	const root = parseRootKey(session.rootKey);
	const dir = await loadRootDir(session);
	dir.schema = 'alpha.dir/1';
	dir.children = dir.children ?? {};
	let removed = 0;
	for (const name of list) {
		if (dir.children[name]) {
			delete dir.children[name];
			removed += 1;
		}
	}
	if (!removed) return;

	const dirBytes = new TextEncoder().encode(JSON.stringify(dir));
	const dirCt = await encryptWithRoot(root, '', dirBytes);
	const dirHash = await sha256Hex(dirCt);
	await putBlock(session, dirHash, dirCt);
	await putTip(session, dirHash);
	rememberRootDir(dir, dirHash, session);
	try {
		const { markTipApplied } = await import('./tip-gate.js');
		markTipApplied(session, dirHash);
	} catch {
		/* ignore */
	}
}

/**
 * Encrypt under a caller-supplied file key (media manifest shares key with chunks).
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {string} kind
 * @param {Uint8Array | string} plaintext
 * @param {Uint8Array} fileKey 32 bytes
 */
export async function putPathWithKey(session, logicalPath, kind, plaintext, fileKey) {
	const root = parseRootKey(session.rootKey);
	const bytes =
		typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
	const ciphertext = await encryptWithKey(fileKey, bytes);
	const hash = await sha256Hex(ciphertext);
	await putBlock(session, hash, ciphertext);

	const dir = await loadRootDir(session);
	const name = normalizePath(logicalPath);
	if (!name) throw new Error('empty path');
	dir.schema = 'alpha.dir/1';
	dir.children = dir.children ?? {};
	dir.children[name] = {
		hash,
		kind,
		wrapped_key: bytesToHex(fileKey)
	};

	const dirBytes = new TextEncoder().encode(JSON.stringify(dir));
	const dirCt = await encryptWithRoot(root, '', dirBytes);
	const dirHash = await sha256Hex(dirCt);
	await putBlock(session, dirHash, dirCt);
	await putTip(session, dirHash);
	rememberRootDir(dir, dirHash, session);
	try {
		const { markTipApplied } = await import('./tip-gate.js');
		markTipApplied(session, dirHash);
	} catch {
		/* ignore */
	}
	return hash;
}

/**
 * @param {DriveSession} session
 */
export async function health(session) {
	const res = await fetch(`${session.url.replace(/\/$/, '')}/health`);
	if (!res.ok) throw new Error(`health: ${res.status}`);
	return (await res.text()).trim();
}
