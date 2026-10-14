/** Project / Task / Note helpers over the browser Drive client. */

import { getPath, loadRootDir, putPath } from './client.js';

function nowRfc3339() {
	return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function newId() {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function slugify(title) {
	const s = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return s || 'project';
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} name
 */
export async function initSpace(session, name) {
	const doc = {
		schema: 'alpha.space/1',
		name,
		created_at: nowRfc3339(),
		note: 'v0 family root capability — one key on all devices'
	};
	await putPath(session, 'meta/space.json', 'blob', JSON.stringify(doc, null, 2));
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{ title: string, slug?: string, description?: string }} input
 */
export async function createProject(session, input) {
	const id = newId();
	const home = `projects/${id}/home`;
	const created = nowRfc3339();
	const project = {
		schema: 'alpha.project/1',
		id,
		slug: input.slug || slugify(input.title),
		title: input.title,
		description: input.description || undefined,
		created_at: created,
		updated_at: created,
		drive: {
			home_prefix: home,
			private_prefix: home
		}
	};
	await putPath(session, `projects/${id}/project.json`, 'project', JSON.stringify(project, null, 2));
	return project;
}

/**
 * Ensure meta/space.json exists (first visit to an empty Drive).
 * @param {import('./client.js').DriveSession} session
 * @param {string} [name]
 */
export async function ensureSpace(session, name = 'Family') {
	try {
		await getPath(session, 'meta/space.json');
		return null;
	} catch {
		return initSpace(session, name);
	}
}

/**
 * List all encrypted root paths (flat map with `/` in names).
 * @param {import('./client.js').DriveSession} session
 */
export async function listEntries(session) {
	const dir = await loadRootDir(session);
	return Object.entries(dir.children ?? {})
		.map(([path, child]) => ({
			path,
			kind: child.kind ?? 'blob'
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Upload a browser File under a folder prefix (content-type tree).
 * @param {import('./client.js').DriveSession} session
 * @param {string} folder e.g. media/photos
 * @param {File} file
 */
export async function uploadFile(session, folder, file) {
	const safeName = file.name.replace(/[/\\]/g, '_').trim() || 'file';
	const prefix = folder.replace(/^\/+|\/+$/g, '');
	const path = prefix ? `${prefix}/${safeName}` : safeName;
	const bytes = new Uint8Array(await file.arrayBuffer());
	await putPath(session, path, 'blob', bytes);
	return path;
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listProjects(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'project' || path.endsWith('/project.json')) {
			try {
				const bytes = await getPath(session, path);
				out.push(JSON.parse(new TextDecoder().decode(bytes)));
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
	return out;
}

/**
 * Normalize legacy task/1 → task/2 shape.
 * @param {any} raw
 */
export function normalizeTask(raw) {
	const t = { ...raw };
	if (!Array.isArray(t.project_ids) || t.project_ids.length === 0) {
		t.project_ids = t.project_id ? [t.project_id] : [];
	}
	delete t.project_id;
	const statusMap = {
		todo: 'open',
		doing: 'inProgress',
		done: 'closed',
		cancelled: 'canceled'
	};
	if (statusMap[t.status]) t.status = statusMap[t.status];
	t.schema = 'alpha.task/2';
	t.labels = Array.isArray(t.labels) ? t.labels : [];
	t.priority = t.priority ?? 'none';
	return t;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{ title: string, project_ids?: string[], description?: string, status?: string, priority?: string, labels?: string[] }} input
 */
export async function createTask(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const task = {
		schema: 'alpha.task/2',
		id,
		project_ids: input.project_ids ?? [],
		title: input.title,
		description: input.description ?? '',
		status: input.status ?? 'open',
		priority: input.priority ?? 'none',
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(session, `tasks/${id}/task.json`, 'task', JSON.stringify(task, null, 2));
	return task;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} task
 */
export async function putTask(session, task) {
	const t = normalizeTask(task);
	t.updated_at = nowRfc3339();
	await putPath(session, `tasks/${t.id}/task.json`, 'task', JSON.stringify(t, null, 2));
	return t;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} [projectId]
 */
export async function listTasks(session, projectId) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'task' || path.endsWith('/task.json')) {
			try {
				const bytes = await getPath(session, path);
				const t = normalizeTask(JSON.parse(new TextDecoder().decode(bytes)));
				if (!projectId || t.project_ids.includes(projectId)) out.push(t);
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{ title: string, body?: string, project_ids?: string[], labels?: string[] }} input
 */
export async function createNote(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const note = {
		schema: 'alpha.note/1',
		id,
		project_ids: input.project_ids ?? [],
		title: input.title,
		body: input.body ?? '',
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(session, `notes/${id}/note.json`, 'note', JSON.stringify(note, null, 2));
	return note;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} note
 */
export async function putNote(session, note) {
	const n = {
		schema: 'alpha.note/1',
		id: note.id,
		project_ids: Array.isArray(note.project_ids) ? note.project_ids : [],
		title: note.title,
		body: note.body ?? '',
		labels: Array.isArray(note.labels) ? note.labels : [],
		created_at: note.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
	await putPath(session, `notes/${n.id}/note.json`, 'note', JSON.stringify(n, null, 2));
	return n;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} [projectId]
 */
export async function listNotes(session, projectId) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'note' || path.endsWith('/note.json')) {
			try {
				const bytes = await getPath(session, path);
				const n = JSON.parse(new TextDecoder().decode(bytes));
				n.schema = 'alpha.note/1';
				n.project_ids = Array.isArray(n.project_ids) ? n.project_ids : [];
				n.labels = Array.isArray(n.labels) ? n.labels : [];
				n.body = n.body ?? '';
				if (!projectId || n.project_ids.includes(projectId)) out.push(n);
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
	return out;
}

/**
 * Map Drive note → Admin UI row.
 * @param {any} n
 * @param {any[]} projectList
 */
export function toUiNote(n, projectList) {
	const byId = new Map(projectList.map((p) => [p.id, p]));
	const createdMs = n.created_at ? Date.parse(n.created_at) : 0;
	return {
		id: n.id,
		title: n.title,
		body: n.body ?? '',
		labels: n.labels ?? [],
		targets: (n.project_ids ?? []).map((id) => ({
			id,
			label: byId.get(id)?.title ?? id
		})),
		project_ids: n.project_ids ?? [],
		createdAt: Number.isFinite(createdMs) ? createdMs : 0,
		_drive: n
	};
}

/**
 * @param {any} ui
 */
export function fromUiNote(ui) {
	return {
		schema: 'alpha.note/1',
		id: ui.id,
		project_ids: ui.project_ids ?? (ui.targets ?? []).map((t) => t.id),
		title: ui.title,
		body: ui.body ?? '',
		labels: ui.labels ?? [],
		created_at: ui._drive?.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
}

/**
 * Map Drive task → Admin UI row.
 * @param {any} t
 * @param {any[]} projectList
 */
export function toUiTask(t, projectList) {
	const byId = new Map(projectList.map((p) => [p.id, p]));
	const createdMs = t.created_at ? Date.parse(t.created_at) : 0;
	return {
		id: t.id,
		title: t.title,
		status: t.status,
		priority: t.priority ?? 'none',
		body: t.description ?? '',
		labels: t.labels ?? [],
		targets: (t.project_ids ?? []).map((id) => ({
			id,
			label: byId.get(id)?.title ?? id
		})),
		project_ids: t.project_ids ?? [],
		author: { pubkey: 'local', name: 'You' },
		assignees: [],
		commenters: [],
		createdAt: Number.isFinite(createdMs) ? createdMs : 0,
		_drive: t
	};
}

/**
 * @param {any} ui
 */
export function fromUiTask(ui) {
	return {
		schema: 'alpha.task/2',
		id: ui.id,
		project_ids: ui.project_ids ?? (ui.targets ?? []).map((t) => t.id),
		title: ui.title,
		description: ui.body ?? '',
		status: ui.status,
		priority: ui.priority ?? 'none',
		labels: ui.labels ?? [],
		created_at: ui._drive?.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
}
