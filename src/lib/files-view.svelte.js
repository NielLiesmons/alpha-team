/**
 * Shared Files list state so the detail column can browse folders offline-friendly.
 */

/** @type {{ entries: { path: string, kind: string, display_name?: string | null }[], folderPaths: Set<string>, loading: boolean, error: string }} */
export const filesView = $state({
	entries: [],
	folderPaths: new Set(),
	loading: false,
	error: ''
});

/**
 * Replace the flat entry list and rebuild folder-path index (O(n) once, not per click).
 * @param {{ path: string, kind: string, display_name?: string | null }[]} list
 */
export function setFilesEntries(list) {
	const entries = Array.isArray(list) ? list : [];
	/** @type {Set<string>} */
	const folders = new Set();
	for (const e of entries) {
		if (e.kind === 'folder') folders.add(e.path);
		const parts = String(e.path || '').split('/');
		for (let i = 1; i < parts.length; i++) {
			folders.add(parts.slice(0, i).join('/'));
		}
	}
	filesView.entries = entries;
	filesView.folderPaths = folders;
}

/** @param {string} path */
export function isFilesFolderPath(path) {
	if (!path) return false;
	const hit = filesView.entries.find((e) => e.path === path);
	if (hit?.kind === 'folder') return true;
	return filesView.folderPaths.has(path);
}
