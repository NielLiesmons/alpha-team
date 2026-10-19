/**
 * Derive project status from linked tasks (not a stored project field).
 * @param {string} projectId
 * @param {Array<{ status?: string, project_ids?: string[], targets?: { id: string }[] }>} taskList
 * @returns {'backlog' | 'planned' | 'inProgress' | 'closed' | 'canceled'}
 */
export function deriveProjectStatus(projectId, taskList) {
	const related = (taskList ?? []).filter((t) => {
		const ids = t.project_ids ?? t.targets?.map((x) => x.id) ?? [];
		return ids.includes(projectId);
	});
	if (related.length === 0) return 'planned';

	const statuses = related.map((t) => t.status || 'open');
	const allCanceled = statuses.every((s) => s === 'canceled');
	if (allCanceled) return 'canceled';

	const allDone = statuses.every((s) => s === 'closed' || s === 'canceled');
	if (allDone) return 'closed';

	if (statuses.some((s) => s === 'inProgress' || s === 'inReview')) return 'inProgress';
	if (statuses.some((s) => s === 'open')) return 'planned';
	if (statuses.some((s) => s === 'backlog')) return 'backlog';
	return 'planned';
}

/** @param {string | null | undefined} icon */
export function isProjectImageIcon(icon) {
	return typeof icon === 'string' && (icon.startsWith('data:image/') || icon.startsWith('https://') || icon.startsWith('/'));
}

/**
 * Read a small square PNG/JPEG as a data URL (max edge ~64px).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readProjectIconFile(file) {
	return new Promise((resolve, reject) => {
		if (!file.type.startsWith('image/')) {
			reject(new Error('Choose an image file'));
			return;
		}
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			const max = 64;
			const scale = Math.min(1, max / Math.max(img.width, img.height));
			const w = Math.max(1, Math.round(img.width * scale));
			const h = Math.max(1, Math.round(img.height * scale));
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Canvas unavailable'));
				return;
			}
			ctx.drawImage(img, 0, 0, w, h);
			resolve(canvas.toDataURL('image/png'));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Could not read image'));
		};
		img.src = url;
	});
}
