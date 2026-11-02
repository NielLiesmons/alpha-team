/** Project / Task / Note / Track helpers over the browser Drive client. */

import { parseAudioFilename, readAudioTags, stripId3Containers } from './audio-meta.js';
import {
	deletePaths,
	getPath,
	getPathFromDir,
	getTip,
	loadRootDir,
	loadRootDirWithTip,
	peekCachedTip,
	putBlock,
	putPath,
	putPaths
} from './client.js';
import { encrypt, parseRootKey, sha256Hex } from './crypto.js';
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
 * @param {{
 *   title: string,
 *   slug?: string,
 *   description?: string,
 *   status?: string,
 *   icon?: string | null,
 *   milestones?: { id: string, title: string, percentage?: number, sort?: number }[]
 * }} input
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
		status: input.status || 'planned',
		icon: input.icon || undefined,
		enterprise_ids: Array.isArray(input.enterprise_ids) ? input.enterprise_ids : [],
		primary_enterprise_id:
			input.primary_enterprise_id ||
			(Array.isArray(input.enterprise_ids) && input.enterprise_ids[0]) ||
			null,
		depends_on: Array.isArray(input.depends_on) ? input.depends_on : [],
		milestones: Array.isArray(input.milestones) ? input.milestones : [],
		created_at: created,
		updated_at: created,
		drive: {
			home_prefix: home,
			private_prefix: home
		}
	};
	if (
		project.primary_enterprise_id &&
		!project.enterprise_ids.includes(project.primary_enterprise_id)
	) {
		project.enterprise_ids = [project.primary_enterprise_id, ...project.enterprise_ids];
	}
	await putPath(session, `projects/${id}/project.json`, 'project', JSON.stringify(project, null, 2));
	return project;
}

/**
 * Persist project fields (status, milestones, description, …).
 * @param {import('./client.js').DriveSession} session
 * @param {any} project Drive document (must include id)
 * @param {Record<string, unknown>} [patch]
 */
export async function putProject(session, project, patch = {}) {
	const id = project.id;
	if (!id) throw new Error('Project missing id');
	const next = {
		...project,
		...patch,
		schema: 'alpha.project/1',
		id,
		updated_at: nowRfc3339()
	};
	/* Projects use a single description — drop legacy body / dates if present */
	delete next.body;
	delete next.start_at;
	delete next.end_at;
	if (!Array.isArray(next.milestones)) next.milestones = [];
	if (!Array.isArray(next.enterprise_ids)) next.enterprise_ids = [];
	if (!Array.isArray(next.depends_on)) next.depends_on = [];
	if (!next.status) next.status = 'planned';
	if (!next.primary_enterprise_id && next.enterprise_ids[0]) {
		next.primary_enterprise_id = next.enterprise_ids[0];
	}
	if (
		next.primary_enterprise_id &&
		!next.enterprise_ids.includes(next.primary_enterprise_id)
	) {
		next.enterprise_ids = [next.primary_enterprise_id, ...next.enterprise_ids];
	}
	await putPath(session, `projects/${id}/project.json`, 'project', JSON.stringify(next, null, 2));
	return next;
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
 * Normalize legacy task/1–2 → task/3 shape (deadline_at; no start/end bars).
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
		cancelled: 'canceled',
		recurring: 'planned'
	};
	if (statusMap[t.status]) t.status = statusMap[t.status];
	t.schema = 'alpha.task/3';
	t.labels = Array.isArray(t.labels) ? t.labels : [];
	t.priority = t.priority ?? 'none';
	t.depends_on = Array.isArray(t.depends_on) ? t.depends_on : [];
	const deadline = t.deadline_at ?? t.due_at ?? null;
	t.deadline_at = deadline;
	delete t.due_at;
	delete t.start_at;
	delete t.end_at;
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
 * @param {{ title: string, project_ids?: string[], description?: string, status?: string, priority?: string, labels?: string[], deadline_at?: string | null, author?: string }} input
 */
export async function createTask(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const author =
		typeof input.author === 'string' && input.author.trim()
			? input.author.trim().toLowerCase()
			: undefined;
	const task = {
		schema: 'alpha.task/3',
		id,
		project_ids: input.project_ids ?? [],
		title: input.title,
		description: input.description ?? '',
		status: input.status ?? 'open',
		priority: input.priority ?? 'none',
		labels: input.labels ?? [],
		deadline_at: input.deadline_at ?? null,
		depends_on: Array.isArray(input.depends_on) ? input.depends_on : [],
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
 * @param {any} raw
 */
export function normalizeMoment(raw) {
	const m = { ...raw };
	m.schema = 'alpha.moment/1';
	m.task_id = m.task_id || null;
	m.title = m.title ?? null;
	m.end_at = m.end_at ?? null;
	m.assignees = Array.isArray(m.assignees)
		? m.assignees.map((a) => String(a).trim().toLowerCase()).filter(Boolean)
		: [];
	m.status = m.status || 'planned';
	m.recurrence = m.recurrence ?? null;
	m.recurrence_exception_of = m.recurrence_exception_of ?? null;
	m.recurrence_instance = m.recurrence_instance ?? null;
	return m;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{
 *   task_id?: string | null,
 *   title?: string | null,
 *   start_at: string,
 *   end_at?: string | null,
 *   assignees?: string[],
 *   status?: string,
 *   recurrence?: object | null
 * }} input
 */
export async function createMoment(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const moment = normalizeMoment({
		schema: 'alpha.moment/1',
		id,
		task_id: input.task_id ?? null,
		title: input.title ?? null,
		start_at: input.start_at,
		end_at: input.end_at ?? null,
		assignees: input.assignees ?? [],
		status: input.status ?? 'planned',
		recurrence: input.recurrence ?? null,
		created_at: created,
		updated_at: created
	});
	await putPath(session, `moments/${id}/moment.json`, 'moment', JSON.stringify(moment, null, 2));
	return moment;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} moment
 */
export async function putMoment(session, moment) {
	const m = normalizeMoment(moment);
	if (!m.id) throw new Error('Moment missing id');
	m.updated_at = nowRfc3339();
	await putPath(session, `moments/${m.id}/moment.json`, 'moment', JSON.stringify(m, null, 2));
	return m;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} [taskId] when set, only moments for that task
 */
export async function listMoments(session, taskId) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'moment' || path.endsWith('/moment.json')) {
			try {
				const bytes = await getPath(session, path);
				const m = normalizeMoment(JSON.parse(new TextDecoder().decode(bytes)));
				if (!taskId || m.task_id === taskId) out.push(m);
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
	return out;
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
	const updatedMs = n.updated_at ? Date.parse(n.updated_at) : createdMs;
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
		updatedAt: Number.isFinite(updatedMs) ? updatedMs : Number.isFinite(createdMs) ? createdMs : 0,
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

const LIST_CONCURRENCY = 8;

/**
 * @param {any[]} out
 */
function sortTracks(out) {
	out.sort((a, b) => {
		const al = String(a.album ?? '');
		const bl = String(b.album ?? '');
		if (al !== bl) return al.localeCompare(bl);
		const ad = Number(a.disc_no) || 0;
		const bd = Number(b.disc_no) || 0;
		if (ad !== bd) return ad - bd;
		const at = Number(a.track_no) || 0;
		const bt = Number(b.track_no) || 0;
		if (at !== bt) return at - bt;
		const aa = String(a.artists?.[0] ?? '');
		const ba = String(b.artists?.[0] ?? '');
		if (aa !== ba) return aa.localeCompare(ba);
		return String(a.title).localeCompare(String(b.title));
	});
	return out;
}

/** No-op — library cache removed (was freezing Firefox / filling sessionStorage). */
export function invalidateTrackCache(_session) {}

/**
 * Upload an audio File as chunked media + alpha.track/1.
 * @param {import('./client.js').DriveSession} session
 * @param {File} file
 * @param {{ onProgress?: (phase: string, done: number, total: number) => void, signal?: AbortSignal }} [opts]
 */
export async function uploadTrack(session, file, opts = {}) {
	if (opts.signal?.aborted) {
		const err = new Error('Aborted');
		err.name = 'AbortError';
		throw err;
	}
	// Stamp when the user started adding to Drive — Recently Added sorts on this.
	const addedAt = nowRfc3339();
	const id = newId();
	const meta = await readAudioTags(file);
	const contentType = file.type || 'audio/mpeg';
	const raw = new Uint8Array(await file.arrayBuffer());
	// Drop ID3 so chunk 0 starts on MPEG frames (embedded art tags can be >256KB).
	const bytes =
		contentType.includes('mpeg') ||
		contentType.includes('mp3') ||
		/\.mp3$/i.test(file.name) ||
		(raw.length >= 3 && raw[0] === 0x49 && raw[1] === 0x44 && raw[2] === 0x33)
			? stripId3Containers(raw)
			: raw;
	if (opts.signal?.aborted) {
		const err = new Error('Aborted');
		err.name = 'AbortError';
		throw err;
	}
	const mediaPath = `media/audio/tracks/${id}/media.json`;
	const trackPath = `media/audio/tracks/${id}/track.json`;

	opts.onProgress?.('upload', 0, 1);
	await putMediaBlob(session, mediaPath, contentType, bytes, {
		onProgress: (done, total) => opts.onProgress?.('upload', done, total),
		signal: opts.signal
	});

	if (opts.signal?.aborted) {
		const err = new Error('Aborted');
		err.name = 'AbortError';
		throw err;
	}

	/** @type {string | null} */
	let coverPath = null;
	/** @type {{ path: string, kind: string, plaintext: string | Uint8Array }[]} */
	const indexEntries = [];
	if (meta.artwork?.bytes?.length) {
		try {
			opts.onProgress?.('artwork', 0, 1);
			const artBytes = meta.artwork.bytes;
			const copy = new Uint8Array(artBytes.byteLength);
			copy.set(artBytes);
			const blob = new Blob([copy], { type: meta.artwork.mime || 'image/jpeg' });
			const prepared = await prepareCoverImage(blob);
			coverPath = prepared.path;
			indexEntries.push({ path: prepared.path, kind: 'blob', plaintext: prepared.bytes });
		} catch (e) {
			console.warn('Embedded artwork skipped:', e);
			coverPath = null;
		}
	}

	const track = {
		schema: 'alpha.track/1',
		id,
		title: meta.title,
		artists: meta.artists,
		album: meta.album || undefined,
		track_no: meta.track_no ?? null,
		disc_no: meta.disc_no ?? null,
		media_path: mediaPath,
		cover_path: coverPath,
		duration_ms: meta.duration_ms ?? null,
		genres: [],
		project_ids: [],
		labels: [],
		created_at: addedAt,
		updated_at: nowRfc3339()
	};
	opts.onProgress?.('index', 1, 1);
	indexEntries.push({
		path: trackPath,
		kind: 'track',
		plaintext: JSON.stringify(track, null, 2)
	});
	await putPaths(session, indexEntries);
	invalidateTrackCache(session);
	return track;
}

/**
 * Build alpha.track/1 document from existing track + field patch.
 * @param {any} track
 * @param {{
 *   title?: string,
 *   artists?: string[],
 *   album?: string | null,
 *   album_artist?: string | null,
 *   year?: number | null,
 *   genres?: string[],
 *   cover_path?: string | null
 * }} patch
 */
export function buildTrackDoc(track, patch = {}) {
	const title =
		patch.title !== undefined ? String(patch.title).trim() : String(track.title ?? '').trim();
	if (!title) throw new Error('Title is required');

	let artists = Array.isArray(track.artists) ? [...track.artists] : ['Unknown'];
	if (patch.artists !== undefined) {
		artists = patch.artists.map((a) => String(a).trim()).filter(Boolean);
		if (!artists.length) throw new Error('At least one artist is required');
	}

	const album =
		patch.album !== undefined
			? String(patch.album ?? '').trim()
			: String(track.album ?? '').trim();
	const albumArtist =
		patch.album_artist !== undefined
			? String(patch.album_artist ?? '').trim()
			: String(track.album_artist ?? '').trim();
	const genres =
		patch.genres !== undefined
			? patch.genres.map((g) => String(g).trim()).filter(Boolean)
			: Array.isArray(track.genres)
				? track.genres
				: [];
	const year =
		patch.year !== undefined
			? patch.year == null || patch.year === ''
				? null
				: Number.isFinite(Number(patch.year))
					? Math.trunc(Number(patch.year))
					: null
			: (track.year ?? null);
	const coverPath =
		patch.cover_path !== undefined ? patch.cover_path : (track.cover_path ?? null);

	// Never rewrite created_at on edit — that is the Drive add / upload time for Recently Added.
	const createdAt = track.created_at || track.updated_at || nowRfc3339();

	return {
		schema: 'alpha.track/1',
		id: track.id,
		title,
		artists,
		...(album ? { album } : {}),
		...(albumArtist ? { album_artist: albumArtist } : {}),
		track_no: track.track_no ?? null,
		disc_no: track.disc_no ?? null,
		duration_ms: track.duration_ms ?? null,
		year,
		genres,
		media_path: track.media_path,
		cover_path: coverPath,
		project_ids: Array.isArray(track.project_ids) ? track.project_ids : [],
		labels: Array.isArray(track.labels) ? track.labels : [],
		created_at: createdAt,
		updated_at: nowRfc3339()
	};
}

/**
 * Update track metadata (title, artists, album, …). Does not touch media blobs.
 * @param {import('./client.js').DriveSession} session
 * @param {any} track
 * @param {{
 *   title: string,
 *   artists: string[],
 *   album?: string,
 *   album_artist?: string,
 *   year?: number | null,
 *   genres?: string[],
 *   cover_path?: string | null
 * }} patch
 */
export async function putTrackMeta(session, track, patch) {
	const next = buildTrackDoc(track, patch);
	const trackPath = `media/audio/tracks/${track.id}/track.json`;
	await putPath(session, trackPath, 'track', JSON.stringify(next, null, 2));
	invalidateTrackCache(session);
	return next;
}

/**
 * Partial metadata patch — only provided keys are applied. Title is never cleared.
 * @param {import('./client.js').DriveSession} session
 * @param {any} track
 * @param {{
 *   title?: string,
 *   artists?: string[],
 *   album?: string | null,
 *   album_artist?: string | null,
 *   year?: number | null,
 *   genres?: string[],
 *   cover_path?: string | null
 * }} patch
 */
export async function patchTrackFields(session, track, patch) {
	const next = buildTrackDoc(track, patch);
	const trackPath = `media/audio/tracks/${track.id}/track.json`;
	await putPath(session, trackPath, 'track', JSON.stringify(next, null, 2));
	invalidateTrackCache(session);
	return next;
}

/**
 * Decode any browser-readable image and re-encode as JPEG.
 * Rejects HEIC/unsupported types with a clear error instead of a silent fail.
 * @param {File | Blob} file
 * @param {number} [maxEdge=1400]
 * @returns {Promise<Uint8Array>}
 */
async function encodeCoverJpeg(file, maxEdge = 1400) {
	const type = (file.type || '').toLowerCase();
	if (type.includes('heic') || type.includes('heif')) {
		throw new Error('HEIC photos aren’t supported — export as JPEG or PNG first');
	}
	if (type && !type.startsWith('image/') && type !== 'application/octet-stream') {
		throw new Error('Cover must be an image (JPEG, PNG, or WebP)');
	}
	if (file.size > 20 * 1024 * 1024) {
		throw new Error('Cover image is too large (max 20MB)');
	}
	/** @type {number} */
	let width;
	/** @type {number} */
	let height;
	/** @type {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} */
	let draw;

	try {
		const bitmap = await createImageBitmap(file);
		width = bitmap.width;
		height = bitmap.height;
		draw = (ctx, w, h) => {
			ctx.drawImage(bitmap, 0, 0, w, h);
			bitmap.close();
		};
	} catch {
		// Safari / odd containers: fall back to HTMLImageElement
		const url = URL.createObjectURL(file);
		try {
			const img = await new Promise((resolve, reject) => {
				const el = new Image();
				el.onload = () => resolve(el);
				el.onerror = () => reject(new Error('Couldn’t read that image — try JPEG or PNG'));
				el.src = url;
			});
			width = img.naturalWidth || img.width;
			height = img.naturalHeight || img.height;
			draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h);
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	if (!width || !height) throw new Error('Couldn’t read that image — try JPEG or PNG');
	const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
	const w = Math.max(1, Math.round(width * scale));
	const h = Math.max(1, Math.round(height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Couldn’t process cover image');
	draw(ctx, w, h);

	const blob = await new Promise((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Couldn’t encode cover JPEG'))),
			'image/jpeg',
			0.88
		);
	});
	return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Prepare cover image bytes + content-addressed path (does not write yet).
 * @param {File | Blob} file
 * @returns {Promise<{ path: string, bytes: Uint8Array }>}
 */
export async function prepareCoverImage(file) {
	const bytes = await encodeCoverJpeg(file);
	if (!bytes.length) throw new Error('Empty cover image');
	const hash = await sha256Hex(bytes);
	return { path: `media/audio/covers/${hash}`, bytes };
}

/**
 * Store album art once (content-addressed) and return its Drive path.
 * @param {import('./client.js').DriveSession} session
 * @param {File | Blob} file
 */
export async function putCoverImage(session, file) {
	const { path, bytes } = await prepareCoverImage(file);
	await putPath(session, path, 'blob', bytes);
	return path;
}

/**
 * Store a profile avatar (JPEG, max edge 512) and return its Drive path.
 * @param {import('./client.js').DriveSession} session
 * @param {File | Blob} file
 */
export async function putAvatarImage(session, file) {
	const bytes = await encodeCoverJpeg(file, 512);
	if (!bytes.length) throw new Error('Empty avatar image');
	const hash = await sha256Hex(bytes);
	const path = `media/avatars/${hash}.jpg`;
	await putPath(session, path, 'blob', bytes);
	return path;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} track
 * @param {string | null} coverPath
 */
export async function putTrackCoverPath(session, track, coverPath) {
	const next = buildTrackDoc(track, { cover_path: coverPath });
	const trackPath = `media/audio/tracks/${track.id}/track.json`;
	await putPath(session, trackPath, 'track', JSON.stringify(next, null, 2));
	invalidateTrackCache(session);
	return next;
}

/**
 * Apply one cover image to many tracks (shared cover_path) in one tip write.
 * @param {import('./client.js').DriveSession} session
 * @param {any[]} trackList
 * @param {File | Blob | null} file null clears cover
 * @param {{ onProgress?: (label: string) => void }} [opts]
 */
export async function setTracksCover(session, trackList, file, opts = {}) {
	opts.onProgress?.(file ? 'Uploading artwork…' : 'Removing artwork…');
	/** @type {{ path: string, kind: string, plaintext: string | Uint8Array }[]} */
	const entries = [];
	/** @type {string | null} */
	let coverPath = null;
	if (file) {
		const prepared = await prepareCoverImage(file);
		coverPath = prepared.path;
		entries.push({ path: prepared.path, kind: 'blob', plaintext: prepared.bytes });
	}

	/** @type {any[]} */
	const out = [];
	for (const track of trackList) {
		const next = buildTrackDoc(track, { cover_path: coverPath });
		out.push(next);
		entries.push({
			path: `media/audio/tracks/${track.id}/track.json`,
			kind: 'track',
			plaintext: JSON.stringify(next, null, 2)
		});
	}
	opts.onProgress?.(`Saving ${trackList.length} track${trackList.length === 1 ? '' : 's'}…`);
	await putPaths(session, entries);
	invalidateTrackCache(session);
	return out;
}

/**
 * Batch-patch many tracks (single tip update). Optional cover file applied to all.
 * @param {import('./client.js').DriveSession} session
 * @param {any[]} trackList
 * @param {{
 *   artists?: string[],
 *   album?: string | null,
 *   album_artist?: string | null,
 *   year?: number | null,
 *   genres?: string[],
 *   cover_path?: string | null,
 *   coverFile?: File | Blob | null,
 *   clearCover?: boolean
 * }} patch
 * @param {{ onProgress?: (label: string) => void }} [opts]
 */
export async function patchTracks(session, trackList, patch, opts = {}) {
	/** @type {{ path: string, kind: string, plaintext: string | Uint8Array }[]} */
	const entries = [];
	/** @type {string | null | undefined} */
	let coverPath = patch.cover_path;
	if (patch.clearCover) coverPath = null;
	else if (patch.coverFile) {
		opts.onProgress?.('Uploading artwork…');
		const prepared = await prepareCoverImage(patch.coverFile);
		coverPath = prepared.path;
		entries.push({ path: prepared.path, kind: 'blob', plaintext: prepared.bytes });
	}

	/** @type {any[]} */
	const out = [];
	for (const track of trackList) {
		const fieldPatch = { ...patch };
		delete fieldPatch.coverFile;
		delete fieldPatch.clearCover;
		if (coverPath !== undefined) fieldPatch.cover_path = coverPath;
		const next = buildTrackDoc(track, fieldPatch);
		out.push(next);
		entries.push({
			path: `media/audio/tracks/${track.id}/track.json`,
			kind: 'track',
			plaintext: JSON.stringify(next, null, 2)
		});
	}
	opts.onProgress?.(`Saving ${trackList.length} track${trackList.length === 1 ? '' : 's'}…`);
	await putPaths(session, entries);
	invalidateTrackCache(session);
	return out;
}

/**
 * Remove track.json (+ media manifest path). Chunk blocks may remain orphaned.
 * @param {import('./client.js').DriveSession} session
 * @param {any | any[]} trackOrTracks
 */
export async function deleteTracks(session, trackOrTracks) {
	const list = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
	/** @type {string[]} */
	const paths = [];
	for (const t of list) {
		if (!t?.id) continue;
		paths.push(`media/audio/tracks/${t.id}/track.json`);
		if (t.media_path) paths.push(t.media_path);
	}
	await deletePaths(session, paths);
	invalidateTrackCache(session);
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listTracks(session) {
	const { dir } = await loadRootDirWithTip(session);
	const { getCachedLeaf, mapPool, putCachedLeaf } = await import('./leaf-cache.js');

	const entries = Object.entries(dir.children ?? {})
		.filter(([path, child]) => child.kind === 'track' || path.endsWith('/track.json'))
		.map(([path, child]) => ({ path, hash: child.hash }));

	const slots = await mapPool(entries, 32, async ({ path, hash }) => {
		try {
			let t = hash ? await getCachedLeaf(hash) : null;
			if (!t) {
				const { bytes } = await getPathFromDir(session, dir, path);
				t = JSON.parse(new TextDecoder().decode(bytes));
				if (hash) void putCachedLeaf(hash, t);
			}
			t.schema = 'alpha.track/1';
			t.artists = Array.isArray(t.artists) && t.artists.length ? t.artists : ['Unknown'];
			t.album = t.album ?? '';
			t.track_no = t.track_no ?? null;
			t.disc_no = t.disc_no ?? null;
			return t;
		} catch {
			return null;
		}
	});

	return sortTracks(slots.filter(Boolean));
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listPlaylists(session) {
	const { dir } = await loadRootDirWithTip(session);
	const { getCachedLeaf, mapPool, putCachedLeaf } = await import('./leaf-cache.js');
	const entries = Object.entries(dir.children ?? {})
		.filter(
			([path, child]) => child.kind === 'playlist' || path.endsWith('/playlist.json')
		)
		.map(([path, child]) => ({ path, hash: child.hash }));

	/** @type {any[]} */
	const out = [];
	await mapPool(entries, 16, async ({ path, hash }) => {
		try {
			let p = hash ? await getCachedLeaf(hash) : null;
			if (!p) {
				const { bytes } = await getPathFromDir(session, dir, path);
				p = JSON.parse(new TextDecoder().decode(bytes));
				if (hash) void putCachedLeaf(hash, p);
			}
			p.schema = 'alpha.playlist/1';
			p.items = Array.isArray(p.items) ? p.items : [];
			out.push(p);
		} catch {
			/* skip */
		}
	});
	out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{ title: string }} input
 */
export async function createPlaylist(session, input) {
	const title = String(input.title ?? '').trim();
	if (!title) throw new Error('Playlist title is required');
	const id = newId();
	const created = nowRfc3339();
	const playlist = {
		schema: 'alpha.playlist/1',
		id,
		title,
		items: [],
		created_at: created,
		updated_at: created
	};
	const path = `media/audio/playlists/${id}/playlist.json`;
	await putPath(session, path, 'playlist', JSON.stringify(playlist, null, 2));
	return playlist;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} playlist
 */
export async function putPlaylist(session, playlist) {
	const id = playlist?.id;
	if (!id) throw new Error('Playlist id is required');
	const title = String(playlist.title ?? '').trim();
	if (!title) throw new Error('Playlist title is required');
	const next = {
		schema: 'alpha.playlist/1',
		id,
		title,
		items: Array.isArray(playlist.items) ? playlist.items : [],
		created_at: playlist.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
	const path = `media/audio/playlists/${id}/playlist.json`;
	await putPath(session, path, 'playlist', JSON.stringify(next, null, 2));
	return next;
}

/**
 * Append tracks to a playlist (skips duplicates).
 * @param {import('./client.js').DriveSession} session
 * @param {any} playlist
 * @param {string | string[]} trackIds
 */
export async function addTracksToPlaylist(session, playlist, trackIds) {
	const ids = (Array.isArray(trackIds) ? trackIds : [trackIds]).filter(Boolean);
	const items = Array.isArray(playlist.items) ? [...playlist.items] : [];
	const have = new Set(items.filter((i) => i?.kind === 'track').map((i) => i.id));
	for (const id of ids) {
		if (have.has(id)) continue;
		items.push({ kind: 'track', id });
		have.add(id);
	}
	return putPlaylist(session, { ...playlist, items });
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
	const deadline = t.deadline_at ?? t.due_at ?? null;
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
		deadline_at: deadline,
		depends_on: Array.isArray(t.depends_on) ? t.depends_on : [],
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
		schema: 'alpha.task/3',
		id: ui.id,
		project_ids: ui.project_ids ?? (ui.targets ?? []).map((t) => t.id),
		title: ui.title,
		description: ui.body ?? '',
		status: ui.status,
		priority: ui.priority ?? 'none',
		labels: ui.labels ?? [],
		deadline_at: ui.deadline_at ?? ui._drive?.deadline_at ?? ui._drive?.due_at ?? null,
		depends_on: ui.depends_on ?? ui._drive?.depends_on ?? [],
		...(author ? { author: String(author).toLowerCase() } : {}),
		created_at: ui._drive?.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
}
/* ── Accounting (private Drive) — see alpha-docs/ADR-accounting-commerce.md ── */

const DEFAULT_ACCOUNTS = [
	{ code: 'cash', title: 'Cash / bank', kind: 'asset' },
	{ code: 'feed', title: 'Feed', kind: 'expense' },
	{ code: 'vet', title: 'Vet & animal health', kind: 'expense' },
	{ code: 'packaging', title: 'Packaging', kind: 'expense' },
	{ code: 'fuel', title: 'Fuel & transport', kind: 'expense' },
	{ code: 'infra', title: 'Infrastructure / builds', kind: 'expense' },
	{ code: 'sales-eggs', title: 'Sales — eggs', kind: 'income' },
	{ code: 'sales-dairy', title: 'Sales — dairy / ice cream', kind: 'income' },
	{ code: 'sales-meat', title: 'Sales — meat / sausages', kind: 'income' },
	{ code: 'sales-other', title: 'Sales — other', kind: 'income' },
	{ code: 'vat-out', title: 'VAT collected', kind: 'tax' },
	{ code: 'vat-in', title: 'VAT deductible', kind: 'tax' },
	{ code: 'fees', title: 'Payment / bank fees', kind: 'expense' }
];

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listAccounts(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'account' || path.endsWith('/account.json')) {
			try {
				const bytes = await getPath(session, path);
				out.push(JSON.parse(new TextDecoder().decode(bytes)));
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(a.code).localeCompare(String(b.code)));
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{ code: string, title: string, kind: string, currency?: string, labels?: string[] }} input
 */
export async function createAccount(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const account = {
		schema: 'alpha.account/1',
		id,
		code: input.code,
		title: input.title,
		kind: input.kind,
		currency: input.currency || 'EUR',
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(
		session,
		`accounts/${id}/account.json`,
		'account',
		JSON.stringify(account, null, 2)
	);
	return account;
}

/**
 * Seed a starter chart of accounts when the Drive has none.
 * @param {import('./client.js').DriveSession} session
 */
export async function ensureDefaultAccounts(session) {
	const existing = await listAccounts(session);
	if (existing.length > 0) return existing;
	/** @type {any[]} */
	const created = [];
	for (const row of DEFAULT_ACCOUNTS) {
		created.push(await createAccount(session, row));
	}
	return created;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} [projectId]
 */
export async function listLedgerEntries(session, projectId) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'ledger' || path.endsWith('/entry.json')) {
			try {
				const bytes = await getPath(session, path);
				const e = JSON.parse(new TextDecoder().decode(bytes));
				e.schema = 'alpha.ledger_entry/1';
				e.project_ids = Array.isArray(e.project_ids) ? e.project_ids : [];
				e.task_ids = Array.isArray(e.task_ids) ? e.task_ids : [];
				e.labels = Array.isArray(e.labels) ? e.labels : [];
				if (!projectId || e.project_ids.includes(projectId)) out.push(e);
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')));
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createLedgerEntry(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const author =
		typeof input.author === 'string' && input.author.trim()
			? input.author.trim().toLowerCase()
			: undefined;
	const entry = {
		schema: 'alpha.ledger_entry/1',
		id,
		occurred_at: input.occurred_at || created,
		currency: input.currency || 'EUR',
		amount_cents: Math.max(0, Math.round(Number(input.amount_cents) || 0)),
		direction: input.direction === 'in' ? 'in' : 'out',
		account_id: input.account_id,
		counter_account_id: input.counter_account_id ?? null,
		kind: input.kind || 'actual',
		cost_behavior: input.cost_behavior || 'none',
		project_ids: input.project_ids ?? [],
		task_ids: input.task_ids ?? [],
		activity_id: input.activity_id ?? null,
		invoice_id: input.invoice_id ?? null,
		order_id: input.order_id ?? null,
		channel: input.channel || undefined,
		tax: input.tax || undefined,
		party: input.party || undefined,
		memo: input.memo || '',
		attachments: input.attachments ?? [],
		labels: input.labels ?? [],
		...(author ? { author } : {}),
		created_at: created,
		updated_at: created
	};
	await putPath(session, `ledger/${id}/entry.json`, 'ledger', JSON.stringify(entry, null, 2));
	return entry;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} entry
 */
export async function putLedgerEntry(session, entry) {
	const author =
		typeof entry.author === 'string' && entry.author.trim()
			? entry.author.trim().toLowerCase()
			: undefined;
	const next = {
		schema: 'alpha.ledger_entry/1',
		id: entry.id,
		occurred_at: entry.occurred_at,
		currency: entry.currency || 'EUR',
		amount_cents: Math.max(0, Math.round(Number(entry.amount_cents) || 0)),
		direction: entry.direction === 'in' ? 'in' : 'out',
		account_id: entry.account_id,
		counter_account_id: entry.counter_account_id ?? null,
		kind: entry.kind || 'actual',
		cost_behavior: entry.cost_behavior || 'none',
		project_ids: Array.isArray(entry.project_ids) ? entry.project_ids : [],
		task_ids: Array.isArray(entry.task_ids) ? entry.task_ids : [],
		activity_id: entry.activity_id ?? null,
		invoice_id: entry.invoice_id ?? null,
		order_id: entry.order_id ?? null,
		channel: entry.channel || undefined,
		tax: entry.tax || undefined,
		party: entry.party || undefined,
		memo: entry.memo || '',
		attachments: entry.attachments ?? [],
		labels: Array.isArray(entry.labels) ? entry.labels : [],
		...(author ? { author } : {}),
		created_at: entry.created_at ?? nowRfc3339(),
		updated_at: nowRfc3339()
	};
	await putPath(
		session,
		`ledger/${next.id}/entry.json`,
		'ledger',
		JSON.stringify(next, null, 2)
	);
	return next;
}

/**
 * @param {any} e
 * @param {any[]} projectList
 * @param {any[]} accountList
 */
export function toUiLedgerEntry(e, projectList, accountList) {
	const byProject = new Map(projectList.map((p) => [p.id, p]));
	const byAccount = new Map(accountList.map((a) => [a.id, a]));
	const byCode = new Map(accountList.map((a) => [a.code, a]));
	const account =
		byAccount.get(e.account_id) || byCode.get(e.account_id) || null;
	const occurredMs = e.occurred_at ? Date.parse(e.occurred_at) : 0;
	return {
		id: e.id,
		occurredAt: Number.isFinite(occurredMs) ? occurredMs : 0,
		occurred_at: e.occurred_at,
		currency: e.currency || 'EUR',
		amount_cents: e.amount_cents ?? 0,
		direction: e.direction,
		account_id: e.account_id,
		account_code: account?.code ?? e.account_id,
		account_title: account?.title ?? e.account_id,
		kind: e.kind || 'actual',
		cost_behavior: e.cost_behavior || 'none',
		channel: e.channel || '',
		memo: e.memo || '',
		project_ids: e.project_ids ?? [],
		task_ids: e.task_ids ?? [],
		targets: (e.project_ids ?? []).map((id) => ({
			id,
			label: byProject.get(id)?.title ?? id
		})),
		tax: e.tax,
		party: e.party,
		labels: e.labels ?? [],
		author: e.author || null,
		_drive: e
	};
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listActivities(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'activity' || path.endsWith('/activity.json')) {
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
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createActivity(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const activity = {
		schema: 'alpha.activity/1',
		id,
		title: input.title,
		description: input.description || '',
		status: input.status || 'draft',
		project_ids: input.project_ids ?? [],
		fixed_cost_cents_month: Math.max(0, Math.round(Number(input.fixed_cost_cents_month) || 0)),
		variable_cost_per_unit_cents: Math.max(
			0,
			Math.round(Number(input.variable_cost_per_unit_cents) || 0)
		),
		unit_label: input.unit_label || '',
		expected_units_month: Number(input.expected_units_month) || 0,
		price_per_unit_cents: Math.max(0, Math.round(Number(input.price_per_unit_cents) || 0)),
		channels: input.channels ?? [],
		currency: input.currency || 'EUR',
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(
		session,
		`activities/${id}/activity.json`,
		'activity',
		JSON.stringify(activity, null, 2)
	);
	return activity;
}

/* ── Atomic costs / sales / enterprise sheets ── */

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listCostItems(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'cost_item' || path.endsWith('/cost_item.json')) {
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
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createCostItem(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const doc = {
		schema: 'alpha.cost_item/1',
		id,
		title: input.title,
		behavior: input.behavior || 'variable',
		amount_cents: Math.max(0, Math.round(Number(input.amount_cents) || 0)),
		currency: input.currency || 'EUR',
		unit_label: input.unit_label || '',
		period: input.period || (input.behavior === 'fixed' ? 'month' : 'once'),
		account_id: input.account_id ?? null,
		project_ids: input.project_ids ?? [],
		task_ids: input.task_ids ?? [],
		labels: input.labels ?? [],
		memo: input.memo || '',
		created_at: created,
		updated_at: created
	};
	await putPath(
		session,
		`costs/${id}/cost_item.json`,
		'cost_item',
		JSON.stringify(doc, null, 2)
	);
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listSalesLines(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'sales_line' || path.endsWith('/sales_line.json')) {
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
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createSalesLine(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const doc = {
		schema: 'alpha.sales_line/1',
		id,
		title: input.title,
		price_cents: Math.max(0, Math.round(Number(input.price_cents) || 0)),
		currency: input.currency || 'EUR',
		unit_label: input.unit_label || '',
		channel: input.channel || '',
		product_id: input.product_id ?? null,
		vat_rate_bp: input.vat_rate_bp ?? undefined,
		project_ids: input.project_ids ?? [],
		labels: input.labels ?? [],
		memo: input.memo || '',
		created_at: created,
		updated_at: created
	};
	await putPath(
		session,
		`sales/${id}/sales_line.json`,
		'sales_line',
		JSON.stringify(doc, null, 2)
	);
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listEnterprises(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'enterprise' || path.endsWith('/enterprise.json')) {
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
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createEnterprise(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const doc = {
		schema: 'alpha.enterprise/1',
		id,
		title: input.title,
		description: input.description || '',
		status: input.status || 'active',
		kind: input.kind || 'activity',
		icon: input.icon || undefined,
		sort: Number.isFinite(Number(input.sort)) ? Number(input.sort) : 100,
		project_ids: input.project_ids ?? [],
		fixed_costs: input.fixed_costs ?? [],
		variable_costs: input.variable_costs ?? [],
		sales: input.sales ?? [],
		output_unit_label: input.output_unit_label || '',
		expected_output_units: Number(input.expected_output_units) || 0,
		expected_output_from_metric_id: input.expected_output_from_metric_id ?? null,
		table_ids: Array.isArray(input.table_ids) ? input.table_ids : [],
		currency: input.currency || 'EUR',
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(
		session,
		`enterprises/${id}/enterprise.json`,
		'enterprise',
		JSON.stringify(doc, null, 2)
	);
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} enterprise
 */
export async function putEnterprise(session, enterprise) {
	const next = {
		...enterprise,
		schema: 'alpha.enterprise/1',
		updated_at: nowRfc3339()
	};
	await putPath(
		session,
		`enterprises/${next.id}/enterprise.json`,
		'enterprise',
		JSON.stringify(next, null, 2)
	);
	return next;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {'task' | 'project' | 'note' | 'enterprise' | 'table' | 'table_row' | 'metric' | 'form' | 'view'} kind
 * @param {string} id
 */
export async function deleteEntity(session, kind, id) {
	const path =
		kind === 'task'
			? `tasks/${id}/task.json`
			: kind === 'project'
				? `projects/${id}/project.json`
				: kind === 'note'
					? `notes/${id}/note.json`
					: kind === 'table'
						? `tables/${id}/table.json`
						: kind === 'table_row'
							? `table_rows/${id}/row.json`
							: kind === 'metric'
								? `metrics/${id}/metric.json`
								: kind === 'form'
									? `forms/${id}/form.json`
									: kind === 'view'
										? `views/${id}/view.json`
										: `enterprises/${id}/enterprise.json`;
	await deletePaths(session, [path]);
}

/* ── Operational tables / metrics / capture forms ── */

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listTables(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'table' || path.endsWith('/table.json')) {
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
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createTable(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const columns = Array.isArray(input.columns)
		? input.columns.map((c) => ({
				id: c.id || newId(),
				key: String(c.key || c.label || 'col')
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '_')
					.replace(/^_|_$/g, '') || 'col',
				label: c.label || c.key || 'Column',
				type: c.type || 'number',
				unit: c.unit || '',
				formula: c.formula || undefined,
				options: Array.isArray(c.options) ? c.options : undefined
			}))
		: [];
	const key =
		String(input.key || input.title || id)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '') || id;
	const doc = {
		schema: 'alpha.table/1',
		id,
		title: input.title || 'Untitled table',
		key,
		description: input.description || '',
		enterprise_id: input.enterprise_id ?? null,
		columns,
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(session, `tables/${id}/table.json`, 'table', JSON.stringify(doc, null, 2));
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} table
 */
export async function putTable(session, table) {
	const next = { ...table, schema: 'alpha.table/1', updated_at: nowRfc3339() };
	await putPath(session, `tables/${next.id}/table.json`, 'table', JSON.stringify(next, null, 2));
	return next;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} [tableId]
 */
export async function listTableRows(session, tableId) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'table_row' || path.endsWith('/row.json')) {
			try {
				const bytes = await getPath(session, path);
				const row = JSON.parse(new TextDecoder().decode(bytes));
				if (tableId && row.table_id !== tableId) continue;
				out.push(row);
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createTableRow(session, input) {
	const docs = await createTableRows(session, [input]);
	return docs[0];
}

/**
 * Batch-append rows with a single tip update.
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>[]} inputs
 */
export async function createTableRows(session, inputs) {
	const created = nowRfc3339();
	const docs = (inputs || []).map((input) => ({
		schema: 'alpha.table_row/1',
		id: newId(),
		table_id: input.table_id,
		cells: input.cells && typeof input.cells === 'object' ? { ...input.cells } : {},
		occurred_on: input.occurred_on || undefined,
		author: input.author || undefined,
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	}));
	if (!docs.length) return docs;
	await putPaths(
		session,
		docs.map((doc) => ({
			path: `table_rows/${doc.id}/row.json`,
			kind: 'table_row',
			plaintext: JSON.stringify(doc, null, 2)
		}))
	);
	return docs;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} row
 */
export async function putTableRow(session, row) {
	const next = { ...row, schema: 'alpha.table_row/1', updated_at: nowRfc3339() };
	await putPath(
		session,
		`table_rows/${next.id}/row.json`,
		'table_row',
		JSON.stringify(next, null, 2)
	);
	return next;
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listMetrics(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'metric' || path.endsWith('/metric.json')) {
			try {
				const bytes = await getPath(session, path);
				out.push(JSON.parse(new TextDecoder().decode(bytes)));
			} catch {
				/* skip */
			}
		}
	}
	out.sort((a, b) => String(a.key || a.title).localeCompare(String(b.key || b.title)));
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createMetric(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const doc = {
		schema: 'alpha.metric/1',
		id,
		key: String(input.key || input.title || id)
			.toLowerCase()
			.replace(/\s+/g, '.'),
		title: input.title || input.key || 'Metric',
		enterprise_id: input.enterprise_id ?? null,
		expr: String(input.expr || '0'),
		unit: input.unit || '',
		value: null,
		computed_at: null,
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(session, `metrics/${id}/metric.json`, 'metric', JSON.stringify(doc, null, 2));
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} metric
 */
export async function putMetric(session, metric) {
	const next = { ...metric, schema: 'alpha.metric/1', updated_at: nowRfc3339() };
	await putPath(
		session,
		`metrics/${next.id}/metric.json`,
		'metric',
		JSON.stringify(next, null, 2)
	);
	return next;
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listForms(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'form' || path.endsWith('/form.json')) {
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
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createForm(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const doc = {
		schema: 'alpha.form/1',
		id,
		title: input.title || 'Capture',
		table_id: input.table_id,
		enterprise_id: input.enterprise_id ?? null,
		fields: Array.isArray(input.fields) ? input.fields : [],
		occurred_on_field: input.occurred_on_field !== false,
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(session, `forms/${id}/form.json`, 'form', JSON.stringify(doc, null, 2));
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} form
 */
export async function putForm(session, form) {
	const next = { ...form, schema: 'alpha.form/1', updated_at: nowRfc3339() };
	await putPath(session, `forms/${next.id}/form.json`, 'form', JSON.stringify(next, null, 2));
	return next;
}

/* ── Views (table/metric overviews) ── */

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listViews(session) {
	const dir = await loadRootDir(session);
	/** @type {any[]} */
	const out = [];
	for (const [path, child] of Object.entries(dir.children ?? {})) {
		if (child.kind === 'view' || path.endsWith('/view.json')) {
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
 * @param {import('./client.js').DriveSession} session
 * @param {Record<string, any>} input
 */
export async function createView(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const doc = {
		schema: 'alpha.view/1',
		id,
		title: input.title || 'Untitled view',
		description: input.description || '',
		enterprise_id: input.enterprise_id ?? null,
		table_ids: Array.isArray(input.table_ids) ? input.table_ids : [],
		metric_ids: Array.isArray(input.metric_ids) ? input.metric_ids : [],
		labels: input.labels ?? [],
		created_at: created,
		updated_at: created
	};
	await putPath(session, `views/${id}/view.json`, 'view', JSON.stringify(doc, null, 2));
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} view
 */
export async function putView(session, view) {
	const next = { ...view, schema: 'alpha.view/1', updated_at: nowRfc3339() };
	await putPath(session, `views/${next.id}/view.json`, 'view', JSON.stringify(next, null, 2));
	return next;
}

/* ── Chat messages + per-entity comment indexes ── */

const FEED_MAX = 200;

/** Tip-scoped feed id cache — skip feed.json download on send when tip unchanged. */
let cachedFeedTip = '';
/** @type {string[]} */
let cachedFeedIds = [];

/**
 * @param {string} tip
 * @param {string[]} ids
 */
function rememberFeedIds(tip, ids) {
	if (!tip || !Array.isArray(ids)) return;
	cachedFeedTip = tip;
	cachedFeedIds = ids.map(String);
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} id
 * @param {any} [dir]
 */
export async function getChatMessage(session, id, dir) {
	const path = `chat/messages/${id}.json`;
	const root = dir || (await loadRootDir(session));
	const hash = root?.children?.[path]?.hash || root?.children?.[path.replace(/^\//, '')]?.hash;
	const { getCachedLeaf, putCachedLeaf } = await import('./leaf-cache.js');
	if (hash) {
		const hit = await getCachedLeaf(hash);
		if (hit) return hit;
	}
	const { bytes } = dir
		? await getPathFromDir(session, dir, path)
		: { bytes: await getPath(session, path) };
	const doc = JSON.parse(new TextDecoder().decode(bytes));
	if (hash) void putCachedLeaf(hash, doc);
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {'task' | 'note' | 'project'} type
 * @param {string} entityId
 * @returns {Promise<string[]>}
 */
export async function listCommentIds(session, type, entityId) {
	const path = `${type}s/${entityId}/comments.json`;
	try {
		const bytes = await getPath(session, path);
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		if (Array.isArray(doc)) return doc.map(String);
		if (Array.isArray(doc?.ids)) return doc.ids.map(String);
		return [];
	} catch {
		return [];
	}
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {'task' | 'note' | 'project'} type
 * @param {string} entityId
 */
export async function listComments(session, type, entityId) {
	const ids = await listCommentIds(session, type, entityId);
	/** @type {any[]} */
	const out = [];
	for (const id of ids) {
		try {
			out.push(await getChatMessage(session, id));
		} catch {
			/* missing leaf — skip */
		}
	}
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @returns {Promise<string[]>}
 */
export async function listFeedIds(session) {
	try {
		const bytes = await getPath(session, 'chat/feed.json');
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		if (Array.isArray(doc?.ids)) return doc.ids.map(String);
		if (Array.isArray(doc)) return doc.map(String);
		return [];
	} catch {
		return [];
	}
}

/**
 * Load feed messages with leaf-cache + one tip/dir load (same pattern as listTracks).
 * Optional onPartial paints cache hits / early batches before misses finish.
 * @param {import('./client.js').DriveSession} session
 * @param {number} [limit]
 * @param {{ onPartial?: (rows: any[]) => void }} [opts]
 */
export async function listFeedMessages(session, limit = FEED_MAX, opts = {}) {
	const { tip, dir } = await loadRootDirWithTip(session);
	const ids = (await listFeedIdsFromDir(session, dir)).slice(0, limit);
	rememberFeedIds(tip, ids);
	if (!ids.length) return [];

	const { getCachedLeaf, mapPool, putCachedLeaf } = await import('./leaf-cache.js');
	/** @type {{ id: string, path: string, hash: string | null }[]} */
	const entries = ids.map((id) => {
		const path = `chat/messages/${id}.json`;
		const child = dir.children?.[path];
		return { id: String(id), path, hash: child?.hash ? String(child.hash) : null };
	});

	/** @type {(any | null)[]} */
	const slots = new Array(entries.length).fill(null);

	await mapPool(entries, 48, async (entry, i) => {
		if (!entry.hash) return;
		const hit = await getCachedLeaf(entry.hash);
		if (hit) slots[i] = hit;
	});

	const partial = () => {
		if (typeof opts.onPartial !== 'function') return;
		opts.onPartial(slots.filter(Boolean));
	};
	/* Paint IndexedDB hits immediately — hard refresh should not wait on network. */
	if (slots.some(Boolean)) partial();

	/** @type {number[]} */
	const missIdx = [];
	for (let i = 0; i < slots.length; i++) {
		if (!slots[i]) missIdx.push(i);
	}

	let lastPartialCount = slots.filter(Boolean).length;
	await mapPool(missIdx, 32, async (i) => {
		const entry = entries[i];
		try {
			const { bytes } = await getPathFromDir(session, dir, entry.path);
			const doc = JSON.parse(new TextDecoder().decode(bytes));
			if (entry.hash) void putCachedLeaf(entry.hash, doc);
			slots[i] = doc;
		} catch {
			slots[i] = null;
		}
		const filled = slots.filter(Boolean).length;
		/* First screenful ASAP, then every ~24 newly filled leaves. */
		if (filled >= 24 && filled - lastPartialCount >= 24) {
			lastPartialCount = filled;
			partial();
		} else if (filled >= 12 && lastPartialCount < 12) {
			lastPartialCount = filled;
			partial();
		}
	});
	partial();
	return slots.filter(Boolean);
}

/**
 * Read feed ids from an already-loaded root dir (no tip GET).
 * @param {import('./client.js').DriveSession} session
 * @param {any} dir
 */
async function listFeedIdsFromDir(session, dir) {
	try {
		const { bytes } = await getPathFromDir(session, dir, 'chat/feed.json');
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		if (Array.isArray(doc?.ids)) return doc.ids.map(String);
		if (Array.isArray(doc)) return doc.map(String);
		return [];
	} catch {
		return [];
	}
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {any} dir
 * @param {'task' | 'note' | 'project'} type
 * @param {string} entityId
 */
async function listCommentIdsFromDir(session, dir, type, entityId) {
	const path = `${type}s/${entityId}/comments.json`;
	try {
		const { bytes } = await getPathFromDir(session, dir, path);
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		if (Array.isArray(doc)) return doc.map(String);
		if (Array.isArray(doc?.ids)) return doc.ids.map(String);
		return [];
	} catch {
		return [];
	}
}

/**
 * Write a chat/comment leaf, append entity comments.json + chat/feed.json.
 * Pass `knownFeedIds` / `knownCommentIds` to skip the pre-write GET round-trips.
 * @param {import('./client.js').DriveSession} session
 * @param {{
 *   body: string,
 *   author: string,
 *   kind?: 'comment' | 'chat' | 'reaction' | 'event',
 *   ref?: { type: string, id: string } | null,
 *   reaction?: string,
 *   reply_to?: string | null,
 *   channel_id?: string,
 *   attachments?: any[],
 *   delivery?: string
 * }} input
 * @param {{
 *   knownFeedIds?: string[],
 *   knownCommentIds?: string[],
 *   onLeafStored?: (msg: any) => void
 * }} [opts]
 */
export async function createChatMessage(session, input, opts = {}) {
	const id = newId();
	const created = nowRfc3339();
	const kind = input.kind || (input.ref ? 'comment' : 'chat');
	const channelId = String(input.channel_id || 'general');
	const msg = {
		schema: 'alpha.chat_message/1',
		id,
		kind,
		author: input.author,
		body: input.body ?? '',
		created_at: created,
		channel_id: channelId,
		delivery: input.delivery || 'sent',
		read_by: [],
		...(input.ref ? { ref: { type: input.ref.type, id: input.ref.id } } : {}),
		...(input.reaction ? { reaction: input.reaction } : {}),
		...(input.reply_to ? { reply_to: input.reply_to } : {}),
		...(Array.isArray(input.attachments) && input.attachments.length
			? {
					attachments: input.attachments.map((a) => ({
						path: String(a.path || ''),
						content_type: String(a.content_type || 'application/octet-stream'),
						kind: a.kind === 'image' || a.kind === 'video' || a.kind === 'voice' ? a.kind : 'file',
						...(a.name ? { name: String(a.name) } : {}),
						...(typeof a.bytes === 'number' ? { bytes: a.bytes } : {}),
						...(typeof a.duration_ms === 'number' ? { duration_ms: a.duration_ms } : {})
					}))
				}
			: {})
	};

	const known = Array.isArray(opts.knownFeedIds) ? opts.knownFeedIds : [];
	const knownComments = Array.isArray(opts.knownCommentIds) ? opts.knownCommentIds : [];
	const wantsComments =
		kind !== 'event' &&
		Boolean(
			input.ref &&
				(input.ref.type === 'task' || input.ref.type === 'note' || input.ref.type === 'project')
		);
	const refType = wantsComments
		? /** @type {'task'|'note'|'project'} */ (input.ref.type)
		: null;
	const refId = wantsComments ? String(input.ref.id) : '';
	const leafPlain = JSON.stringify(msg);

	/**
	 * @param {string[]} feedIds
	 * @param {string[]} [commentIds]
	 */
	function buildWrites(feedIds, commentIds) {
		/** @type {{ path: string, kind: string, plaintext: string }[]} */
		const writes = [
			{
				path: `chat/messages/${id}.json`,
				kind: 'chat_message',
				plaintext: leafPlain
			},
			{
				path: 'chat/feed.json',
				kind: 'chat_feed',
				plaintext: JSON.stringify({
					schema: 'alpha.chat_feed/1',
					ids: feedIds,
					updated_at: created
				})
			}
		];
		if (wantsComments && refType && refId) {
			writes.push({
				path: `${refType}s/${refId}/comments.json`,
				kind: 'blob',
				plaintext: JSON.stringify({
					schema: 'alpha.comments_index/1',
					ids: commentIds || []
				})
			});
		}
		return writes;
	}

	/**
	 * Merge live feed ids from dir (or tip-scoped memory cache).
	 * @param {any} dir
	 * @param {string} tip
	 */
	async function resolveFeedIds(dir, tip) {
		if (tip && tip === cachedFeedTip && cachedFeedIds.length) {
			return [id, ...cachedFeedIds, ...known]
				.filter((x, i, arr) => x && arr.indexOf(x) === i)
				.slice(0, FEED_MAX);
		}
		const liveFeed = await listFeedIdsFromDir(session, dir);
		rememberFeedIds(tip, liveFeed);
		return [id, ...liveFeed, ...known]
			.filter((x, i, arr) => x && arr.indexOf(x) === i)
			.slice(0, FEED_MAX);
	}

	/**
	 * @param {any} dir
	 */
	async function resolveCommentIds(dir) {
		if (!wantsComments || !refType || !refId) return /** @type {string[]} */ ([]);
		const liveComments = await listCommentIdsFromDir(session, dir, refType, refId);
		return [...liveComments, ...knownComments, id].filter(
			(x, i, arr) => x && arr.indexOf(x) === i
		);
	}

	/*
	 * DeltaChat-ish send:
	 * 1) Encrypt + putBlock the leaf immediately → onLeafStored (✓) before tip work.
	 * 2) Tip/dir update can finish after; peers discover via tip shortly after.
	 */
	const leafPath = `chat/messages/${id}.json`;
	const root = parseRootKey(session.rootKey);
	const leafBytes = new TextEncoder().encode(leafPlain);
	const { ciphertext: leafCt, fileKeyHex: leafKey } = await encrypt(root, leafPath, leafBytes);
	const leafHash = await sha256Hex(leafCt);
	await putBlock(session, leafHash, leafCt);
	try {
		opts.onLeafStored?.(msg);
	} catch {
		/* UI settle must never break the tip write */
	}

	/** @type {string[]} */
	let feedIds;
	/** @type {string[]} */
	let commentIds = [];
	let tipWarm = false;
	let tipNow = peekCachedTip(session) || '';
	if (!tipNow || tipNow !== cachedFeedTip) {
		try {
			tipNow = await getTip(session);
		} catch {
			tipNow = tipNow || '';
		}
	}
	if (tipNow && tipNow === cachedFeedTip && cachedFeedIds.length && !wantsComments) {
		tipWarm = true;
		feedIds = [id, ...cachedFeedIds, ...known]
			.filter((x, i, arr) => x && arr.indexOf(x) === i)
			.slice(0, FEED_MAX);
	} else {
		const { tip: tipAtStart, dir: dirAtStart } = await loadRootDirWithTip(session);
		feedIds = await resolveFeedIds(dirAtStart, tipAtStart);
		commentIds = await resolveCommentIds(dirAtStart);
	}

	const tipAfter = await putPaths(session, buildWrites(feedIds, commentIds), {
		/* Leaf already on the server — reuse ciphertext, don't re-upload. */
		prePrepared: {
			[leafPath]: { hash: leafHash, wrapped_key: leafKey, kind: 'chat_message' }
		},
		/* Warm tip + memory feed ids: skip confirmatory getTip (saves ~1 RTT). */
		skipTipProbe: tipWarm,
		rematerialize: async (dir) => {
			const liveFeed = await listFeedIdsFromDir(session, dir);
			const nextFeed = [id, ...liveFeed, ...known]
				.filter((x, i, arr) => x && arr.indexOf(x) === i)
				.slice(0, FEED_MAX);
			const nextComments = await resolveCommentIds(dir);
			return buildWrites(nextFeed, nextComments);
		}
	});
	if (tipAfter) rememberFeedIds(String(tipAfter), feedIds);
	try {
		if (tipAfter) opts.onTipWritten?.(String(tipAfter));
	} catch {
		/* realtime wake must never break send */
	}
	return msg;
}

/**
 * Persist read receipts on a message leaf (delivery=read when another account opens chat).
 * Prefer markChatMessagesRead for batches — one tip write, not N.
 * @param {import('./client.js').DriveSession} session
 * @param {any} msg
 * @param {string} readerEmail
 */
export async function markChatMessageRead(session, msg, readerEmail) {
	const [next] = await markChatMessagesRead(session, [msg], readerEmail);
	return next || msg;
}

/**
 * Batch read receipts into a single tip update (was N tip writes = multi-second stalls).
 * @param {import('./client.js').DriveSession} session
 * @param {any[]} messages
 * @param {string} readerEmail
 * @returns {Promise<any[]>}
 */
export async function markChatMessagesRead(session, messages, readerEmail) {
	const reader = String(readerEmail || '')
		.trim()
		.toLowerCase();
	if (!session || !reader || !Array.isArray(messages) || !messages.length) return [];

	/** @type {{ path: string, kind: string, plaintext: string }[]} */
	const writes = [];
	/** @type {any[]} */
	const updated = [];
	for (const msg of messages) {
		const id = String(msg?.id || '').trim();
		if (!id || id.startsWith('local-')) continue;
		const author = String(msg.author || '')
			.trim()
			.toLowerCase();
		if (!author || author === reader) continue;
		const prev = Array.isArray(msg.read_by)
			? msg.read_by.map((e) => String(e).toLowerCase())
			: [];
		if (prev.includes(reader)) continue;
		const next = {
			...msg,
			read_by: [...prev, reader],
			delivery: 'read'
		};
		writes.push({
			path: `chat/messages/${id}.json`,
			kind: 'chat_message',
			plaintext: JSON.stringify(next)
		});
		updated.push(next);
	}
	if (!writes.length) return [];
	await putPaths(session, writes);
	return updated;
}

/**
 * Remove a chat message leaf and drop it from `chat/feed.json`.
 * Pass `knownFeedIds` to skip the pre-delete GET.
 * @param {import('./client.js').DriveSession} session
 * @param {string} id
 * @param {{ knownFeedIds?: string[] }} [opts]
 */
export async function deleteChatMessage(session, id, opts = {}) {
	const sid = String(id || '').trim();
	if (!sid || sid.startsWith('local-')) return;

	let serverFeed = [];
	try {
		serverFeed = await listFeedIds(session);
	} catch {
		serverFeed = [];
	}
	const known = Array.isArray(opts.knownFeedIds) ? opts.knownFeedIds : [];
	const feedIds = [...serverFeed, ...known].filter((x, i, arr) => x && arr.indexOf(x) === i);
	const nextIds = feedIds.filter((x) => x !== sid).slice(0, FEED_MAX);
	const updated = nowRfc3339();
	await putPaths(session, [
		{
			path: 'chat/feed.json',
			kind: 'chat_feed',
			plaintext: JSON.stringify(
				{ schema: 'alpha.chat_feed/1', ids: nextIds, updated_at: updated },
				null,
				2
			)
		}
	]);
	try {
		await deletePaths(session, [`chat/messages/${sid}.json`]);
	} catch {
		/* feed index is enough for UI */
	}
}

/* ── Personal mail (Drive-backed until Stalwart IMAP) ── */

const MAIL_INDEX_MAX = 500;

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} id
 */
export async function getMailMessage(session, id) {
	const bytes = await getPath(session, `mail/messages/${id}.json`);
	return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * @param {import('./client.js').DriveSession} session
 * @returns {Promise<string[]>}
 */
export async function listMailIds(session) {
	try {
		const bytes = await getPath(session, 'mail/index.json');
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		if (Array.isArray(doc?.ids)) return doc.ids.map(String);
		if (Array.isArray(doc)) return doc.map(String);
		return [];
	} catch {
		return [];
	}
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {number} [limit]
 */
export async function listMailMessages(session, limit = 200) {
	const ids = (await listMailIds(session)).slice(0, limit);
	/** @type {any[]} */
	const out = [];
	for (const id of ids) {
		try {
			out.push(await getMailMessage(session, id));
		} catch {
			/* skip missing leaf */
		}
	}
	return out;
}

/**
 * Create a Space-local mail message (not SMTP). Visible to recipients who share this Drive.
 * @param {import('./client.js').DriveSession} session
 * @param {{
 *   from: string,
 *   to: string[],
 *   subject: string,
 *   body: string
 * }} input
 */
export async function createMailMessage(session, input) {
	const id = newId();
	const created = nowRfc3339();
	const to = [...new Set((input.to || []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
	if (!to.length) throw new Error('Add at least one recipient');
	const from = (input.from || '').trim().toLowerCase();
	if (!from) throw new Error('Sender required');

	const msg = {
		schema: 'alpha.mail_message/1',
		id,
		from,
		to,
		subject: (input.subject || '').trim() || '(no subject)',
		body: input.body ?? '',
		created_at: created,
		transport: 'drive',
		read_by: [from]
	};

	let ids = [];
	try {
		ids = await listMailIds(session);
	} catch {
		ids = [];
	}
	ids = [id, ...ids.filter((x) => x !== id)].slice(0, MAIL_INDEX_MAX);

	await putPaths(session, [
		{
			path: `mail/messages/${id}.json`,
			kind: 'mail_message',
			plaintext: JSON.stringify(msg, null, 2)
		},
		{
			path: 'mail/index.json',
			kind: 'mail_index',
			plaintext: JSON.stringify(
				{ schema: 'alpha.mail_index/1', ids, updated_at: created },
				null,
				2
			)
		}
	]);
	return msg;
}

/**
 * Persist mail leaf (e.g. mark read).
 * @param {import('./client.js').DriveSession} session
 * @param {any} msg
 */
export async function putMailMessage(session, msg) {
	const id = msg?.id;
	if (!id) throw new Error('Mail message missing id');
	const next = {
		...msg,
		schema: 'alpha.mail_message/1',
		id,
		transport: msg.transport || 'drive'
	};
	await putPath(
		session,
		`mail/messages/${id}.json`,
		'mail_message',
		JSON.stringify(next, null, 2)
	);
	return next;
}

/* ── Web Push subscriptions (per device; fan-out from chat senders) ── */

/**
 * @param {import('./client.js').DriveSession} session
 * @returns {Promise<string[]>}
 */
export async function listPushSubscriptionIds(session) {
	try {
		const bytes = await getPath(session, 'chat/push/index.json');
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		if (Array.isArray(doc?.ids)) return doc.ids.map(String);
		if (Array.isArray(doc)) return doc.map(String);
		return [];
	} catch {
		return [];
	}
}

/**
 * @param {import('./client.js').DriveSession} session
 */
export async function listPushSubscriptions(session) {
	const ids = await listPushSubscriptionIds(session);
	/** @type {any[]} */
	const out = [];
	for (const id of ids) {
		try {
			const bytes = await getPath(session, `chat/push/${id}.json`);
			out.push(JSON.parse(new TextDecoder().decode(bytes)));
		} catch {
			/* missing */
		}
	}
	return out;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {{
 *   id: string,
 *   email: string,
 *   endpoint: string,
 *   keys: { p256dh: string, auth: string },
 *   expirationTime?: number | null,
 *   userAgent?: string
 * }} input
 */
export async function upsertPushSubscription(session, input) {
	const id = String(input.id || '').trim();
	if (!id) throw new Error('Push subscription missing id');
	const updated = nowRfc3339();
	const doc = {
		schema: 'alpha.push_subscription/1',
		id,
		email: String(input.email || '').trim().toLowerCase(),
		endpoint: String(input.endpoint || ''),
		keys: {
			p256dh: String(input.keys?.p256dh || ''),
			auth: String(input.keys?.auth || '')
		},
		expirationTime: input.expirationTime ?? null,
		userAgent: String(input.userAgent || ''),
		updated_at: updated
	};

	let ids = await listPushSubscriptionIds(session);
	ids = [id, ...ids.filter((x) => x !== id)].slice(0, 40);

	await putPaths(session, [
		{
			path: `chat/push/${id}.json`,
			kind: 'blob',
			plaintext: JSON.stringify(doc, null, 2)
		},
		{
			path: 'chat/push/index.json',
			kind: 'blob',
			plaintext: JSON.stringify(
				{ schema: 'alpha.push_index/1', ids, updated_at: updated },
				null,
				2
			)
		}
	]);
	return doc;
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {string} id
 */
export async function removePushSubscription(session, id) {
	const sid = String(id || '').trim();
	if (!sid) return;
	const ids = (await listPushSubscriptionIds(session)).filter((x) => x !== sid);
	const updated = nowRfc3339();
	await putPaths(session, [
		{
			path: 'chat/push/index.json',
			kind: 'blob',
			plaintext: JSON.stringify(
				{ schema: 'alpha.push_index/1', ids, updated_at: updated },
				null,
				2
			)
		}
	]);
	try {
		await deletePaths(session, [`chat/push/${sid}.json`]);
	} catch {
		/* index is enough */
	}
}
