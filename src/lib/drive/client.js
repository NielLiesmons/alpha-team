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
 */
async function api(session, method, path, body, contentType) {
	const headers = { Authorization: `Bearer ${session.token}` };
	if (contentType) headers['Content-Type'] = contentType;
	const res = await fetch(`${session.url.replace(/\/$/, '')}${path}`, {
		method,
		headers,
		body
	});
	if (!res.ok) {
		throw new Error(`${method} ${path}: ${res.status}`);
	}
	return res;
}

/**
 * @param {DriveSession} session
 */
export async function getTip(session) {
	const res = await api(session, 'GET', '/v1/tip');
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
 */
export async function getBlock(session, hash) {
	const res = await api(session, 'GET', `/v1/blocks/${hash}`);
	return new Uint8Array(await res.arrayBuffer());
}

/**
 * @param {DriveSession} session
 */
export async function loadRootDir(session) {
	const root = parseRootKey(session.rootKey);
	let tip;
	try {
		tip = await getTip(session);
	} catch {
		return { schema: 'alpha.dir/1', children: {} };
	}
	if (!tip) return { schema: 'alpha.dir/1', children: {} };
	const ct = await getBlock(session, tip);
	const pt = await decrypt(root, '', ct);
	return JSON.parse(new TextDecoder().decode(pt));
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
	return hash;
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 */
export async function getPath(session, logicalPath) {
	const { bytes } = await getPathWithKey(session, logicalPath);
	return bytes;
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @returns {Promise<{ bytes: Uint8Array, fileKeyHex: string }>}
 */
export async function getPathWithKey(session, logicalPath) {
	const dir = await loadRootDir(session);
	const name = normalizePath(logicalPath);
	const child = dir.children?.[name];
	if (!child) throw new Error(`path not found: ${logicalPath}`);
	const ciphertext = await getBlock(session, child.hash);
	if (!child.wrapped_key) throw new Error('missing wrapped_key on entry');
	const bytes = await decryptWithKey(hexToBytes(child.wrapped_key), ciphertext);
	return { bytes, fileKeyHex: child.wrapped_key };
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
