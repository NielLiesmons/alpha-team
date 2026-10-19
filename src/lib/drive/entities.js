/** Project / Task / Note / Track helpers over the browser Drive client. */

import { parseAudioFilename, readAudioTags, stripId3Containers } from './audio-meta.js';
import {
	deletePaths,
	getPath,
	getPathFromDir,
	loadRootDir,
	loadRootDirWithTip,
	putPath,
	putPaths
} from './client.js';
import { sha256Hex } from './crypto.js';
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
		milestones: Array.isArray(input.milestones) ? input.milestones : [],
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
	/* Projects use a single description — drop legacy body if present */
	delete next.body;
	if (!Array.isArray(next.milestones)) next.milestones = [];
	if (!next.status) next.status = 'planned';
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
 * Decode any browser-readable image and re-encode as JPEG (max edge 1400).
 * Rejects HEIC/unsupported types with a clear error instead of a silent fail.
 * @param {File | Blob} file
 * @returns {Promise<Uint8Array>}
 */
async function encodeCoverJpeg(file) {
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

	const maxEdge = 1400;
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
					t.track_no = t.track_no ?? null;
					t.disc_no = t.disc_no ?? null;
					slots[i] = t;
				} catch {
					/* skip broken entry */
				}
			}
		}
	);
	await Promise.all(workers);

	return sortTracks(slots.filter(Boolean));
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
