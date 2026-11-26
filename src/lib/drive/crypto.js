/** Browser crypto matching alpha-drive Rust v0 (AES-256-GCM, SHA-256 path keys). */

function hexToBytes(hex) {
	const clean = hex.trim();
	if (clean.length % 2 !== 0) throw new Error('invalid hex');
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

function bytesToHex(bytes) {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {string} hexStr
 * @returns {Uint8Array}
 */
export function parseRootKey(hexStr) {
	const bytes = hexToBytes(hexStr);
	if (bytes.length !== 32) throw new Error(`root key must be 32 bytes, got ${bytes.length}`);
	return bytes;
}

/**
 * @param {Uint8Array} root
 * @param {string} path
 */
async function derivePathKey(root, path) {
	const enc = new TextEncoder();
	const prefix = enc.encode('alpha-drive/v0/');
	const pathBytes = enc.encode(path);
	const joined = new Uint8Array(prefix.length + root.length + pathBytes.length);
	joined.set(prefix, 0);
	joined.set(root, prefix.length);
	joined.set(pathBytes, prefix.length + root.length);
	const dig = await crypto.subtle.digest('SHA-256', joined);
	return new Uint8Array(dig);
}

/**
 * @param {Uint8Array} keyBytes
 */
async function importAesKey(keyBytes) {
	return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt'
	]);
}

/**
 * Cached AES-GCM CryptoKey per root+path (chat/mail append hits the same AAD every send).
 * Same ciphertext semantics — only skips repeated SHA-256 + importKey.
 * @type {Map<string, CryptoKey>}
 */
const pathAesKeyCache = new Map();

/**
 * @param {Uint8Array} root
 * @param {string} path
 */
async function pathAesKey(root, path) {
	const cacheKey = `${bytesToHex(root)}|${path}`;
	let key = pathAesKeyCache.get(cacheKey);
	if (key) return key;
	const keyBytes = await derivePathKey(root, path);
	key = await importAesKey(keyBytes);
	/* Bound growth if many paths ever appear; chat/mail + dir '' are the hot ones. */
	if (pathAesKeyCache.size > 64) pathAesKeyCache.clear();
	pathAesKeyCache.set(cacheKey, key);
	return key;
}

/**
 * Encrypt plaintext under a random file key. Returns { ciphertext: nonce||ct, fileKeyHex }.
 * @param {Uint8Array} _root
 * @param {string} _path
 * @param {Uint8Array} plaintext
 */
export async function encrypt(_root, _path, plaintext) {
	const fileKey = crypto.getRandomValues(new Uint8Array(32));
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const key = await importAesKey(fileKey);
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));
	const out = new Uint8Array(12 + ct.length);
	out.set(nonce, 0);
	out.set(ct, 12);
	return { ciphertext: out, fileKeyHex: bytesToHex(fileKey) };
}

/**
 * @param {Uint8Array} root
 * @param {string} path
 * @param {Uint8Array} plaintext
 */
export async function encryptWithRoot(root, path, plaintext) {
	const key = await pathAesKey(root, path);
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));
	const out = new Uint8Array(12 + ct.length);
	out.set(nonce, 0);
	out.set(ct, 12);
	return out;
}

/**
 * @param {Uint8Array} root
 * @param {string} path
 * @param {Uint8Array} ciphertext
 */
export async function decrypt(root, path, ciphertext) {
	if (ciphertext.length < 12) throw new Error('ciphertext too short');
	const key = await pathAesKey(root, path);
	const nonce = ciphertext.slice(0, 12);
	const ct = ciphertext.slice(12);
	return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
}

/**
 * @param {Uint8Array} keyBytes
 * @param {Uint8Array} ciphertext
 */
export async function decryptWithKey(keyBytes, ciphertext) {
	if (keyBytes.length !== 32) throw new Error('key must be 32 bytes');
	if (ciphertext.length < 12) throw new Error('ciphertext too short');
	const nonce = ciphertext.slice(0, 12);
	const ct = ciphertext.slice(12);
	const key = await importAesKey(keyBytes);
	return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
}

/**
 * Encrypt under a known 32-byte file key (media manifests share key with chunks).
 * @param {Uint8Array} fileKey
 * @param {Uint8Array} plaintext
 */
export async function encryptWithKey(fileKey, plaintext) {
	if (fileKey.length !== 32) throw new Error('key must be 32 bytes');
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const key = await importAesKey(fileKey);
	const ct = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext)
	);
	const out = new Uint8Array(12 + ct.length);
	out.set(nonce, 0);
	out.set(ct, 12);
	return out;
}

/** @param {number} chunkIndex */
function chunkAad(chunkIndex) {
	const aad = new Uint8Array(4);
	new DataView(aad.buffer).setUint32(0, chunkIndex >>> 0, true);
	return aad;
}

/**
 * Media chunk encrypt — AAD = LE u32 index (matches alpha-drive).
 * @param {Uint8Array} fileKey
 * @param {number} chunkIndex
 * @param {Uint8Array} plaintext
 */
export async function encryptChunk(fileKey, chunkIndex, plaintext) {
	if (fileKey.length !== 32) throw new Error('key must be 32 bytes');
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const key = await importAesKey(fileKey);
	const aad = chunkAad(chunkIndex);
	const ct = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv: nonce, additionalData: aad },
			key,
			plaintext
		)
	);
	const out = new Uint8Array(12 + ct.length);
	out.set(nonce, 0);
	out.set(ct, 12);
	return out;
}

/**
 * @param {Uint8Array} fileKey
 * @param {number} chunkIndex
 * @param {Uint8Array} ciphertext
 */
export async function decryptChunk(fileKey, chunkIndex, ciphertext) {
	if (fileKey.length !== 32) throw new Error('key must be 32 bytes');
	if (ciphertext.length < 12) throw new Error('chunk ciphertext too short');
	const nonce = ciphertext.slice(0, 12);
	const ct = ciphertext.slice(12);
	const key = await importAesKey(fileKey);
	const aad = chunkAad(chunkIndex);
	return new Uint8Array(
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: nonce, additionalData: aad },
			key,
			ct
		)
	);
}

/**
 * @param {Uint8Array} data
 */
export async function sha256Hex(data) {
	const dig = await crypto.subtle.digest('SHA-256', data);
	return bytesToHex(new Uint8Array(dig));
}

export { bytesToHex, hexToBytes };
