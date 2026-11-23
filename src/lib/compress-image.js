/**
 * Client-side image compression for chat / Photos uploads.
 * Default: chat-friendly max edge + JPEG quality. HD skips resize.
 */

/** Chat-app-friendly longest edge (not full HD). */
export const COMPRESS_MAX_EDGE = 1600;
/** JPEG / WebP quality for compressed uploads. */
export const COMPRESS_QUALITY = 0.82;
/** Soft cap even for HD so absurd phone dumps don’t block the Drive. */
export const HD_MAX_EDGE = 4096;

/**
 * @param {File | Blob} file
 * @returns {boolean}
 */
export function isCompressibleImage(file) {
	const type = String(file?.type || '').toLowerCase();
	if (!type.startsWith('image/')) return false;
	/* Animated GIF / SVG stay as-is. */
	if (type === 'image/gif' || type === 'image/svg+xml') return false;
	if (type.includes('heic') || type.includes('heif')) return false;
	return true;
}

/**
 * @param {File | Blob} file
 * @param {{
 *   hd?: boolean,
 *   maxEdge?: number,
 *   quality?: number
 * }} [opts]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, opts = {}) {
	if (!(file instanceof Blob) || !isCompressibleImage(file)) {
		return file instanceof File ? file : new File([file], 'image.jpg', { type: file.type || 'image/jpeg' });
	}

	/* HD = keep original bytes (user opted into larger quality). */
	if (opts.hd) {
		return file instanceof File ? file : new File([file], 'image.jpg', { type: file.type || 'image/jpeg' });
	}

	const maxEdge = opts.maxEdge ?? COMPRESS_MAX_EDGE;
	const quality = opts.quality ?? COMPRESS_QUALITY;

	/** @type {number} */
	let width;
	/** @type {number} */
	let height;
	/** @type {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} */
	let draw;
	/** @type {ImageBitmap | null} */
	let bitmap = null;

	try {
		bitmap = await createImageBitmap(file);
		width = bitmap.width;
		height = bitmap.height;
		draw = (ctx, w, h) => {
			ctx.drawImage(/** @type {ImageBitmap} */ (bitmap), 0, 0, w, h);
		};
	} catch {
		const url = URL.createObjectURL(file);
		try {
			const img = await new Promise((resolve, reject) => {
				const el = new Image();
				el.onload = () => resolve(el);
				el.onerror = () => reject(new Error('image decode failed'));
				el.src = url;
			});
			width = img.naturalWidth || img.width;
			height = img.naturalHeight || img.height;
			draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h);
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	if (!width || !height) {
		bitmap?.close?.();
		return file instanceof File ? file : new File([file], 'image.jpg', { type: 'image/jpeg' });
	}

	const longest = Math.max(width, height);
	/* Skip work when already small JPEG under the edge. */
	if (longest <= maxEdge && file.type === 'image/jpeg' && file.size < 900 * 1024) {
		bitmap?.close?.();
		return file instanceof File ? file : new File([file], 'image.jpg', { type: 'image/jpeg' });
	}

	const scale = Math.min(1, maxEdge / longest);
	const w = Math.max(1, Math.round(width * scale));
	const h = Math.max(1, Math.round(height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap?.close?.();
		return file instanceof File ? file : new File([file], 'image.jpg', { type: 'image/jpeg' });
	}
	draw(ctx, w, h);
	bitmap?.close?.();

	const preferWebp =
		typeof canvas.toBlob === 'function' &&
		typeof HTMLCanvasElement !== 'undefined' &&
		/* Safari can encode webp in modern versions; fall back to jpeg. */
		true;
	/** @type {Blob | null} */
	let blob = null;
	if (preferWebp) {
		blob = await new Promise((resolve) => {
			canvas.toBlob((b) => resolve(b), 'image/webp', quality);
		});
	}
	if (!blob || blob.size === 0) {
		blob = await new Promise((resolve, reject) => {
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error('jpeg encode failed'))),
				'image/jpeg',
				quality
			);
		});
	}

	const baseName =
		(file instanceof File && file.name ? file.name : 'image')
			.replace(/\.[^.]+$/, '')
			.replace(/[^\w.\-]+/g, '_')
			.slice(0, 72) || 'image';
	const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
	return new File([blob], `${baseName}.${ext}`, {
		type: blob.type,
		lastModified: file instanceof File ? file.lastModified : Date.now()
	});
}
