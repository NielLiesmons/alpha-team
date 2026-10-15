/** Project / Task / Note / Track helpers over the browser Drive client. */

import { parseAudioFilename, readAudioTags } from './audio-meta.js';
import { getPath, getPathFromDir, loadRootDir, loadRootDirWithTip, putPath } from './client.js';
import { putMediaBlob } from './media.js';

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
	if (typeof t.author === 'string') t.author = t.author.trim().toLowerCase();
	else if (t.author && typeof t.author === 'object') {
		t.author = String(t.author.email || t.author.pubkey || '')
			.trim()
			.toLowerCase();
		if (!t.author) delete t.author;
	}
	return t;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{ title: string, project_ids?: string[], description?: string, status?: string, priority?: string, labels?: string[], author?: string }} input
 */
export async function createTask(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const author =
		typeof input.author === 'string' && input.author.trim()
			? input.author.trim().toLowerCase()
			: undefined;
	const task = {
		schema: 'alpha.task/2',
		id,
		project_ids: input.project_ids ?? [],
		title: input.title,
		description: input.description ?? '',
		status: input.status ?? 'open',
		priority: input.priority ?? 'none',
		labels: input.labels ?? [],
		...(author ? { author } : {}),
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
 * @param {{ title: string, body?: string, project_ids?: string[], labels?: string[], author?: string }} input
 */
export async function createNote(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const author =
		typeof input.author === 'string' && input.author.trim()
			? input.author.trim().toLowerCase()
			: undefined;
	const note = {
		schema: 'alpha.note/1',
		id,
		project_ids: input.project_ids ?? [],
		title: input.title,
		body: input.body ?? '',
		labels: input.labels ?? [],
		...(author ? { author } : {}),
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
	const author =
		typeof note.author === 'string' && note.author.trim()
			? note.author.trim().toLowerCase()
			: undefined;
	const n = {
		schema: 'alpha.note/1',
		id: note.id,
		project_ids: Array.isArray(note.project_ids) ? note.project_ids : [],
		title: note.title,
		body: note.body ?? '',
		labels: Array.isArray(note.labels) ? note.labels : [],
		...(author ? { author } : {}),
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
	const authorEmail =
		typeof n.author === 'string' ? n.author : n.author?.email || n.author?.pubkey || '';
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
		author: authorEmail || null,
		assignees: [],
		createdAt: Number.isFinite(createdMs) ? createdMs : 0,
		_drive: n
	};
}

/**
 * @param {any} ui
 */
export function fromUiNote(ui) {
	const author =
		typeof ui.author === 'string'
			? ui.author
			: ui.author?.email || ui._drive?.author || undefined;
	return {
		schema: 'alpha.note/1',
		id: ui.id,
		project_ids: ui.project_ids ?? (ui.targets ?? []).map((t) => t.id),
		title: ui.title,
		body: ui.body ?? '',
		labels: ui.labels ?? [],
		...(author ? { author: String(author).toLowerCase() } : {}),
		created_at: ui._drive?.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
}

export { parseAudioFilename };

const TRACK_CACHE_PREFIX = 'alpha.player.tracks:';
const LIST_CONCURRENCY = 8;

/**
 * @param {import('./client.js').DriveSession} session
 */
function trackCacheKey(session) {
	return `${TRACK_CACHE_PREFIX}${session.url}`;
}

/**
 * @param {any[]} out
 */
function sortTracks(out) {
	out.sort((a, b) => {
		const aa = String(a.artists?.[0] ?? '');
		const ba = String(b.artists?.[0] ?? '');
		if (aa !== ba) return aa.localeCompare(ba);
		const al = String(a.album ?? '');
		const bl = String(b.album ?? '');
		if (al !== bl) return al.localeCompare(bl);
		return String(a.title).localeCompare(String(b.title));
	});
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any[]} tracks
 * @param {string} tip
 */
function writeTrackCache(session, tracks, tip) {
	try {
		sessionStorage.setItem(trackCacheKey(session), JSON.stringify({ tip, tracks }));
	} catch {
		/* quota / private mode */
	}
}

/**
 * Invalidate tip-keyed library cache after upload.
 * @param {import('./client.js').DriveSession} session
 */
export function invalidateTrackCache(session) {
	try {
		sessionStorage.removeItem(trackCacheKey(session));
	} catch {
		/* ignore */
	}
}

/**
 * Upload an audio File as chunked media + alpha.track/1.
 * @param {import('./client.js').DriveSession} session
 * @param {File} file
 * @param {{ onProgress?: (phase: string, done: number, total: number) => void }} [opts]
 */
export async function uploadTrack(session, file, opts = {}) {
	const id = newId();
	const meta = await readAudioTags(file);
	const contentType = file.type || 'audio/mpeg';
	const bytes = new Uint8Array(await file.arrayBuffer());
	const mediaPath = `media/audio/tracks/${id}/media.json`;
	const trackPath = `media/audio/tracks/${id}/track.json`;

	opts.onProgress?.('upload', 0, 1);
	await putMediaBlob(session, mediaPath, contentType, bytes, {
		onProgress: (done, total) => opts.onProgress?.('upload', done, total)
	});

	const created = nowRfc3339();
	const track = {
		schema: 'alpha.track/1',
		id,
		title: meta.title,
		artists: meta.artists,
		album: meta.album || undefined,
		media_path: mediaPath,
		duration_ms: null,
		genres: [],
		project_ids: [],
		labels: [],
		created_at: created,
		updated_at: created
	};
	opts.onProgress?.('index', 1, 1);
	await putPath(session, trackPath, 'track', JSON.stringify(track, null, 2));
	invalidateTrackCache(session);
	return track;
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listTracks(session) {
	const { tip, dir } = await loadRootDirWithTip(session);

	try {
		const raw = sessionStorage.getItem(trackCacheKey(session));
		if (raw) {
			const cached = JSON.parse(raw);
			if (cached?.tip === tip && Array.isArray(cached.tracks)) {
				return cached.tracks;
			}
		}
	} catch {
		/* ignore */
	}

	const paths = Object.entries(dir.children ?? {})
		.filter(([path, child]) => child.kind === 'track' || path.endsWith('/track.json'))
		.map(([path]) => path);

	/** @type {(any | null)[]} */
	const slots = new Array(paths.length).fill(null);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(LIST_CONCURRENCY, Math.max(paths.length, 1)) },
		async () => {
			while (next < paths.length) {
				const i = next++;
				const path = paths[i];
				try {
					const { bytes } = await getPathFromDir(session, dir, path);
					const t = JSON.parse(new TextDecoder().decode(bytes));
					t.schema = 'alpha.track/1';
					t.artists = Array.isArray(t.artists) && t.artists.length ? t.artists : ['Unknown'];
					t.album = t.album ?? '';
					slots[i] = t;
				} catch {
					/* skip broken entry */
				}
			}
		}
	);
	await Promise.all(workers);

	const out = sortTracks(slots.filter(Boolean));
	writeTrackCache(session, out, tip);
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listPlaylists(session) {
	const { dir } = await loadRootDirWithTip(session);
	const paths = Object.entries(dir.children ?? {})
		.filter(
			([path, child]) => child.kind === 'playlist' || path.endsWith('/playlist.json')
		)
		.map(([path]) => path);

	/** @type {any[]} */
	const out = [];
	await Promise.all(
		paths.map(async (path) => {
			try {
				const { bytes } = await getPathFromDir(session, dir, path);
				const p = JSON.parse(new TextDecoder().decode(bytes));
				p.schema = 'alpha.playlist/1';
				p.items = Array.isArray(p.items) ? p.items : [];
				out.push(p);
			} catch {
				/* skip */
			}
		})
	);
	out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
	return out;
}

/**
 * Map Drive task → Admin UI row.
 * @param {any} t
 * @param {any[]} projectList
 */
export function toUiTask(t, projectList) {
	const byId = new Map(projectList.map((p) => [p.id, p]));
	const createdMs = t.created_at ? Date.parse(t.created_at) : 0;
	const authorEmail =
		typeof t.author === 'string' ? t.author : t.author?.email || t.author?.pubkey || '';
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
		author: authorEmail || null,
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
	const author =
		typeof ui.author === 'string'
			? ui.author
			: ui.author?.email || ui._drive?.author || undefined;
	return {
		schema: 'alpha.task/2',
		id: ui.id,
		project_ids: ui.project_ids ?? (ui.targets ?? []).map((t) => t.id),
		title: ui.title,
		description: ui.body ?? '',
		status: ui.status,
		priority: ui.priority ?? 'none',
		labels: ui.labels ?? [],
		...(author ? { author: String(author).toLowerCase() } : {}),
		created_at: ui._drive?.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
}
