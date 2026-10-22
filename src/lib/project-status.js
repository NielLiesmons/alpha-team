/**
 * Project lifecycle for lists / boxes: active vs archived.
 * Prefer stored project.status; fall back to task-derived archive when all linked tasks are done.
 * @param {{ id?: string, status?: string } | null | undefined} project
 * @param {Array<{ status?: string, project_ids?: string[], targets?: { id: string }[] }>} [taskList]
 * @returns {'active' | 'archived'}
 */
export function projectLifecycle(project, taskList = []) {
	const raw = String(project?.status || '').toLowerCase();
	if (raw === 'archived' || raw === 'closed' || raw === 'canceled') return 'archived';
	if (raw === 'active' || raw === 'planned' || raw === 'inprogress' || raw === 'backlog') {
		return raw === 'archived' ? 'archived' : 'active';
	}
	const projectId = project?.id;
	if (!projectId) return 'active';
	const related = (taskList ?? []).filter((t) => {
		const ids = t.project_ids ?? t.targets?.map((x) => x.id) ?? [];
		return ids.includes(projectId);
	});
	if (related.length === 0) return 'active';
	const statuses = related.map((t) => t.status || 'open');
	const allDone = statuses.every((s) => s === 'closed' || s === 'canceled');
	return allDone ? 'archived' : 'active';
}

/**
 * @deprecated Prefer projectLifecycle — kept as alias for call sites mid-migration.
 * @param {string} projectId
 * @param {Array<{ status?: string, project_ids?: string[], targets?: { id: string }[] }>} taskList
 * @returns {'active' | 'archived'}
 */
export function deriveProjectStatus(projectId, taskList) {
	return projectLifecycle({ id: projectId }, taskList);
}

/** @param {string | null | undefined} icon */
export function isProjectImageIcon(icon) {
	return typeof icon === 'string' && (icon.startsWith('data:image/') || icon.startsWith('https://') || icon.startsWith('/'));
}

/**
 * Primary enterprise for a project (explicit field, else first of enterprise_ids).
 * @param {{ primary_enterprise_id?: string | null, enterprise_ids?: string[] } | null | undefined} project
 */
export function primaryEnterpriseId(project) {
	if (!project) return null;
	if (project.primary_enterprise_id) return project.primary_enterprise_id;
	const ids = project.enterprise_ids ?? [];
	return ids[0] ?? null;
}

/**
 * Display icon: project override, else primary enterprise icon.
 * @param {{ icon?: string | null, primary_enterprise_id?: string | null, enterprise_ids?: string[] } | null | undefined} project
 * @param {Array<{ id: string, icon?: string | null }>} enterpriseList
 */
export function projectDisplayIcon(project, enterpriseList) {
	if (project?.icon && String(project.icon).trim()) return project.icon;
	const eid = primaryEnterpriseId(project);
	if (!eid) return null;
	return enterpriseList.find((e) => e.id === eid)?.icon ?? null;
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
