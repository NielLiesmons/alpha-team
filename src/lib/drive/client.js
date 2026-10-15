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
	await api(session, 'PUT', `/v1/blocks/${hash}`, ciphertext);
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
	const root = parseRootKey(session.rootKey);
	const bytes =
		typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
	const { ciphertext, fileKeyHex } = await encrypt(root, logicalPath, bytes);
	const hash = await sha256Hex(ciphertext);
	await putBlock(session, hash, ciphertext);

	const dir = await loadRootDir(session);
	const name = normalizePath(logicalPath);
	if (!name) throw new Error('empty path');
	dir.schema = 'alpha.dir/1';
	dir.children = dir.children ?? {};
	dir.children[name] = { hash, kind, wrapped_key: fileKeyHex };

	const dirBytes = new TextEncoder().encode(JSON.stringify(dir));
	const dirCt = await encryptWithRoot(root, '', dirBytes);
	const dirHash = await sha256Hex(dirCt);
	await putBlock(session, dirHash, dirCt);
	await putTip(session, dirHash);
	rememberRootDir(dir, dirHash, session);
	return hash;
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
