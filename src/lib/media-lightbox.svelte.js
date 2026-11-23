/**
 * App-wide fullscreen media viewer (Photos grid, chat attachments, …).
 */

/**
 * @typedef {{
 *   id: string,
 *   kind: 'image' | 'video',
 *   name: string,
 *   path?: string,
 *   url?: string,
 *   previewUrl?: string
 * }} MediaLightboxItem
 */

export const mediaLightbox = $state({
	open: false,
	/** @type {MediaLightboxItem[]} */
	items: [],
	index: 0
});

/**
 * @param {MediaLightboxItem[]} items
 * @param {number} [index]
 */
export function openMediaLightbox(items, index = 0) {
	const list = Array.isArray(items) ? items.filter(Boolean) : [];
	if (!list.length) return;
	const i = Math.max(0, Math.min(list.length - 1, Number(index) || 0));
	mediaLightbox.items = list;
	mediaLightbox.index = i;
	mediaLightbox.open = true;
}

export function closeMediaLightbox() {
	mediaLightbox.open = false;
	mediaLightbox.items = [];
	mediaLightbox.index = 0;
}

/** @param {number} delta */
export function stepMediaLightbox(delta) {
	const n = mediaLightbox.items.length;
	if (n < 2) return;
	mediaLightbox.index = (mediaLightbox.index + delta + n * 10) % n;
}
