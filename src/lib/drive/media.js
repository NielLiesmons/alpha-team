/** Chunked media blobs for Player — mirrors alpha-drive/src/media.rs */

import { getBlock, getPathWithKey, putBlock, putPathWithKey } from './client.js';
import { bytesToHex, decryptChunk, encryptChunk, hexToBytes, sha256Hex } from './crypto.js';

export const DEFAULT_CHUNK_SIZE = 256 * 1024;

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {string} contentType
 * @param {Uint8Array} plaintext
 * @param {{ chunkSize?: number, onProgress?: (done: number, total: number) => void }} [opts]
 */
export async function putMediaBlob(session, manifestPath, contentType, plaintext, opts = {}) {
	const chunkSize = Math.max(opts.chunkSize ?? DEFAULT_CHUNK_SIZE, 64 * 1024);
	const fileKey = crypto.getRandomValues(new Uint8Array(32));
	/** @type {{ i: number, hash: string, plain_len: number }[]} */
	const chunks = [];
	const total = Math.max(1, Math.ceil(plaintext.length / chunkSize) || 1);
	let offset = 0;
	let i = 0;
	while (offset < plaintext.length) {
		const end = Math.min(offset + chunkSize, plaintext.length);
		const slice = plaintext.subarray(offset, end);
		const ct = await encryptChunk(fileKey, i, slice);
		const hash = await sha256Hex(ct);
		await putBlock(session, hash, ct);
		chunks.push({ i, hash, plain_len: slice.length });
		offset = end;
		i += 1;
		opts.onProgress?.(i, Math.max(total, i));
	}
	if (plaintext.length === 0) {
		opts.onProgress?.(0, 0);
	}

	const manifest = {
		schema: 'alpha.media_blob/1',
		chunk_size: chunkSize,
		plaintext_len: plaintext.length,
		content_type: contentType,
		chunks
	};
	await putPathWithKey(
		session,
		manifestPath,
		'media',
		JSON.stringify(manifest, null, 2),
		fileKey
	);
	return { manifest, fileKeyHex: bytesToHex(fileKey) };
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 */
export async function loadMediaManifest(session, manifestPath) {
	const { bytes, fileKeyHex } = await getPathWithKey(session, manifestPath);
	const manifest = JSON.parse(new TextDecoder().decode(bytes));
	return { manifest, fileKeyHex };
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {number} chunkIndex
 * @param {string} [fileKeyHex] skip re-reading manifest if known
 * @param {any} [manifest]
 */
export async function getMediaChunk(session, manifestPath, chunkIndex, fileKeyHex, manifest) {
	let keyHex = fileKeyHex;
	let man = manifest;
	if (!keyHex || !man) {
		const loaded = await loadMediaManifest(session, manifestPath);
		keyHex = loaded.fileKeyHex;
		man = loaded.manifest;
	}
	const meta = man.chunks.find((/** @type {{ i: number }} */ c) => c.i === chunkIndex);
	if (!meta) throw new Error(`chunk ${chunkIndex} not found`);
	const ct = await getBlock(session, meta.hash);
	return decryptChunk(hexToBytes(keyHex), chunkIndex, ct);
}

/**
 * Fetch all chunks (Player play). Reports progress.
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {{ onProgress?: (done: number, total: number) => void }} [opts]
 */
export async function getMediaBlob(session, manifestPath, opts = {}) {
	const { manifest, fileKeyHex } = await loadMediaManifest(session, manifestPath);
	const fileKey = hexToBytes(fileKeyHex);
	const parts = [];
	const total = manifest.chunks.length;
	for (const meta of manifest.chunks) {
		const ct = await getBlock(session, meta.hash);
		const pt = await decryptChunk(fileKey, meta.i, ct);
		if (pt.length !== meta.plain_len) throw new Error('chunk length mismatch');
		parts.push(pt);
		opts.onProgress?.(meta.i + 1, total);
	}
	const out = new Uint8Array(manifest.plaintext_len);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return { manifest, bytes: out };
}
