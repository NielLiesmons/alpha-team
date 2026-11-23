/**
 * Photos library helpers — browse media/photos + media/video (+ legacy chat/media).
 */

import { inferMediaKind, isMediaManifestPath } from './drive/media-kind.js';

/**
 * @typedef {{
 *   key: string,
 *   path: string,
 *   kind: 'image' | 'video',
 *   name: string,
 *   source: 'photos' | 'video' | 'chat',
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
 * @param {{ path: string, kind?: string, display_name?: string | null }[]} entries
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
		map.set(key, {
			key,
			path,
			kind: patch.kind || prev?.kind || 'image',
			name: patch.name || prev?.name || key,
			source: patch.source || prev?.source || 'photos',
			thumbPath: patch.thumbPath || prev?.thumbPath,
			previewPath: patch.previewPath || prev?.previewPath
		});
	}

	for (const e of entries) {
		const path = String(e?.path || '');
		if (!path) continue;
		const name = itemName(path, e.display_name);

		let m = path.match(/^media\/photos\/([^/]+)\/(.+)$/);
		if (m) {
			const id = m[1];
			const rest = m[2];
			if (rest.includes('/')) continue;
			const key = `photos:${id}`;
			if (rest === 'thumb.jpg') {
				patchItem(key, { kind: 'image', name, source: 'photos', thumbPath: path });
				continue;
			}
			if (rest === 'preview.json') {
				patchItem(key, { kind: 'image', name, source: 'photos', previewPath: path });
				continue;
			}
			patchItem(key, { kind: 'image', name, source: 'photos', mediaPath: path });
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
				patchItem(key, { kind: 'video', name, source: 'video', thumbPath: path });
				continue;
			}
			if (rest === 'preview.json') {
				patchItem(key, { kind: 'video', name, source: 'video', previewPath: path });
				continue;
			}
			patchItem(key, { kind: 'video', name, source: 'video', mediaPath: path });
			continue;
		}

		m = path.match(/^chat\/media\/([^/]+)\/(.+)$/);
		if (m) {
			const id = m[1];
			const rest = m[2];
			if (rest.includes('/')) continue;
			const key = `chat:${id}`;
			if (rest === 'thumb.jpg') {
				patchItem(key, { kind: 'image', name, source: 'chat', thumbPath: path });
				continue;
			}
			if (rest === 'preview.json') {
				patchItem(key, { kind: 'image', name, source: 'chat', previewPath: path });
				continue;
			}
			if (rest === 'media.json') {
				patchItem(key, { kind: 'image', name, source: 'chat', mediaPath: path });
				continue;
			}
			const kind = inferMediaKind({ name: rest, path });
			if (kind !== 'image' && kind !== 'video') continue;
			patchItem(key, { kind, name, source: 'chat', mediaPath: path });
		}
	}

	return [...map.values()]
		.filter(
			(it) =>
				it.path &&
				!it.path.endsWith('/thumb.jpg') &&
				!it.path.endsWith('/preview.json')
		)
		.sort((a, b) => b.path.localeCompare(a.path));
}
