/**
 * Build Miller-column folders from flat Drive paths (names with `/`).
 */

/** @typedef {{ name: string, path: string, kind: 'folder' | string, isFolder: boolean }} TreeItem */

/**
 * @param {{ path: string, kind: string }[]} entries
 * @param {string} folderPath  '' = root
 * @returns {TreeItem[]}
 */
export function childrenOf(entries, folderPath) {
	const prefix = folderPath ? `${folderPath}/` : '';
	/** @type {Map<string, TreeItem>} */
	const map = new Map();

	for (const entry of entries) {
		if (folderPath) {
			if (entry.path === folderPath) continue;
			if (!entry.path.startsWith(prefix)) continue;
		}
		const rest = folderPath ? entry.path.slice(prefix.length) : entry.path;
		const slash = rest.indexOf('/');
		if (slash === -1) {
			map.set(rest, {
				name: rest,
				path: entry.path,
				kind: entry.kind,
				isFolder: false
			});
		} else {
			const seg = rest.slice(0, slash);
			const childPath = folderPath ? `${folderPath}/${seg}` : seg;
			if (!map.has(seg)) {
				map.set(seg, {
					name: seg,
					path: childPath,
					kind: 'folder',
					isFolder: true
				});
			} else {
				const existing = map.get(seg);
				if (existing && !existing.isFolder) {
					/* file and folder same name — prefer folder view */
					map.set(seg, {
						name: seg,
						path: childPath,
						kind: 'folder',
						isFolder: true
					});
				}
			}
		}
	}

	const knownRoots = ['meta', 'projects', 'tasks', 'files', 'media', 'publications'];
	let items = [...map.values()];
	if (!folderPath) {
		for (const root of knownRoots) {
			if (!map.has(root)) {
				items.push({ name: root, path: root, kind: 'folder', isFolder: true });
			}
		}
	}

	items.sort((a, b) => {
		if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	return items;
}
