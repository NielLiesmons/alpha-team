/**
 * Client-side thumb + blurhash for Photos / chat media.
 * Browser canvas only — no native deps.
 */

import { encode } from 'blurhash';

const THUMB_MAX = 320;
const THUMB_JPEG_Q = 0.72;
const BLUR_X = 4;
const BLUR_Y = 3;

/**
 * @typedef {{
 *   thumbBytes: Uint8Array,
 *   thumbType: string,
 *   blurhash: string,
 *   width: number,
 *   height: number
 * }} MediaPreview
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} w
 * @param {number} h
 */
function blurhashFromCanvas(canvas, w, h) {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d');
	const { data } = ctx.getImageData(0, 0, w, h);
	return encode(data, w, h, BLUR_X, BLUR_Y);
}

/**
 * @param {CanvasImageSource} source
 * @param {number} srcW
 * @param {number} srcH
 * @returns {Promise<MediaPreview>}
 */
async function rasterize(source, srcW, srcH) {
	const scale = Math.min(1, THUMB_MAX / Math.max(srcW, srcH, 1));
	const w = Math.max(1, Math.round(srcW * scale));
	const h = Math.max(1, Math.round(srcH * scale));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d');
	ctx.drawImage(source, 0, 0, w, h);
	const blurhash = blurhashFromCanvas(canvas, w, h);
	const blob = await new Promise((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('thumb encode failed'))),
			'image/jpeg',
			THUMB_JPEG_Q
		);
	});
	const buf = new Uint8Array(await blob.arrayBuffer());
	return {
		thumbBytes: buf,
		thumbType: 'image/jpeg',
		blurhash,
		width: srcW,
		height: srcH
	};
}

/**
 * @param {Blob | File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
	const url = URL.createObjectURL(file);
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('image decode failed'));
		};
		img.src = url;
	});
}

/**
 * @param {Blob | File} file
 * @returns {Promise<{ video: HTMLVideoElement, url: string }>}
 */
function loadVideo(file) {
	const url = URL.createObjectURL(file);
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		video.preload = 'metadata';
		video.muted = true;
		video.playsInline = true;
		video.onloadeddata = () => resolve({ video, url });
		video.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('video decode failed'));
		};
		video.src = url;
	});
}

/**
 * Build a JPEG thumb + blurhash for an image or video File.
 * Returns null when the browser cannot decode (e.g. HEIC).
 * @param {Blob | File} file
 * @param {'image' | 'video' | string} kind
 * @returns {Promise<MediaPreview | null>}
 */
export async function generateMediaPreview(file, kind) {
	if (typeof document === 'undefined') return null;
	try {
		if (kind === 'video') {
			const { video, url } = await loadVideo(file);
			try {
				await video.play().catch(() => {});
				video.pause();
				video.currentTime = Math.min(0.1, (video.duration || 1) * 0.05);
				await new Promise((r) => {
					video.onseeked = () => r(null);
					setTimeout(() => r(null), 800);
				});
				const w = video.videoWidth || 320;
				const h = video.videoHeight || 180;
				return await rasterize(video, w, h);
			} finally {
				URL.revokeObjectURL(url);
				video.src = '';
			}
		}
		if (kind === 'image') {
			const img = await loadImage(file);
			return await rasterize(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
		}
	} catch {
		return null;
	}
	return null;
}

/**
 * Paint a blurhash into a canvas (cover-fit).
 * @param {HTMLCanvasElement} canvas
 * @param {string} hash
 * @param {number} [punch]
 */
export async function paintBlurhash(canvas, hash, punch = 1) {
	if (!hash || !canvas) return;
	const { decode } = await import('blurhash');
	const w = 32;
	const h = 32;
	let pixels;
	try {
		pixels = decode(hash, w, h, punch);
	} catch {
		return;
	}
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const imageData = ctx.createImageData(w, h);
	imageData.data.set(pixels);
	ctx.putImageData(imageData, 0, 0);
}

/**
 * @param {MediaPreview} preview
 * @param {string} [thumbName]
 */
export function previewJsonDoc(preview, thumbName = 'thumb.jpg') {
	return {
		schema: 'alpha.media_preview/1',
		blurhash: preview.blurhash,
		width: preview.width,
		height: preview.height,
		thumb: thumbName,
		content_type: preview.thumbType
	};
}
