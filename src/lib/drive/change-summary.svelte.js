/**
 * Tiny encrypted Space change-summary (named tip `space-meta`).
 * After Space tip-hash mismatch: one small fetch → per-type watermarks for
 * ASAP badges / selective title spinners; defer fat root rematerialize.
 *
 * Schema: alpha.change_summary/1
 * AAD path: meta/change_summary.json
 */
import { getNamedEncrypted, putNamedEncrypted } from './client.js';
import { tipGateKey } from './tip-gate.js';

/** @typedef {import('./client.js').DriveSession} DriveSession */

export const SPACE_META_TIP = 'space-meta';
export const CHANGE_SUMMARY_AAD = 'meta/change_summary.json';
export const CHANGE_SUMMARY_SCHEMA = 'alpha.change_summary/1';

const LS_APPLIED = 'alpha.drive.changeSummary.applied.v1';
const LS_CACHE = 'alpha.drive.changeSummary.cache.v1';

/** @typedef {'tasks' | 'notes' | 'projects' | 'moments' | 'files' | 'mail' | 'chat'} SyncSection */

/**
 * @typedef {{
 *   schema: string,
 *   tasks_max_created_at: string,
 *   tasks_max_updated_at: string,
 *   notes_max_created_at: string,
 *   notes_max_updated_at: string,
 *   projects_max_updated_at: string,
 *   moments_max_updated_at: string,
 *   files_max_updated_at: string,
 *   updated_at: string
 * }} ChangeSummary
 */

/** @returns {ChangeSummary} */
export function emptyChangeSummary() {
	return {
		schema: CHANGE_SUMMARY_SCHEMA,
		tasks_max_created_at: '',
		tasks_max_updated_at: '',
		notes_max_created_at: '',
		notes_max_updated_at: '',
		projects_max_updated_at: '',
		moments_max_updated_at: '',
		files_max_updated_at: '',
		updated_at: ''
	};
}

/** @type {{ ready: boolean, doc: ChangeSummary, applied: ChangeSummary, pending: Record<string, boolean> }} */
export const changeSummaryUi = $state({
	ready: false,
	doc: emptyChangeSummary(),
	applied: emptyChangeSummary(),
	pending: {}
});

/** Serialize space-meta writes (entity puts can race). */
let metaWriteChain = Promise.resolve();

/** @param {string} a @param {string} b */
function maxIso(a, b) {
	const aa = String(a || '');
	const bb = String(b || '');
	if (!aa) return bb;
	if (!bb) return aa;
	return aa >= bb ? aa : bb;
}

/** @param {unknown} raw */
function parseIso(raw) {
	if (typeof raw !== 'string' || !raw.trim()) return '';
	const t = Date.parse(raw);
	if (!Number.isFinite(t) || t <= 0) return '';
	return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** @param {unknown} raw @returns {ChangeSummary} */
export function normalizeChangeSummary(raw) {
	const base = emptyChangeSummary();
	if (!raw || typeof raw !== 'object') return base;
	const o = /** @type {Record<string, unknown>} */ (raw);
	return {
		schema: CHANGE_SUMMARY_SCHEMA,
		tasks_max_created_at: parseIso(o.tasks_max_created_at),
		tasks_max_updated_at: parseIso(o.tasks_max_updated_at),
		notes_max_created_at: parseIso(o.notes_max_created_at),
		notes_max_updated_at: parseIso(o.notes_max_updated_at),
		projects_max_updated_at: parseIso(o.projects_max_updated_at),
		moments_max_updated_at: parseIso(o.moments_max_updated_at),
		files_max_updated_at: parseIso(o.files_max_updated_at),
		updated_at: parseIso(o.updated_at) || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
	};
}

/** @param {DriveSession} session */
function lsKey(session, prefix) {
	return `${prefix}:${tipGateKey(session)}`;
}

/** @param {DriveSession} session @param {ChangeSummary} doc */
function writeLs(session, prefix, doc) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(lsKey(session, prefix), JSON.stringify(doc));
	} catch {
		/* quota */
	}
}

/** @param {DriveSession} session */
function readLs(session, prefix) {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(lsKey(session, prefix));
		if (!raw) return null;
		return normalizeChangeSummary(JSON.parse(raw));
	} catch {
		return null;
	}
}

/**
 * Hydrate last-known summary from localStorage (sync, for ASAP badge paint).
 * @param {DriveSession} session
 */
export function hydrateChangeSummaryLocal(session) {
	if (!session) return;
	const cached = readLs(session, LS_CACHE);
	const applied = readLs(session, LS_APPLIED);
	if (cached) changeSummaryUi.doc = cached;
	if (applied) changeSummaryUi.applied = applied;
	changeSummaryUi.ready = true;
	recomputePending();
}

/** @param {ChangeSummary} a @param {ChangeSummary} b */
function mergeSummary(a, b) {
	return normalizeChangeSummary({
		tasks_max_created_at: maxIso(a.tasks_max_created_at, b.tasks_max_created_at),
		tasks_max_updated_at: maxIso(a.tasks_max_updated_at, b.tasks_max_updated_at),
		notes_max_created_at: maxIso(a.notes_max_created_at, b.notes_max_created_at),
		notes_max_updated_at: maxIso(a.notes_max_updated_at, b.notes_max_updated_at),
		projects_max_updated_at: maxIso(a.projects_max_updated_at, b.projects_max_updated_at),
		moments_max_updated_at: maxIso(a.moments_max_updated_at, b.moments_max_updated_at),
		files_max_updated_at: maxIso(a.files_max_updated_at, b.files_max_updated_at),
		updated_at: maxIso(a.updated_at, b.updated_at)
	});
}

function recomputePending() {
	const d = changeSummaryUi.doc;
	const a = changeSummaryUi.applied;
	/** @type {Record<string, boolean>} */
	const pending = {};
	if (d.tasks_max_updated_at && d.tasks_max_updated_at > (a.tasks_max_updated_at || '')) {
		pending.tasks = true;
	}
	if (d.notes_max_updated_at && d.notes_max_updated_at > (a.notes_max_updated_at || '')) {
		pending.notes = true;
	}
	if (d.projects_max_updated_at && d.projects_max_updated_at > (a.projects_max_updated_at || '')) {
		pending.projects = true;
	}
	if (d.moments_max_updated_at && d.moments_max_updated_at > (a.moments_max_updated_at || '')) {
		pending.moments = true;
		pending.planning = true;
	}
	if (d.files_max_updated_at && d.files_max_updated_at > (a.files_max_updated_at || '')) {
		pending.files = true;
		pending.drive = true;
	}
	changeSummaryUi.pending = pending;
}

/**
 * Mark summary as applied after a successful workspace crawl.
 * @param {DriveSession} session
 * @param {ChangeSummary} [doc]
 */
export function markChangeSummaryApplied(session, doc = changeSummaryUi.doc) {
	const next = normalizeChangeSummary(doc);
	changeSummaryUi.applied = next;
	changeSummaryUi.doc = mergeSummary(changeSummaryUi.doc, next);
	writeLs(session, LS_APPLIED, next);
	writeLs(session, LS_CACHE, changeSummaryUi.doc);
	recomputePending();
}

/**
 * Fetch space-meta tip blob. Updates changeSummaryUi; does not rematerialize Space root.
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 * @returns {Promise<ChangeSummary | null>}
 */
export async function fetchChangeSummary(session, signal) {
	try {
		const bytes = await getNamedEncrypted(session, SPACE_META_TIP, CHANGE_SUMMARY_AAD, signal);
		if (!bytes) {
			changeSummaryUi.ready = true;
			return null;
		}
		const doc = normalizeChangeSummary(JSON.parse(new TextDecoder().decode(bytes)));
		changeSummaryUi.doc = doc;
		changeSummaryUi.ready = true;
		writeLs(session, LS_CACHE, doc);
		recomputePending();
		return doc;
	} catch {
		changeSummaryUi.ready = true;
		return null;
	}
}

/**
 * @param {Partial<ChangeSummary>} patch
 * @param {DriveSession} session
 */
export async function bumpChangeSummary(session, patch) {
	if (!session || !patch) return;
	const run = async () => {
		let base = changeSummaryUi.doc;
		try {
			const remote = await fetchChangeSummary(session);
			if (remote) base = remote;
		} catch {
			/* use local */
		}
		const next = mergeSummary(base, normalizeChangeSummary({ ...patch, updated_at: patch.updated_at || new Date().toISOString() }));
		next.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
		await putNamedEncrypted(session, SPACE_META_TIP, CHANGE_SUMMARY_AAD, JSON.stringify(next));
		changeSummaryUi.doc = next;
		changeSummaryUi.ready = true;
		writeLs(session, LS_CACHE, next);
		/* Writer already has local entities — treat as applied so we don't self-spin. */
		markChangeSummaryApplied(session, next);
	};
	metaWriteChain = metaWriteChain.then(run, run);
	return metaWriteChain;
}

/**
 * Inspect putPaths entries and bump watermarks (skips meta/cursors).
 * @param {DriveSession} session
 * @param {{ path: string, plaintext: Uint8Array | string }[]} entries
 */
export function bumpChangeSummaryFromPuts(session, entries) {
	if (!session || !entries?.length) return Promise.resolve();
	/** @type {Partial<ChangeSummary>} */
	const patch = {};
	let any = false;
	for (const entry of entries) {
		const path = String(entry.path || '')
			.split('/')
			.filter(Boolean)
			.join('/');
		if (!path || path.startsWith('meta/cursors/')) continue;
		let doc = /** @type {Record<string, unknown> | null} */ (null);
		try {
			const text =
				typeof entry.plaintext === 'string'
					? entry.plaintext
					: new TextDecoder().decode(entry.plaintext);
			doc = JSON.parse(text);
		} catch {
			doc = null;
		}
		const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
		const created = parseIso(doc?.created_at) || now;
		const updated = parseIso(doc?.updated_at) || created || now;

		if (/^tasks\/[^/]+\/task\.json$/.test(path)) {
			patch.tasks_max_created_at = maxIso(patch.tasks_max_created_at || '', created);
			patch.tasks_max_updated_at = maxIso(patch.tasks_max_updated_at || '', updated);
			any = true;
		} else if (/^notes\/[^/]+\/note\.json$/.test(path)) {
			patch.notes_max_created_at = maxIso(patch.notes_max_created_at || '', created);
			patch.notes_max_updated_at = maxIso(patch.notes_max_updated_at || '', updated);
			any = true;
		} else if (/^projects\/[^/]+\/project\.json$/.test(path)) {
			patch.projects_max_updated_at = maxIso(patch.projects_max_updated_at || '', updated);
			any = true;
		} else if (/^moments\/[^/]+\/moment\.json$/.test(path)) {
			patch.moments_max_updated_at = maxIso(patch.moments_max_updated_at || '', updated);
			any = true;
		} else if (path.startsWith('files/') || path.startsWith('media/')) {
			patch.files_max_updated_at = maxIso(patch.files_max_updated_at || '', updated || now);
			any = true;
		}
	}
	if (!any) return Promise.resolve();
	return bumpChangeSummary(session, patch);
}

/**
 * Sections that need a Space crawl given current summary vs applied.
 * Empty array + tip mismatch + no summary → treat as all workspace domains.
 * @param {boolean} tipMismatch
 * @returns {SyncSection[]}
 */
export function dirtySectionsFromSummary(tipMismatch) {
	if (!tipMismatch) return [];
	recomputePending();
	const p = changeSummaryUi.pending;
	/** @type {SyncSection[]} */
	const out = [];
	if (p.tasks) out.push('tasks');
	if (p.notes) out.push('notes');
	if (p.projects) out.push('projects');
	if (p.moments || p.planning) out.push('moments');
	if (p.files || p.drive) out.push('files');
	/* No summary yet (legacy Space) — crawl everything once tip moved. */
	if (!out.length && !changeSummaryUi.doc.updated_at) {
		return ['tasks', 'notes', 'projects', 'moments', 'files'];
	}
	return out;
}

/**
 * Map route pathname → sync section for title spinner.
 * @param {string} pathname
 * @returns {SyncSection | null}
 */
export function sectionForPath(pathname) {
	const p = String(pathname || '');
	if (p.startsWith('/tasks')) return 'tasks';
	if (p.startsWith('/notes')) return 'notes';
	if (p.startsWith('/projects') || p.startsWith('/entreprises')) return 'projects';
	if (p.startsWith('/planning')) return 'moments';
	if (p.startsWith('/drive')) return 'files';
	if (p.startsWith('/mail')) return 'mail';
	if (p.startsWith('/chat')) return 'chat';
	return null;
}

/**
 * ASAP badge hint: watermark newer than person cursor (ms).
 * @param {'tasks' | 'notes'} kind
 * @param {number} seenMs
 */
export function watermarkSuggestsNew(kind, seenMs) {
	const d = changeSummaryUi.doc;
	const iso = kind === 'tasks' ? d.tasks_max_created_at : d.notes_max_created_at;
	if (!iso) return false;
	const at = Date.parse(iso);
	if (!Number.isFinite(at) || at <= 0) return false;
	return at > (Number(seenMs) || 0);
}
