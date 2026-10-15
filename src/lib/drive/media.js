/** Chunked media blobs for Player — mirrors alpha-drive/src/media.rs */

import { getBlock, getPathWithKey, putBlock, putPathWithKey } from './client.js';
import { bytesToHex, decryptChunk, encryptChunk, hexToBytes, sha256Hex } from './crypto.js';

export const DEFAULT_CHUNK_SIZE = 256 * 1024;
const FETCH_CONCURRENCY = 8;

/**
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<void>} fn
 */
async function mapPool(items, limit, fn) {
	if (!items.length) return;
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
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
 * Decrypt one chunk given a loaded manifest + key.
 * @param {import('./client.js').DriveSession} session
 * @param {any} manifest
 * @param {string} fileKeyHex
 * @param {number} chunkIndex
 * @param {AbortSignal} [signal]
 */
export async function fetchDecryptChunk(session, manifest, fileKeyHex, chunkIndex, signal) {
	const meta = manifest.chunks.find((/** @type {{ i: number }} */ c) => c.i === chunkIndex);
	if (!meta) throw new Error(`chunk ${chunkIndex} not found`);
	const ct = await getBlock(session, meta.hash, signal);
	const pt = await decryptChunk(hexToBytes(fileKeyHex), chunkIndex, ct);
	if (pt.length !== meta.plain_len) throw new Error('chunk length mismatch');
	return pt;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {number} chunkIndex
 * @param {string} [fileKeyHex]
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
	return fetchDecryptChunk(session, man, keyHex, chunkIndex, signal);
}

/**
 * Fetch all chunks. Parallel download + abortable.
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {{ onProgress?: (doneBytes: number, totalBytes: number) => void, signal?: AbortSignal, manifest?: any, fileKeyHex?: string }} [opts]
 */
export async function getMediaBlob(session, manifestPath, opts = {}) {
	const parts = [];
	const { manifest } = await streamMediaChunks(session, manifestPath, {
		signal: opts.signal,
		onProgress: opts.onProgress,
		manifest: opts.manifest,
		fileKeyHex: opts.fileKeyHex,
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
 * Parallel prefetch with ordered delivery. Fetches chunk 0 first so play can start ASAP.
 * Fetch workers never block on SourceBuffer appends.
 * @param {import('./client.js').DriveSession} session
 * @param {string} manifestPath
 * @param {{
 *   onChunk: (index: number, bytes: Uint8Array, manifest: any) => void | Promise<void>,
 *   onProgress?: (doneBytes: number, totalBytes: number) => void,
 *   signal?: AbortSignal,
 *   manifest?: any,
 *   fileKeyHex?: string
 * }} opts
 */
export async function streamMediaChunks(session, manifestPath, opts) {
	const loaded =
		opts.manifest && opts.fileKeyHex
			? { manifest: opts.manifest, fileKeyHex: opts.fileKeyHex }
			: await loadMediaManifest(session, manifestPath, opts.signal);
	const { manifest, fileKeyHex } = loaded;
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

	/**
	 * @param {{ i: number, hash: string, plain_len: number }} meta
	 */
	async function fetchOne(meta) {
		throwIfAborted(opts.signal);
		const ct = await getBlock(session, meta.hash, opts.signal);
		const pt = await decryptChunk(fileKey, meta.i, ct);
		if (pt.length !== meta.plain_len) throw new Error('chunk length mismatch');
		parts[meta.i] = pt;
		// Do not await — keep the download pool saturated while MSE appends.
		void scheduleDeliver();
	}

	// Chunk 0 first — unblocks play while the rest prefetch.
	if (n > 0) {
		await fetchOne(manifest.chunks[0]);
		await deliverChain;
	}

	if (n > 1) {
		await mapPool(manifest.chunks.slice(1), FETCH_CONCURRENCY, fetchOne);
		await deliverChain;
	}

	throwIfAborted(opts.signal);
	return { manifest, fileKeyHex };
}

/** @returns {typeof MediaSource | null} */
export function mediaSourceCtor() {
	if (typeof window === 'undefined') return null;
	// iOS 17.1+ progressive path
	const managed = /** @type {any} */ (window).ManagedMediaSource;
	if (managed) return managed;
	return typeof MediaSource !== 'undefined' ? MediaSource : null;
}

/**
 * MIME type usable with MediaSource for progressive append, or null.
 * Prefer trying audio/mpeg for unknown types — raw uploads often lack a real MIME.
 * @param {string} contentType
 */
export function mseMimeForContentType(contentType) {
	const MS = mediaSourceCtor();
	if (!MS) return null;
	const ct = (contentType || '').toLowerCase();

	/** @param {string} mime */
	const supported = (mime) => {
		try {
			return typeof MS.isTypeSupported === 'function' ? MS.isTypeSupported(mime) : true;
		} catch {
			return false;
		}
	};

	if (ct.includes('ogg') || ct.includes('opus')) {
		const mime = ct.includes('opus') ? 'audio/webm; codecs="opus"' : 'audio/ogg';
		return supported(mime) ? mime : null;
	}
	if (ct.includes('mp4') || ct.includes('m4a') || ct.includes('aac')) {
		for (const mime of ['audio/mp4', 'audio/mp4; codecs="mp4a.40.2"']) {
			if (supported(mime)) return mime;
		}
		return null;
	}
	// flac / wav: MSE usually unsupported — caller falls back to full blob
	if (ct.includes('flac') || ct.includes('wav') || ct.includes('x-wav')) return null;

	// mp3 + unknown / octet-stream (most library uploads)
	if (supported('audio/mpeg')) return 'audio/mpeg';
	// Some engines report false then still accept addSourceBuffer — try anyway for likely-mp3.
	if (
		!ct ||
		ct.includes('mpeg') ||
		ct.includes('mp3') ||
		ct.includes('octet-stream') ||
		ct === 'application/octet-stream'
	) {
		return 'audio/mpeg';
	}
	return null;
}
