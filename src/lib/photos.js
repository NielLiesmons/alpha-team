/**
 * Photos library helpers — browse media/photos + media/video (+ legacy chat/media).
 */

import { inferMediaKind, isMediaManifestPath } from './drive/media-kind.js';
import { activityTimeBucket } from './chat-activity.svelte.js';

/**
 * @typedef {{
 *   key: string,
 *   path: string,
 *   kind: 'image' | 'video',
 *   name: string,
 *   source: 'photos' | 'video' | 'chat',
 *   at: number,
 *   thumbPath?: string,
 *   previewPath?: string
 * }} PhotoItem
 */

/**
 * @param {string} path
 * @param {string | null | undefined} displayName
 */
function itemName(path, displayName) {
	if (displayName && displayName.trim()) return displayName.trim();
	const leaf = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
	if (leaf === 'media.json' || leaf === 'preview.json' || leaf === 'thumb.jpg') {
		const parts = path.split('/');
		return parts.length >= 2 ? parts[parts.length - 2] : leaf;
	}
	return leaf;
}

/**
 * Best-effort capture/upload time from a display name / filename.
 * @param {string} name
 * @returns {number}
 */
export function parsePhotoTimeFromName(name) {
	const s = String(name || '');
	/* IMG_20241123 / PXL_20241123_123456 / VID_20241123 */
	let m = s.match(/(?:^|[^\d])((?:19|20)\d{2})(\d{2})(\d{2})(?:[^\d]|$)/);
	if (m) {
		const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
		if (Number.isFinite(t)) return t;
	}
	/* 2024-11-23 / 2024_11_23 / 2024.11.23 */
	m = s.match(/(?:^|[^\d])((?:19|20)\d{2})[-_.](\d{2})[-_.](\d{2})(?:[^\d]|$)/);
	if (m) {
		const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
		if (Number.isFinite(t)) return t;
	}
	return 0;
}

/**
 * @param {string | null | undefined} iso
 * @returns {number}
 */
function parseIsoMs(iso) {
	if (!iso) return 0;
	const t = Date.parse(String(iso));
	return Number.isFinite(t) ? t : 0;
}

/**
 * @param {PhotoItem | undefined} prev
 * @param {string} mediaPath
 */
function preferMediaPath(prev, mediaPath) {
	if (!prev?.path) return mediaPath;
	if (isMediaManifestPath(mediaPath)) return mediaPath;
	if (isMediaManifestPath(prev.path)) return prev.path;
	return prev.path;
}

/**
 * Collapse Drive entries into one gallery tile per media id / leaf.
 * @param {{ path: string, kind?: string, display_name?: string | null, created_at?: string | null }[]} entries
 * @returns {PhotoItem[]}
 */
export function listPhotoItems(entries) {
	/** @type {Map<string, PhotoItem>} */
	const map = new Map();

	/**
	 * @param {string} key
	 * @param {{
	 *   kind: 'image' | 'video',
	 *   name: string,
	 *   source: PhotoItem['source'],
	 *   at?: number,
	 *   mediaPath?: string,
	 *   thumbPath?: string,
	 *   previewPath?: string
	 * }} patch
	 */
	function patchItem(key, patch) {
		const prev = map.get(key);
		const path = patch.mediaPath
			? preferMediaPath(prev, patch.mediaPath)
			: prev?.path || patch.thumbPath || patch.previewPath || '';
		const at = Math.max(prev?.at || 0, patch.at || 0, parsePhotoTimeFromName(patch.name || prev?.name || ''));
		map.set(key, {
			key,
			path,
			kind: patch.kind || prev?.kind || 'image',
			name: patch.name || prev?.name || key,
			source: patch.source || prev?.source || 'photos',
			at,
			thumbPath: patch.thumbPath || prev?.thumbPath,
			previewPath: patch.previewPath || prev?.previewPath
		});
	}

	for (const e of entries) {
		const path = String(e?.path || '');
		if (!path) continue;
		const name = itemName(path, e.display_name);
		const at = Math.max(parseIsoMs(e.created_at), parsePhotoTimeFromName(name));

		let m = path.match(/^media\/photos\/([^/]+)\/(.+)$/);
		if (m) {
			const id = m[1];
			const rest = m[2];
			if (rest.includes('/')) continue;
			const key = `photos:${id}`;
			if (rest === 'thumb.jpg') {
				patchItem(key, { kind: 'image', name, source: 'photos', at, thumbPath: path });
				continue;
			}
			if (rest === 'preview.json') {
				patchItem(key, { kind: 'image', name, source: 'photos', at, previewPath: path });
				continue;
			}
			patchItem(key, { kind: 'image', name, source: 'photos', at, mediaPath: path });
			continue;
		}

		if (/^media\/photos\/[^/]+$/.test(path)) {
			const leaf = path.slice('media/photos/'.length);
			if (leaf === 'thumb.jpg' || leaf === 'preview.json' || leaf === 'media.json') continue;
			const kind = inferMediaKind({ name: leaf, path });
			if (kind !== 'image' && kind !== 'video') continue;
			patchItem(`photos-flat:${leaf}`, {
				kind,
				name,
				source: 'photos',
				at,
				mediaPath: path
			});
			continue;
		}

		m = path.match(/^media\/video\/items\/([^/]+)\/(.+)$/);
		if (m) {
			const id = m[1];
			const rest = m[2];
			if (rest.includes('/')) continue;
			const key = `video:${id}`;
			if (rest === 'thumb.jpg') {
				patchItem(key, { kind: 'video', name, source: 'video', at, thumbPath: path });
				continue;
			}
			if (rest === 'preview.json') {
				patchItem(key, { kind: 'video', name, source: 'video', at, previewPath: path });
				continue;
			}
			patchItem(key, { kind: 'video', name, source: 'video', at, mediaPath: path });
			continue;
		}

		m = path.match(/^chat\/media\/([^/]+)\/(.+)$/);
		if (m) {
			const id = m[1];
			const rest = m[2];
			if (rest.includes('/')) continue;
			const key = `chat:${id}`;
			if (rest === 'thumb.jpg') {
				patchItem(key, { kind: 'image', name, source: 'chat', at, thumbPath: path });
				continue;
			}
			if (rest === 'preview.json') {
				patchItem(key, { kind: 'image', name, source: 'chat', at, previewPath: path });
				continue;
			}
			if (rest === 'media.json') {
				patchItem(key, { kind: 'image', name, source: 'chat', at, mediaPath: path });
				continue;
			}
			const kind = inferMediaKind({ name: rest, path });
			if (kind !== 'image' && kind !== 'video') continue;
			patchItem(key, { kind, name, source: 'chat', at, mediaPath: path });
		}
	}

	return [...map.values()]
		.filter(
			(it) =>
				it.path &&
				!it.path.endsWith('/thumb.jpg') &&
				!it.path.endsWith('/preview.json')
		)
		.sort((a, b) => b.at - a.at || b.path.localeCompare(a.path));
}

/**
 * Group newest-first photos into TODAY / THIS WEEK / THIS MONTH / EARLIER.
 * Empty buckets are omitted. Same buckets as Chat activity feed.
 * @param {PhotoItem[]} items
 * @param {number} [now]
 * @returns {{ key: 'today' | 'week' | 'month' | 'earlier', items: PhotoItem[] }[]}
 */
export function groupPhotosByTime(items, now = Date.now()) {
	/** @type {Record<'today' | 'week' | 'month' | 'earlier', PhotoItem[]>} */
	const buckets = { today: [], week: [], month: [], earlier: [] };
	for (const item of items) {
		const key = item.at > 0 ? activityTimeBucket(item.at, now) : 'earlier';
		buckets[key].push(item);
	}
	/** @type {('today' | 'week' | 'month' | 'earlier')[]} */
	const order = ['today', 'week', 'month', 'earlier'];
	return order
		.filter((k) => buckets[k].length > 0)
		.map((k) => ({ key: k, items: buckets[k] }));
}
