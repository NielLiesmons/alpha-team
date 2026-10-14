/** Chunked media blobs for Player — mirrors alpha-drive/src/media.rs */

import { getBlock, getPathWithKey, putBlock, putPathWithKey } from './client.js';
import { bytesToHex, decryptChunk, encryptChunk, hexToBytes, sha256Hex } from './crypto.js';

export const DEFAULT_CHUNK_SIZE = 256 * 1024;
const FETCH_CONCURRENCY = 6;

/**
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<void>} fn
 */
async function mapPool(items, limit, fn) {
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
		while (next < items.length) {
			const i = next++;
			await fn(items[i], i);
		}
	});
	await Promise.all(workers);
}

/**
 * @param {AbortSignal} [signal]
 */
function throwIfAborted(signal) {
	if (signal?.aborted) {
		const err = new Error('Aborted');
		err.name = 'AbortError';
		throw err;
	}
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {string} contentType
 * @param {Uint8Array} plaintext
 * @param {{ chunkSize?: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} [opts]
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
		throwIfAborted(opts.signal);
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
 * @param {AbortSignal} [signal]
 */
export async function loadMediaManifest(session, manifestPath, signal) {
	const { bytes, fileKeyHex } = await getPathWithKey(session, manifestPath, signal);
	const manifest = JSON.parse(new TextDecoder().decode(bytes));
	return { manifest, fileKeyHex };
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {number} chunkIndex
 * @param {string} [fileKeyHex] skip re-reading manifest if known
 * @param {any} [manifest]
 * @param {AbortSignal} [signal]
 */
export async function getMediaChunk(
	session,
	manifestPath,
	chunkIndex,
	fileKeyHex,
	manifest,
	signal
) {
	let keyHex = fileKeyHex;
	let man = manifest;
	if (!keyHex || !man) {
		const loaded = await loadMediaManifest(session, manifestPath, signal);
		keyHex = loaded.fileKeyHex;
		man = loaded.manifest;
	}
	const meta = man.chunks.find((/** @type {{ i: number }} */ c) => c.i === chunkIndex);
	if (!meta) throw new Error(`chunk ${chunkIndex} not found`);
	const ct = await getBlock(session, meta.hash, signal);
	return decryptChunk(hexToBytes(keyHex), chunkIndex, ct);
}

/**
 * Fetch all chunks. Parallel download + abortable.
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {{ onProgress?: (doneBytes: number, totalBytes: number) => void, signal?: AbortSignal }} [opts]
 */
export async function getMediaBlob(session, manifestPath, opts = {}) {
	const parts = [];
	const { manifest } = await streamMediaChunks(session, manifestPath, {
		signal: opts.signal,
		onProgress: opts.onProgress,
		onChunk: async (_i, bytes) => {
			parts.push(bytes);
		}
	});
	const out = new Uint8Array(Number(manifest.plaintext_len) || parts.reduce((n, p) => n + p.length, 0));
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	opts.onProgress?.(out.length, out.length);
	return { manifest, bytes: out };
}

/**
 * Parallel prefetch, ordered delivery — for play-while-buffering (MSE).
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {{
 *   onChunk: (index: number, bytes: Uint8Array, manifest: any) => void | Promise<void>,
 *   onProgress?: (doneBytes: number, totalBytes: number) => void,
 *   signal?: AbortSignal
 * }} opts
 */
export async function streamMediaChunks(session, manifestPath, opts) {
	const { manifest, fileKeyHex } = await loadMediaManifest(session, manifestPath, opts.signal);
	const fileKey = hexToBytes(fileKeyHex);
	const totalBytes = Number(manifest.plaintext_len) || 0;
	const n = manifest.chunks.length;
	/** @type {(Uint8Array | null)[]} */
	const parts = new Array(n).fill(null);
	let nextDeliver = 0;
	let doneBytes = 0;
	/** @type {Promise<void>} */
	let deliverChain = Promise.resolve();

	const scheduleDeliver = () => {
		deliverChain = deliverChain.then(async () => {
			while (nextDeliver < n && parts[nextDeliver]) {
				throwIfAborted(opts.signal);
				const i = nextDeliver++;
				const pt = parts[i];
				doneBytes += pt.length;
				opts.onProgress?.(Math.min(doneBytes, totalBytes || doneBytes), totalBytes || doneBytes);
				await opts.onChunk(i, pt, manifest);
			}
		});
		return deliverChain;
	};

	await mapPool(manifest.chunks, FETCH_CONCURRENCY, async (meta) => {
		throwIfAborted(opts.signal);
		const ct = await getBlock(session, meta.hash, opts.signal);
		const pt = await decryptChunk(fileKey, meta.i, ct);
		if (pt.length !== meta.plain_len) throw new Error('chunk length mismatch');
		parts[meta.i] = pt;
		await scheduleDeliver();
	});

	await deliverChain;
	throwIfAborted(opts.signal);
	return { manifest, fileKeyHex };
}

/**
 * MIME type usable with MediaSource for progressive append, or null.
 * @param {string} contentType
 */
export function mseMimeForContentType(contentType) {
	const ct = (contentType || '').toLowerCase();
	if (ct.includes('mpeg') || ct === 'audio/mp3' || ct.endsWith('/mp3')) {
		return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')
			? 'audio/mpeg'
			: null;
	}
	if (ct.includes('ogg') || ct.includes('opus')) {
		const mime = ct.includes('opus') ? 'audio/webm; codecs="opus"' : 'audio/ogg';
		return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime) ? mime : null;
	}
	// Whole-file M4A from iTunes is not fragmented — MSE usually fails.
	return null;
}
