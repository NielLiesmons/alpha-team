/**
 * Workspace state. Data loads from Drive when signed in; otherwise empty.
 */

import {
	createCostItem as driveCreateCostItem,
	createEnterprise as driveCreateEnterprise,
	createForm as driveCreateForm,
	createView as driveCreateView,
	createLedgerEntry as driveCreateLedgerEntry,
	createMetric as driveCreateMetric,
	createSalesLine as driveCreateSalesLine,
	createNote as driveCreateNote,
	createProject as driveCreateProject,
	createMoment as driveCreateMoment,
	createTable as driveCreateTable,
	createTableRow as driveCreateTableRow,
	createTableRows as driveCreateTableRows,
	createTask as driveCreateTask,
	deleteEntity as driveDeleteEntity,
	ensureDefaultAccounts,
	ensureSpace,
	fromUiNote,
	fromUiTask,
	putEnterprise as drivePutEnterprise,
	putForm as drivePutForm,
	putView as drivePutView,
	putLedgerEntry,
	putMetric as drivePutMetric,
	putMoment as drivePutMoment,
	putNote,
	putProject as drivePutProject,
	putTable as drivePutTable,
	putTableRow as drivePutTableRow,
	putTask,
	toUiLedgerEntry,
	toUiNote,
	toUiTask
} from './drive/entities.js';
import { activePerson, members } from './actor.svelte.js';
import { hydrateAvatarUrls } from './avatar.svelte.js';
import { ensureMembers } from './members.svelte.js';
import { activeSession, driveSession } from './drive/session.svelte.js';
import { getLastAppliedTip, setLastAppliedTip } from './drive/tip-gate.js';
import { getTip } from './drive/client.js';
import { loadWorkspaceLeaves } from './drive/workspace-load.js';
import { loadPersonCursors } from './person-cursors.svelte.js';
import { idbGet, idbSet, workspaceCacheKey } from './local-db.js';
import { popDetailLayer, pushDetailLayer } from './nav-stack.js';
import { endSync, setSyncRatio } from './sync-progress.svelte.js';
import { mailPriorityFor } from './mail.svelte.js';

/** People available for assignee pickers. Email = account id. */
export const people = members;

/** @type {any[]} */
export const tasks = $state([]);
/** @type {any[]} */
export const projects = $state([]);
/** @type {any[]} */
export const notes = $state([]);
/** Calendar / Planning slices (alpha.moment/1) — optional task_id */
/** @type {any[]} */
export const moments = $state([]);
/** @type {any[]} */
export const accounts = $state([]);
/** @type {any[]} */
export const ledgerEntries = $state([]);
/** @type {any[]} */
export const costItems = $state([]);
/** @type {any[]} */
export const salesLines = $state([]);
/** @type {any[]} */
export const enterprises = $state([]);
/** @type {any[]} */
export const dataTables = $state([]);
/** @type {any[]} */
export const tableRows = $state([]);
/** @type {any[]} */
export const metrics = $state([]);
/** @type {any[]} */
export const captureForms = $state([]);
/** @type {any[]} */
export const dataViews = $state([]);

export const ui = $state({
	/** @type {string | null} */
	projectId: null,
	/** @type {string | null} */
	noteId: null,
	/**
	 * Opened entity in the desktop detail column (view, not create).
	 * @type {null | { kind: 'task' | 'project' | 'note' | 'mail' | 'chat' | 'newsletter' | 'welcome' | 'pubs' | 'ledger' | 'cost' | 'sales' | 'enterprise' | 'table' | 'metric' | 'form' | 'view', id: string }}
	 */
	selection: null,
	/** @type {null | { kind: 'task' | 'project' | 'note' | 'newsletter' | 'welcome' | 'ledger' | 'cost' | 'sales' | 'enterprise' | 'mail' | 'table' | 'metric' | 'form' | 'view', id?: string, status?: string, to?: string }} */
	composer: null,
	/** Feed list filter id (route-specific options in AppShell). */
	listFilter: 'all',
	/** @type {'none' | 'drive'} */
	source: 'none',
	/**
	 * True after local entity cache hydrate or first Drive crawl — chat tips must
	 * not show “Deleted Note/Task” before this flips.
	 */
	entitiesReady: false
});

/**
 * Open an entity in the third column (does not open the create/edit modal).
 * @param {'task' | 'project' | 'note' | 'mail' | 'chat' | 'newsletter' | 'welcome' | 'pubs' | 'ledger' | 'cost' | 'sales' | 'enterprise' | 'table' | 'metric' | 'form' | 'view' | 'settings' | 'file'} kind
 * @param {string} id
 */
export function selectEntity(kind, id) {
	const sid = String(id);
	if (ui.selection?.kind === kind && String(ui.selection?.id) === sid) return;
	const opening = !ui.selection;
	ui.selection = { kind, id: sid };
	if (opening) pushDetailLayer('selection');
}

/** Close selection; on mobile uses history.back when we pushed a layer. */
export function clearSelection() {
	popDetailLayer('selection', () => {
		ui.selection = null;
	});
}

/** Force-clear without history (section changes / popstate). */
export function forceClearSelection() {
	ui.selection = null;
}

/**
 * @param {'task' | 'project' | 'note' | 'newsletter' | 'welcome' | 'ledger' | 'cost' | 'sales' | 'enterprise' | 'mail' | 'table' | 'metric' | 'form' | 'view'} kind
 * @param {string} [id]
 * @param {string} [status]
 * @param {Record<string, unknown>} [seed] extra fields (e.g. project_ids, primary_enterprise_id, to)
 */
export function openComposer(kind, id, status, seed = {}) {
	ui.composer = {
		kind,
		...(id ? { id } : {}),
		...(status ? { status } : {}),
		...seed
	};
}

/**
 * O(1) after O(n) scan — tasks already in memory from workspace load.
 * @param {string | null | undefined} threadId
 * @returns {any | null}
 */
export function taskByMailThreadId(threadId) {
	const id = String(threadId || '').trim();
	if (!id) return null;
	/* Touch tasks.length so callers re-run when the list mutates. */
	tasks.length;
	for (const t of tasks) {
		const mid = String(t?.mail_thread_id || t?._drive?.mail_thread_id || '').trim();
		if (mid && mid === id) return t;
	}
	return null;
}

/**
 * Open TaskCreate for a mail thread — edit existing linked task, or seed a new one.
 * Pass `_priority` / `priority` on the thread when mail-only urgency should seed the draft.
 * @param {{ id: string, subject?: string, body?: string, flagged?: boolean, _priority?: string, priority?: string }} thread
 */
export function openMailTaskComposer(thread) {
	const threadId = String(thread?.id || '').trim();
	if (!threadId) return;
	const existing = taskByMailThreadId(threadId);
	if (existing?.id) {
		openComposer('task', existing.id);
		return;
	}
	const title = String(thread.subject || '').trim();
	const seeded =
		String(thread._priority || thread.priority || '').trim() ||
		(thread.flagged ? 'urgent' : 'none');
	openComposer('task', undefined, 'open', {
		title: title || undefined,
		body: String(thread.body || '').trim() || undefined,
		mail_thread_id: threadId,
		priority: seeded
	});
}

/**
 * Promote a mail thread into its linked task (or patch the existing one) without
 * opening TaskCreate. Does not navigate — mail chrome stays on the thread.
 * @param {{ id: string, subject?: string, body?: string, flagged?: boolean, _priority?: string, priority?: string }} thread
 * @param {{ status?: string, priority?: string }} [patch]
 */
export async function ensureMailTask(thread, patch = {}) {
	const threadId = String(thread?.id || '').trim();
	if (!threadId) return null;
	const existing = taskByMailThreadId(threadId);
	if (existing?.id) {
		const next = {};
		if (patch.status != null && patch.status !== existing.status) next.status = patch.status;
		if (patch.priority != null && patch.priority !== existing.priority) next.priority = patch.priority;
		if (Object.keys(next).length) await patchTask(existing.id, next);
		return tasks.find((t) => t.id === existing.id) ?? existing;
	}
	const title = String(thread.subject || '').trim();
	const seededPriority =
		patch.priority ?? mailPriorityFor(threadId, thread) ?? (thread.flagged ? 'urgent' : 'none');
	return saveTask(
		{
			title: title || undefined,
			body: String(thread.body || '').trim() || undefined,
			status: patch.status || 'open',
			priority: seededPriority,
			mail_thread_id: threadId,
			labels: [],
			project_ids: [],
			assignees: []
		},
		true,
		{ select: false }
	);
}

/**
 * Delete a Drive entity and drop it from local workspace state.
 * @param {'task' | 'project' | 'note' | 'enterprise'} kind
 * @param {string} id
 */
export async function deleteWorkspaceEntity(kind, id) {
	const session = activeSession();
	const list =
		kind === 'task' ? tasks : kind === 'project' ? projects : kind === 'note' ? notes : enterprises;
	const idx = list.findIndex((x) => x.id === id);
	const prev = idx >= 0 ? list[idx] : null;
	if (idx >= 0) list.splice(idx, 1);
	if (ui.selection?.kind === kind && ui.selection.id === id) forceClearSelection();
	if (ui.composer?.kind === kind && ui.composer.id === id) closeComposer();
	scheduleWorkspacePersist();
	if (!session) return;
	try {
		await driveDeleteEntity(session, kind, id);
		scheduleWorkspacePersist();
	} catch (e) {
		if (idx >= 0 && prev) list.splice(idx, 0, prev);
		scheduleWorkspacePersist();
		throw e;
	}
}

/** @param {string[]} ids */
export async function deleteTableRows(ids) {
	if (!ids?.length) return;
	const session = activeSession();
	const keep = [];
	for (const id of ids) {
		const idx = tableRows.findIndex((r) => r.id === id);
		if (idx >= 0) {
			keep.push(tableRows[idx]);
			tableRows.splice(idx, 1);
		}
	}
	scheduleWorkspacePersist();
	if (!session || isOffline()) return;
	try {
		for (const id of ids) {
			await driveDeleteEntity(session, 'table_row', id);
		}
		scheduleWorkspacePersist();
	} catch (e) {
		tableRows.unshift(...keep);
		scheduleWorkspacePersist();
		console.warn('deleteTableRows deferred', e);
	}
}

export function closeComposer() {
	ui.composer = null;
}

function replaceArray(target, next) {
	target.splice(0, target.length, ...next);
}

function clearWorkspace() {
	replaceArray(tasks, []);
	replaceArray(projects, []);
	replaceArray(notes, []);
	replaceArray(moments, []);
	replaceArray(accounts, []);
	replaceArray(ledgerEntries, []);
	replaceArray(costItems, []);
	replaceArray(salesLines, []);
	replaceArray(enterprises, []);
	replaceArray(dataTables, []);
	replaceArray(tableRows, []);
	replaceArray(metrics, []);
	replaceArray(captureForms, []);
	replaceArray(dataViews, []);
	ui.projectId = null;
	ui.noteId = null;
	ui.selection = null;
	ui.composer = null;
	ui.source = 'none';
	ui.entitiesReady = false;
}

function cacheKeyForSession(session) {
	return workspaceCacheKey(session);
}

/** True when the browser reports offline (Drive writes should stay local). */
function isOffline() {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * After a Drive write succeeds, keep the optimistic user-facing fields so the UI
 * does not jump when the server echoes slightly different ISO strings / shapes.
 * @param {any} local
 * @param {any} saved
 */
function mergeConfirmed(local, saved) {
	const merged = {
		...saved,
		...local,
		id: saved?.id ?? local?.id,
		_drive: saved?._drive ?? local?._drive,
		_pending: false
	};
	/* Optimistic table drafts often lack column.id — never clobber server columns. */
	if (Array.isArray(saved?.columns) && saved.columns.some((c) => c?.id)) {
		merged.columns = saved.columns;
	}
	return merged;
}

/** @param {any[]} columns */
function normalizeTableColumns(columns) {
	return (Array.isArray(columns) ? columns : []).map((c) => ({
		...c,
		id: c.id || crypto.randomUUID().slice(0, 8),
		key:
			String(c.key || c.label || 'col')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '_')
				.replace(/^_|_$/g, '') || 'col',
		label: c.label || c.key || 'Column',
		type: c.type || 'number'
	}));
}

/** Persist a thin workspace snapshot for instant PWA reopen (keeps `_pending`). */
async function persistWorkspaceCache(session) {
	if (!session) return;
	const snapshot = {
		at: Date.now(),
		projects: [...projects],
		tasks: [...tasks],
		notes: [...notes],
		moments: [...moments],
		accounts: [...accounts],
		ledgerEntries: [...ledgerEntries],
		costItems: [...costItems],
		salesLines: [...salesLines],
		enterprises: [...enterprises],
		dataTables: [...dataTables],
		tableRows: [...tableRows],
		metrics: [...metrics],
		captureForms: [...captureForms],
		dataViews: [...dataViews]
	};
	await idbSet(cacheKeyForSession(session), snapshot);
}

/** Call after local mutations so home-screen reopen stays fresh. */
export function scheduleWorkspacePersist() {
	const session = activeSession();
	if (session) void persistWorkspaceCache(session);
}

/**
 * Snapshot local-only rows so a Drive replaceArray does not orphan them.
 * @returns {{ notes: any[], tasks: any[], moments: any[] }}
 */
function snapshotPendingLocals() {
	return {
		notes: notes.filter((n) => n?._pending),
		tasks: tasks.filter((t) => t?._pending),
		moments: moments.filter((m) => m?._pending)
	};
}

/**
 * Re-attach pending locals after a server crawl (by id; skip if server already has it).
 * @param {{ notes: any[], tasks: any[], moments: any[] }} snap
 */
function reapplyPendingLocals(snap) {
	if (!snap) return;
	for (const n of snap.notes || []) {
		const id = String(n?.id || '');
		if (!id || notes.some((x) => x.id === id)) continue;
		notes.unshift({ ...n, _pending: true });
	}
	for (const t of snap.tasks || []) {
		const id = String(t?.id || '');
		if (!id || tasks.some((x) => x.id === id)) continue;
		tasks.unshift({ ...t, _pending: true });
	}
	for (const m of snap.moments || []) {
		const id = String(m?.id || '');
		if (!id || moments.some((x) => x.id === id)) continue;
		moments.push({ ...m, _pending: true });
	}
}

/** @type {Promise<void> | null} */
let flushPendingInflight = null;

/**
 * Upload deferred offline Notes / Tasks / Moments. Uses put* with the local id so
 * chat “created” events and selection stay valid (create* would mint a new id).
 * Retries on next online / visibility / refresh if a write fails.
 */
export async function flushPendingWorkspace() {
	if (isOffline()) return;
	const session = activeSession();
	if (!session) return;
	if (flushPendingInflight) return flushPendingInflight;

	flushPendingInflight = (async () => {
		const plist = () => projects.map((p) => p._drive ?? p);

		for (const note of [...notes].filter((n) => n?._pending)) {
			const idx = notes.findIndex((n) => n.id === note.id);
			if (idx < 0) continue;
			try {
				const saved = await putNote(session, fromUiNote(notes[idx]));
				const uiNote = {
					...toUiNote(saved, plist()),
					assignees: notes[idx].assignees ?? [],
					author: notes[idx].author ?? saved.author ?? null
				};
				const i = notes.findIndex((n) => n.id === note.id || n.id === saved.id);
				const local = i >= 0 ? notes[i] : notes[idx];
				const confirmed = mergeConfirmed(local, uiNote);
				delete confirmed._syncError;
				if (i >= 0) notes[i] = confirmed;
				if (ui.noteId === note.id) ui.noteId = confirmed.id;
				if (ui.selection?.kind === 'note' && ui.selection.id === note.id) {
					ui.selection = { kind: 'note', id: confirmed.id };
				}
			} catch (e) {
				const i = notes.findIndex((n) => n.id === note.id);
				if (i >= 0) {
					notes[i]._pending = true;
					notes[i]._syncError = e instanceof Error ? e.message : String(e);
				}
				console.warn('flushPending note', e);
			}
		}

		for (const task of [...tasks].filter((t) => t?._pending)) {
			const idx = tasks.findIndex((t) => t.id === task.id);
			if (idx < 0) continue;
			try {
				const saved = await putTask(session, fromUiTask(tasks[idx]));
				const local = tasks[idx];
				await syncTaskScheduleMoment(session, saved.id, local._schedule, local.assignees ?? []);
				const uiTask = {
					...toUiTask(saved, plist()),
					author: local.author ?? saved.author ?? null,
					assignees: local.assignees ?? [],
					commenters: local.commenters ?? [],
					mail_thread_id: saved.mail_thread_id ?? local.mail_thread_id ?? null
				};
				const i = tasks.findIndex((t) => t.id === task.id || t.id === saved.id);
				const confirmed = mergeConfirmed(i >= 0 ? tasks[i] : local, uiTask);
				delete confirmed._syncError;
				if (i >= 0) tasks[i] = confirmed;
				if (ui.selection?.kind === 'task' && ui.selection.id === task.id) {
					ui.selection = { kind: 'task', id: confirmed.id };
				}
			} catch (e) {
				const i = tasks.findIndex((t) => t.id === task.id);
				if (i >= 0) {
					tasks[i]._pending = true;
					tasks[i]._syncError = e instanceof Error ? e.message : String(e);
				}
				console.warn('flushPending task', e);
			}
		}

		for (const moment of [...moments].filter((m) => m?._pending)) {
			const idx = moments.findIndex((m) => m.id === moment.id);
			if (idx < 0) continue;
			try {
				const saved = await drivePutMoment(session, moments[idx]);
				const i = moments.findIndex((m) => m.id === moment.id || m.id === saved.id);
				const confirmed = mergeConfirmed(i >= 0 ? moments[i] : moments[idx], saved);
				delete confirmed._syncError;
				if (i >= 0) moments[i] = confirmed;
				syncTaskStatusFromMoments(saved.task_id ?? moment.task_id);
			} catch (e) {
				const i = moments.findIndex((m) => m.id === moment.id);
				if (i >= 0) {
					moments[i]._pending = true;
					moments[i]._syncError = e instanceof Error ? e.message : String(e);
				}
				console.warn('flushPending moment', e);
			}
		}

		scheduleWorkspacePersist();
	})();

	try {
		await flushPendingInflight;
	} finally {
		flushPendingInflight = null;
	}
}

/**
 * Hydrate UI from local cache before Drive round-trip (home-screen PWA).
 * @returns {Promise<boolean>} true if cache applied
 */
export async function hydrateWorkspaceFromCache() {
	const session = activeSession();
	if (!session) return false;
	const snap = await idbGet(cacheKeyForSession(session));
	if (!snap) return false;
	const hasAny =
		(Array.isArray(snap.tasks) && snap.tasks.length > 0) ||
		(Array.isArray(snap.notes) && snap.notes.length > 0) ||
		(Array.isArray(snap.projects) && snap.projects.length > 0);
	if (!hasAny && !Array.isArray(snap.tasks)) return false;
	replaceArray(projects, Array.isArray(snap.projects) ? snap.projects : []);
	replaceArray(tasks, Array.isArray(snap.tasks) ? snap.tasks : []);
	replaceArray(notes, Array.isArray(snap.notes) ? snap.notes : []);
	replaceArray(moments, Array.isArray(snap.moments) ? snap.moments : []);
	replaceArray(accounts, Array.isArray(snap.accounts) ? snap.accounts : []);
	replaceArray(ledgerEntries, Array.isArray(snap.ledgerEntries) ? snap.ledgerEntries : []);
	replaceArray(costItems, Array.isArray(snap.costItems) ? snap.costItems : []);
	replaceArray(salesLines, Array.isArray(snap.salesLines) ? snap.salesLines : []);
	replaceArray(enterprises, Array.isArray(snap.enterprises) ? snap.enterprises : []);
	replaceArray(dataTables, Array.isArray(snap.dataTables) ? snap.dataTables : []);
	replaceArray(tableRows, Array.isArray(snap.tableRows) ? snap.tableRows : []);
	replaceArray(metrics, Array.isArray(snap.metrics) ? snap.metrics : []);
	replaceArray(captureForms, Array.isArray(snap.captureForms) ? snap.captureForms : []);
	replaceArray(dataViews, Array.isArray(snap.dataViews) ? snap.dataViews : []);
	ui.source = 'drive';
	/* Only mark ready when we actually painted something — empty cache ≠ confirmed empty Space. */
	ui.entitiesReady = Boolean(hasAny);
	return hasAny || Array.isArray(snap.tasks);
}

/**
 * @param {{ skipTipGate?: boolean, outerProgress?: boolean }} [opts]
 */
export async function refreshFromDrive(opts = {}) {
	const session = activeSession();
	if (!session) {
		clearWorkspace();
		return;
	}
	const hadLocal =
		tasks.length > 0 ||
		projects.length > 0 ||
		notes.length > 0 ||
		ledgerEntries.length > 0 ||
		costItems.length > 0 ||
		salesLines.length > 0 ||
		enterprises.length > 0;
	/* Offline + local data: keep painting cache; never clear. */
	if (isOffline() && hadLocal) {
		ui.source = 'drive';
		ui.entitiesReady = true;
		driveSession.loading = false;
		return;
	}
	driveSession.loading = !hadLocal;
	const ownProgress = !opts.outerProgress;
	if (ownProgress) {
		driveSession.syncing = true;
		/* Title spinner is section-scoped via drive-refresh — no global Updating. */
	}
	driveSession.error = null;
	try {
		if (!opts.skipTipGate && hadLocal) {
			try {
				const tipNow = await getTip(session);
				if (tipNow && tipNow === getLastAppliedTip(session)) {
					ui.entitiesReady = true;
					if (ownProgress) setSyncRatio(1, 1);
					return;
				}
			} catch {
				/* Tip unreachable — keep local workspace. */
				if (hadLocal) {
					ui.entitiesReady = true;
					if (ownProgress) setSyncRatio(1, 1);
					return;
				}
			}
		}

		/* Keep deferred offline rows across the crawl — flush uploads them when online. */
		const pendingLocals = snapshotPendingLocals();
		await ensureSpace(session, 'Space');
		const [{ buckets, tip }, alist] = await Promise.all([
			loadWorkspaceLeaves(session, undefined, {
				onProgress: (done, total) => {
					if (ownProgress) setSyncRatio(done, Math.max(total, 1));
					else setSyncRatio(done * 0.7, Math.max(total, 1));
				}
			}),
			ensureDefaultAccounts(session),
			ensureMembers(session).then(() => hydrateAvatarUrls())
		]);
		/* Cursors are local-first — never block workspace boot on Drive get/put. */
		loadPersonCursors(session);
		const plist = buckets.project;
		replaceArray(
			projects,
			plist.map((p) => ({
				id: p.id,
				title: p.title,
				/* Prefer description; legacy Drive docs may still carry body */
				description: p.description || p.body || '',
				status: p.status || 'planned',
				icon: p.icon ?? null,
				enterprise_ids: Array.isArray(p.enterprise_ids) ? p.enterprise_ids : [],
				primary_enterprise_id:
					p.primary_enterprise_id ||
					(Array.isArray(p.enterprise_ids) && p.enterprise_ids[0]) ||
					null,
				depends_on: Array.isArray(p.depends_on) ? p.depends_on : [],
				milestones: Array.isArray(p.milestones) ? p.milestones : [],
				slug: p.slug,
				_drive: p
			}))
		);
		replaceArray(
			tasks,
			buckets.task.map((t) => toUiTask(t, plist))
		);
		replaceArray(moments, buckets.moment);
		replaceArray(
			notes,
			buckets.note.map((n) => toUiNote(n, plist))
		);
		reapplyPendingLocals(pendingLocals);
		replaceArray(accounts, alist.length ? alist : buckets.account);
		replaceArray(
			ledgerEntries,
			buckets.ledger.map((e) => toUiLedgerEntry(e, plist, alist.length ? alist : buckets.account))
		);
		replaceArray(costItems, buckets.cost);
		replaceArray(salesLines, buckets.sales);
		replaceArray(
			enterprises,
			buckets.enterprise.map((e) => ({
				...e,
				/* Prefer description; legacy Drive docs may still carry body */
				description: e.description || e.body || ''
			}))
		);
		replaceArray(dataTables, buckets.table);
		replaceArray(tableRows, buckets.table_row);
		replaceArray(metrics, buckets.metric);
		replaceArray(captureForms, buckets.form);
		replaceArray(dataViews, buckets.view);
		ui.source = 'drive';
		ui.entitiesReady = true;
		if (tip) setLastAppliedTip(session, tip);
		void persistWorkspaceCache(session);
	} catch (e) {
		driveSession.error = e instanceof Error ? e.message : String(e);
		/* Never wipe a warm cache on network / tip failure. */
		if (!hadLocal && !isOffline()) clearWorkspace();
		else if (hadLocal) ui.entitiesReady = true;
	} finally {
		driveSession.loading = false;
		if (ownProgress) {
			driveSession.syncing = false;
			endSync();
		}
	}
}

/**
 * Quick field patch from cards or detail (persists via saveTask).
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function patchTask(id, patch) {
	const t = tasks.find((x) => x.id === id);
	if (!t) return;
	await saveTask({ ...t, ...patch }, false);
}

/**
 * Quick field patch for notes (projects, labels, assignees, …).
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function patchNote(id, patch) {
	const n = notes.find((x) => x.id === id);
	if (!n) return;
	await saveNote({ ...n, ...patch }, false);
}

/**
 * Soft-archive a task (swipe / Archive filter). Persists `archived: true`.
 * @param {string} id
 */
export async function archiveTask(id) {
	const t = tasks.find((x) => x.id === id);
	if (!t || t.archived) return;
	if (ui.selection?.kind === 'task' && ui.selection.id === id) forceClearSelection();
	await patchTask(id, { archived: true });
}

/**
 * Soft-archive a note (swipe / Archive filter). Persists `archived: true`.
 * @param {string} id
 */
export async function archiveNote(id) {
	const n = notes.find((x) => x.id === id);
	if (!n || n.archived) return;
	if (ui.selection?.kind === 'note' && ui.selection.id === id) forceClearSelection();
	await patchNote(id, { archived: true });
}

/**
 * Quick field patch for projects (status, milestones, …).
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function patchProject(id, patch) {
	const p = projects.find((x) => x.id === id);
	if (!p) return;
	await saveProject({ ...p, ...patch }, false);
}

/**
 * Quick field patch for enterprises (title, description, …).
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function patchEnterprise(id, patch) {
	const e = enterprises.find((x) => x.id === id);
	if (!e) return;
	await saveEnterprise({ ...e, ...patch }, false);
}

/**
 * Persist a new or edited task. Optimistic UI — feed updates immediately.
 * @param {any} draft
 * @param {boolean} isNew
 */
/**
 * Upsert the first linked moment for a task from TaskCreate schedule fields.
 * @param {import('./drive/client.js').DriveSession} session
 * @param {string} taskId
 * @param {{ start_at?: string | null, end_at?: string | null } | null | undefined} schedule
 * @param {{ email?: string, name?: string }[]} [assigneePeople]
 */
async function syncTaskScheduleMoment(session, taskId, schedule, assigneePeople = []) {
	if (!schedule?.start_at && !schedule?.end_at) return;
	const start = schedule.start_at || schedule.end_at;
	const end = schedule.end_at || schedule.start_at;
	const assigneeEmails = assigneePeople
		.map((a) => (a.email || '').trim().toLowerCase())
		.filter(Boolean);
	const existing = moments.find((m) => m.task_id === taskId && !m.recurrence);
	if (existing) {
		const saved = await drivePutMoment(session, {
			...existing,
			start_at: start,
			end_at: end,
			assignees: assigneeEmails.length ? assigneeEmails : existing.assignees ?? []
		});
		const i = moments.findIndex((m) => m.id === saved.id);
		if (i >= 0) moments[i] = saved;
		else moments.push(saved);
		return saved;
	}
	const created = await driveCreateMoment(session, {
		task_id: taskId,
		start_at: /** @type {string} */ (start),
		end_at: end,
		assignees: assigneeEmails
	});
	moments.push(created);
	return created;
}

/**
 * When a task has moments: planned until the first start, then inProgress.
 * Leaves closed / canceled / inReview alone. Applies locally first (no UI jump).
 * @param {string | null | undefined} taskId
 */
export function syncTaskStatusFromMoments(taskId) {
	if (!taskId) return;
	const i = tasks.findIndex((x) => x.id === taskId);
	if (i < 0) return;
	const t = tasks[i];
	const locked = t.status === 'closed' || t.status === 'canceled' || t.status === 'inReview';
	if (locked) return;

	const kids = moments.filter((m) => m.task_id === taskId && m.status !== 'canceled');
	if (!kids.length) return;

	let earliest = Infinity;
	for (const m of kids) {
		const s = m.start_at ? Date.parse(m.start_at) : NaN;
		if (Number.isFinite(s)) earliest = Math.min(earliest, s);
	}
	if (!Number.isFinite(earliest)) return;

	const next = Date.now() >= earliest ? 'inProgress' : 'planned';
	if (t.status === next) return;
	if (!['open', 'backlog', 'planned', 'inProgress'].includes(t.status)) return;

	Object.assign(tasks[i], { status: next });
	scheduleWorkspacePersist();

	const session = activeSession();
	if (!session || isOffline()) {
		tasks[i]._pending = true;
		scheduleWorkspacePersist();
		return;
	}
	/* Background confirm — mergeConfirmed keeps local status */
	void putTask(session, fromUiTask({ ...tasks[i] }))
		.then((saved) => {
			const j = tasks.findIndex((x) => x.id === taskId || x.id === saved.id);
			if (j < 0) return;
			const plist = projects.map((p) => p._drive ?? p);
			tasks[j] = mergeConfirmed(tasks[j], toUiTask(saved, plist));
			scheduleWorkspacePersist();
		})
		.catch(() => {
			const j = tasks.findIndex((x) => x.id === taskId);
			if (j >= 0) {
				tasks[j]._pending = true;
				scheduleWorkspacePersist();
			}
		});
}

/**
 * Create or update a planning moment (optimistic / local-first).
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveMoment(draft, isNew) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();

	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = {
			...draft,
			id: tempId,
			schema: 'alpha.moment/1',
			status: draft.status ?? 'planned',
			_pending: !canPush
		};
		moments.push(optimistic);
		scheduleWorkspacePersist();
		syncTaskStatusFromMoments(draft.task_id);
		if (!canPush) return optimistic;

		try {
			const created = await driveCreateMoment(session, {
				task_id: draft.task_id ?? null,
				title: draft.title ?? null,
				start_at: draft.start_at,
				end_at: draft.end_at ?? null,
				assignees: draft.assignees ?? [],
				status: draft.status ?? 'planned',
				recurrence: draft.recurrence ?? null
			});
			const i = moments.findIndex((m) => m.id === tempId);
			if (i >= 0) moments[i] = mergeConfirmed(moments[i], created);
			else moments.push({ ...created, _pending: false });
			scheduleWorkspacePersist();
			syncTaskStatusFromMoments(created.task_id ?? draft.task_id);
			return moments.find((m) => m.id === created.id) ?? created;
		} catch (e) {
			/* Keep optimistic row — mark pending for later sync */
			const i = moments.findIndex((m) => m.id === tempId);
			if (i >= 0) {
				moments[i]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveMoment create deferred', e);
			return optimistic;
		}
	}

	const idx = moments.findIndex((m) => m.id === draft.id);
	if (idx >= 0) Object.assign(moments[idx], { ...draft, _pending: !canPush });
	else moments.push({ ...draft, _pending: !canPush });
	scheduleWorkspacePersist();
	syncTaskStatusFromMoments(draft.task_id);
	if (!canPush) return draft;

	try {
		const saved = await drivePutMoment(session, draft);
		const i = moments.findIndex((m) => m.id === saved.id);
		if (i >= 0) moments[i] = mergeConfirmed(moments[i], saved);
		else moments.push({ ...saved, _pending: false });
		scheduleWorkspacePersist();
		syncTaskStatusFromMoments(saved.task_id ?? draft.task_id);
		return moments.find((m) => m.id === saved.id) ?? saved;
	} catch (e) {
		const i = moments.findIndex((m) => m.id === draft.id);
		if (i >= 0) {
			moments[i]._pending = true;
			scheduleWorkspacePersist();
		}
		console.warn('saveMoment update deferred', e);
		return draft;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 * @param {{ select?: boolean }} [opts]
 */
export async function saveTask(draft, isNew, opts = {}) {
	const session = activeSession();
	const author = draft.author ?? activePerson().email;
	const canPush = Boolean(session) && !isOffline();
	const select = opts.select !== false;

	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = {
			...draft,
			id: tempId,
			createdAt: Date.now(),
			author,
			assignees: draft.assignees ?? [],
			commenters: draft.commenters ?? [],
			targets: draft.targets ?? [],
			project_ids: draft.project_ids ?? [],
			deadline_at: draft.deadline_at ?? null,
			mail_thread_id: draft.mail_thread_id ?? null,
			_pending: !canPush
		};
		tasks.unshift(optimistic);
		if (select) ui.selection = { kind: 'task', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) {
			void import('./chat.svelte.js').then(({ announceEntityCreated }) =>
				announceEntityCreated('task', tempId)
			);
			return optimistic;
		}

		try {
			const created = await driveCreateTask(session, {
				title: draft.title,
				description: draft.body,
				status: draft.status,
				priority: draft.priority,
				labels: draft.labels,
				project_ids: draft.project_ids ?? [],
				deadline_at: draft.deadline_at ?? null,
				mail_thread_id: draft.mail_thread_id ?? null,
				author
			});
			await syncTaskScheduleMoment(session, created.id, draft._schedule, draft.assignees ?? []);
			const plist = projects.map((p) => p._drive ?? p);
			const uiTask = {
				...toUiTask(created, plist),
				author,
				assignees: draft.assignees ?? [],
				commenters: draft.commenters ?? [],
				mail_thread_id: created.mail_thread_id ?? draft.mail_thread_id ?? null
			};
			const idx = tasks.findIndex((t) => t.id === tempId);
			const confirmed = mergeConfirmed(optimistic, uiTask);
			if (idx >= 0) tasks[idx] = confirmed;
			else tasks.unshift(confirmed);
			if (select && ui.selection?.id === tempId) ui.selection = { kind: 'task', id: confirmed.id };
			scheduleWorkspacePersist();
			void import('./chat.svelte.js').then(({ announceEntityCreated }) =>
				announceEntityCreated('task', confirmed.id)
			);
			return confirmed;
		} catch (e) {
			const idx = tasks.findIndex((t) => t.id === tempId);
			if (idx >= 0) {
				tasks[idx]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveTask create deferred', e);
			return optimistic;
		}
	}

	const idx = tasks.findIndex((t) => t.id === draft.id);
	if (idx >= 0) Object.assign(tasks[idx], { ...draft, author, _pending: !canPush });
	scheduleWorkspacePersist();
	if (!canPush) return draft;

	try {
		const entity = fromUiTask({ ...draft, author });
		const saved = await putTask(session, entity);
		await syncTaskScheduleMoment(session, saved.id, draft._schedule, draft.assignees ?? []);
		const plist = projects.map((p) => p._drive ?? p);
		const uiTask = {
			...toUiTask(saved, plist),
			author: draft.author ?? author,
			assignees: draft.assignees ?? [],
			commenters: draft.commenters ?? []
		};
		const i = tasks.findIndex((t) => t.id === saved.id);
		const local = i >= 0 ? tasks[i] : draft;
		const confirmed = mergeConfirmed(local, uiTask);
		if (i >= 0) tasks[i] = confirmed;
		else tasks.unshift(confirmed);
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		if (idx >= 0) {
			tasks[idx]._pending = true;
			scheduleWorkspacePersist();
		}
		console.warn('saveTask update deferred', e);
		return draft;
	}
}

/**
 * Persist a new or edited note. Optimistic UI — feed updates immediately.
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveNote(draft, isNew) {
	const session = activeSession();
	const author = draft.author ?? activePerson().email;
	const canPushNote = Boolean(session) && !isOffline();

	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const now = Date.now();
		const optimistic = {
			...draft,
			id: tempId,
			createdAt: now,
			updatedAt: now,
			targets: draft.targets ?? [],
			project_ids: draft.project_ids ?? [],
			labels: draft.labels ?? [],
			assignees: draft.assignees ?? [],
			author,
			_pending: !canPushNote
		};
		notes.unshift(optimistic);
		ui.noteId = tempId;
		ui.selection = { kind: 'note', id: tempId };
		scheduleWorkspacePersist();
		if (!canPushNote) {
			void import('./chat.svelte.js').then(({ announceEntityCreated }) =>
				announceEntityCreated('note', tempId)
			);
			return optimistic;
		}

		try {
			const created = await driveCreateNote(session, {
				title: draft.title,
				body: draft.body,
				labels: draft.labels,
				project_ids: draft.project_ids ?? [],
				author
			});
			const plist = projects.map((p) => p._drive ?? p);
			const uiNote = {
				...toUiNote(created, plist),
				assignees: draft.assignees ?? [],
				author
			};
			const idx = notes.findIndex((n) => n.id === tempId);
			const confirmed = mergeConfirmed(optimistic, uiNote);
			if (idx >= 0) notes[idx] = confirmed;
			else notes.unshift(confirmed);
			ui.noteId = confirmed.id;
			ui.selection = { kind: 'note', id: confirmed.id };
			scheduleWorkspacePersist();
			void import('./chat.svelte.js').then(({ announceEntityCreated }) =>
				announceEntityCreated('note', confirmed.id)
			);
			return confirmed;
		} catch (e) {
			const idx = notes.findIndex((n) => n.id === tempId);
			if (idx >= 0) {
				notes[idx]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveNote create deferred', e);
			return optimistic;
		}
	}

	const idx = notes.findIndex((n) => n.id === draft.id);
	if (idx >= 0)
		Object.assign(notes[idx], { ...draft, author, updatedAt: Date.now(), _pending: !canPushNote });
	ui.noteId = draft.id;
	ui.selection = { kind: 'note', id: draft.id };
	scheduleWorkspacePersist();
	if (!canPushNote) return draft;

	try {
		const entity = fromUiNote({ ...draft, author });
		const saved = await putNote(session, entity);
		const plist = projects.map((p) => p._drive ?? p);
		const uiNote = {
			...toUiNote(saved, plist),
			assignees: draft.assignees ?? [],
			author: draft.author ?? author
		};
		const i = notes.findIndex((n) => n.id === saved.id);
		const local = i >= 0 ? notes[i] : draft;
		const confirmed = mergeConfirmed(local, uiNote);
		if (i >= 0) notes[i] = confirmed;
		else notes.unshift(confirmed);
		ui.noteId = confirmed.id;
		ui.selection = { kind: 'note', id: confirmed.id };
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		if (idx >= 0) {
			notes[idx]._pending = true;
			scheduleWorkspacePersist();
		}
		console.warn('saveNote update deferred', e);
		return draft;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveProject(draft, isNew) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	const description =
		draft.description ?? draft.summary ?? draft.body ?? '';
	const enterpriseIds = Array.isArray(draft.enterprise_ids)
		? draft.enterprise_ids
		: [];
	const primaryEnterpriseId =
		draft.primary_enterprise_id || enterpriseIds[0] || null;
	const dependsOn = Array.isArray(draft.depends_on) ? draft.depends_on : [];

	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = {
			...draft,
			id: tempId,
			slug: draft.slug,
			description,
			milestones: draft.milestones ?? [],
			status: draft.status ?? 'planned',
			icon: draft.icon ?? null,
			enterprise_ids: enterpriseIds,
			primary_enterprise_id: primaryEnterpriseId,
			depends_on: dependsOn,
			_pending: !canPush
		};
		projects.unshift(optimistic);
		ui.projectId = tempId;
		ui.selection = { kind: 'project', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) {
			void import('./chat.svelte.js').then(({ announceEntityCreated }) =>
				announceEntityCreated('project', tempId)
			);
			return optimistic;
		}

		try {
			const created = await driveCreateProject(session, {
				title: draft.title,
				description,
				status: draft.status ?? 'planned',
				icon: draft.icon || null,
				milestones: draft.milestones ?? [],
				enterprise_ids: enterpriseIds,
				primary_enterprise_id: primaryEnterpriseId,
				depends_on: dependsOn
			});
			const uiProj = {
				id: created.id,
				title: created.title,
				description: created.description ?? description,
				status: created.status ?? draft.status ?? 'planned',
				icon: created.icon ?? draft.icon ?? null,
				enterprise_ids: created.enterprise_ids ?? enterpriseIds,
				primary_enterprise_id: created.primary_enterprise_id ?? primaryEnterpriseId,
				depends_on: created.depends_on ?? dependsOn,
				milestones: created.milestones ?? [],
				slug: created.slug,
				_drive: created
			};
			const idx = projects.findIndex((p) => p.id === tempId);
			const confirmed = mergeConfirmed(optimistic, uiProj);
			if (idx >= 0) projects[idx] = confirmed;
			else projects.unshift(confirmed);
			ui.projectId = confirmed.id;
			ui.selection = { kind: 'project', id: confirmed.id };
			scheduleWorkspacePersist();
			void import('./chat.svelte.js').then(({ announceEntityCreated }) =>
				announceEntityCreated('project', confirmed.id)
			);
			return confirmed;
		} catch (e) {
			const idx = projects.findIndex((p) => p.id === tempId);
			if (idx >= 0) {
				projects[idx]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveProject create deferred', e);
			return optimistic;
		}
	}

	const idx = projects.findIndex((p) => p.id === draft.id);
	const prev = projects.find((p) => p.id === draft.id);
	const nextIcon = draft.icon === undefined ? (prev?.icon ?? null) : draft.icon;
	const localPatch = {
		...draft,
		description,
		icon: nextIcon,
		enterprise_ids: enterpriseIds,
		primary_enterprise_id: primaryEnterpriseId,
		depends_on: dependsOn,
		_pending: !canPush
	};
	if (idx >= 0) Object.assign(projects[idx], localPatch);
	ui.projectId = draft.id;
	ui.selection = { kind: 'project', id: draft.id };
	scheduleWorkspacePersist();
	if (!canPush) return localPatch;

	try {
		const { body: _legacyBody, start_at: _s, end_at: _e, ...prevDrive } = prev?._drive ?? {};
		const base = {
			...prevDrive,
			id: draft.id,
			slug: draft.slug || prev?.slug,
			title: draft.title,
			description,
			status: draft.status ?? prev?.status ?? 'planned',
			icon: nextIcon || undefined,
			enterprise_ids: enterpriseIds,
			primary_enterprise_id: primaryEnterpriseId,
			depends_on: dependsOn,
			milestones: draft.milestones ?? prev?.milestones ?? [],
			created_at: prev?._drive?.created_at
		};
		delete base.start_at;
		delete base.end_at;
		const saved = await drivePutProject(session, base);
		const uiProj = {
			id: saved.id,
			title: saved.title,
			description: saved.description ?? description,
			status: saved.status ?? 'planned',
			icon: saved.icon ?? nextIcon ?? null,
			enterprise_ids: Array.isArray(saved.enterprise_ids) ? saved.enterprise_ids : enterpriseIds,
			primary_enterprise_id: saved.primary_enterprise_id ?? primaryEnterpriseId,
			depends_on: Array.isArray(saved.depends_on) ? saved.depends_on : dependsOn,
			milestones: Array.isArray(saved.milestones) ? saved.milestones : [],
			slug: saved.slug,
			_drive: saved
		};
		const i = projects.findIndex((p) => p.id === saved.id);
		const local = i >= 0 ? projects[i] : localPatch;
		const confirmed = mergeConfirmed(local, uiProj);
		if (i >= 0) projects[i] = confirmed;
		else projects.unshift(confirmed);
		ui.projectId = confirmed.id;
		ui.selection = { kind: 'project', id: confirmed.id };
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		if (idx >= 0) {
			projects[idx]._pending = true;
			scheduleWorkspacePersist();
		}
		console.warn('saveProject update deferred', e);
		return localPatch;
	}
}

/**
 * Persist a new or edited ledger entry. Optimistic UI.
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveLedgerEntry(draft, isNew) {
	const session = activeSession();
	const author = draft.author ?? activePerson().email;
	const plist = projects.map((p) => p._drive ?? p);
	const canPush = Boolean(session) && !isOffline();

	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = {
			...toUiLedgerEntry(
				{
					...draft,
					id: tempId,
					occurred_at: draft.occurred_at || new Date().toISOString(),
					created_at: new Date().toISOString(),
					author
				},
				plist,
				accounts
			),
			_pending: !canPush
		};
		ledgerEntries.unshift(optimistic);
		ui.selection = { kind: 'ledger', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;

		try {
			const created = await driveCreateLedgerEntry(session, {
				...draft,
				author
			});
			const uiEntry = toUiLedgerEntry(created, plist, accounts);
			const idx = ledgerEntries.findIndex((e) => e.id === tempId);
			const confirmed = mergeConfirmed(optimistic, uiEntry);
			if (idx >= 0) ledgerEntries[idx] = confirmed;
			else ledgerEntries.unshift(confirmed);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'ledger', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			const idx = ledgerEntries.findIndex((x) => x.id === tempId);
			if (idx >= 0) {
				ledgerEntries[idx]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveLedgerEntry create deferred', e);
			return optimistic;
		}
	}

	const idx = ledgerEntries.findIndex((e) => e.id === draft.id);
	const localUi = toUiLedgerEntry({ ...draft, author }, plist, accounts);
	if (idx >= 0) {
		Object.assign(ledgerEntries[idx], localUi, { _pending: !canPush });
	}
	ui.selection = { kind: 'ledger', id: draft.id };
	scheduleWorkspacePersist();
	if (!canPush) return { ...localUi, id: draft.id };

	try {
		const saved = await putLedgerEntry(session, {
			...(draft._drive ?? {}),
			...draft,
			author
		});
		const uiEntry = toUiLedgerEntry(saved, plist, accounts);
		const i = ledgerEntries.findIndex((e) => e.id === saved.id);
		const local = i >= 0 ? ledgerEntries[i] : localUi;
		const confirmed = mergeConfirmed(local, uiEntry);
		if (i >= 0) ledgerEntries[i] = confirmed;
		else ledgerEntries.unshift(confirmed);
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		if (idx >= 0) {
			ledgerEntries[idx]._pending = true;
			scheduleWorkspacePersist();
		}
		console.warn('saveLedgerEntry update deferred', e);
		return { ...localUi, id: draft.id };
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveCostItem(draft, isNew) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: !canPush };
		costItems.unshift(optimistic);
		ui.selection = { kind: 'cost', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;
		try {
			const created = await driveCreateCostItem(session, draft);
			const idx = costItems.findIndex((a) => a.id === tempId);
			const confirmed = mergeConfirmed(optimistic, created);
			if (idx >= 0) costItems[idx] = confirmed;
			else costItems.unshift(confirmed);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'cost', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			const idx = costItems.findIndex((a) => a.id === tempId);
			if (idx >= 0) {
				costItems[idx]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveCostItem create deferred', e);
			return optimistic;
		}
	}
	return draft;
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveSalesLine(draft, isNew) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: !canPush };
		salesLines.unshift(optimistic);
		ui.selection = { kind: 'sales', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;
		try {
			const created = await driveCreateSalesLine(session, draft);
			const idx = salesLines.findIndex((a) => a.id === tempId);
			const confirmed = mergeConfirmed(optimistic, created);
			if (idx >= 0) salesLines[idx] = confirmed;
			else salesLines.unshift(confirmed);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'sales', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			const idx = salesLines.findIndex((a) => a.id === tempId);
			if (idx >= 0) {
				salesLines[idx]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveSalesLine create deferred', e);
			return optimistic;
		}
	}
	return draft;
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveEnterprise(draft, isNew) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: !canPush };
		enterprises.unshift(optimistic);
		ui.selection = { kind: 'enterprise', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;
		try {
			const created = await driveCreateEnterprise(session, draft);
			const idx = enterprises.findIndex((a) => a.id === tempId);
			const confirmed = mergeConfirmed(optimistic, created);
			if (idx >= 0) enterprises[idx] = confirmed;
			else enterprises.unshift(confirmed);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'enterprise', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			const idx = enterprises.findIndex((a) => a.id === tempId);
			if (idx >= 0) {
				enterprises[idx]._pending = true;
				scheduleWorkspacePersist();
			}
			console.warn('saveEnterprise create deferred', e);
			return optimistic;
		}
	}

	const idx = enterprises.findIndex((a) => a.id === draft.id);
	if (idx >= 0) {
		Object.assign(enterprises[idx], { ...draft, _pending: !canPush });
	}
	scheduleWorkspacePersist();
	if (!canPush) return draft;

	try {
		const saved = await drivePutEnterprise(session, {
			...draft,
			schema: 'alpha.enterprise/1'
		});
		const i = enterprises.findIndex((a) => a.id === saved.id);
		const local = i >= 0 ? enterprises[i] : draft;
		const confirmed = mergeConfirmed(local, { ...saved, _pending: false });
		if (i >= 0) enterprises[i] = confirmed;
		else enterprises.unshift(confirmed);
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		if (idx >= 0) {
			enterprises[idx]._pending = true;
			scheduleWorkspacePersist();
		}
		console.warn('saveEnterprise update deferred', e);
		return draft;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 * @param {{ select?: boolean }} [opts]
 */
export async function saveDataTable(draft, isNew, opts = {}) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	const select = opts.select !== false;
	const columns = normalizeTableColumns(draft.columns);
	const normalized = { ...draft, columns };
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...normalized, id: tempId, _pending: !canPush };
		dataTables.unshift(optimistic);
		if (select) ui.selection = { kind: 'table', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;
		try {
			const created = await driveCreateTable(session, normalized);
			const idx = dataTables.findIndex((a) => a.id === tempId);
			const confirmed = mergeConfirmed(optimistic, created);
			if (idx >= 0) dataTables[idx] = confirmed;
			else dataTables.unshift(confirmed);
			if (select && ui.selection?.id === tempId) ui.selection = { kind: 'table', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			console.warn('saveDataTable create deferred', e);
			return optimistic;
		}
	}
	const idx = dataTables.findIndex((a) => a.id === draft.id);
	if (idx >= 0) Object.assign(dataTables[idx], { ...normalized, _pending: !canPush });
	scheduleWorkspacePersist();
	if (!canPush) return normalized;
	try {
		const saved = await drivePutTable(session, normalized);
		const i = dataTables.findIndex((a) => a.id === saved.id);
		const local = i >= 0 ? dataTables[i] : normalized;
		const confirmed = mergeConfirmed(local, saved);
		if (i >= 0) dataTables[i] = confirmed;
		else dataTables.unshift(confirmed);
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		console.warn('saveDataTable update deferred', e);
		return normalized;
	}
}

/**
 * @param {{ table_id: string, cells: Record<string, unknown>, occurred_on?: string, author?: string }} input
 */
export async function appendTableRow(input) {
	const [row] = await appendTableRows([input]);
	return row;
}

/**
 * Batch-append rows (one Drive tip update when online).
 * @param {{ table_id: string, cells: Record<string, unknown>, occurred_on?: string, author?: string }[]} inputs
 */
export async function appendTableRows(inputs) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	const author = activePerson().email || undefined;
	const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
	const optimistic = (inputs || []).map((input) => ({
		schema: 'alpha.table_row/1',
		id: crypto.randomUUID(),
		table_id: input.table_id,
		cells: { ...input.cells },
		occurred_on: input.occurred_on,
		author: input.author || author,
		created_at: createdAt,
		_pending: !canPush
	}));
	if (optimistic.length) tableRows.unshift(...optimistic);
	scheduleWorkspacePersist();
	if (!canPush || !optimistic.length) return optimistic;
	try {
		const created = await driveCreateTableRows(
			session,
			optimistic.map((row) => ({
				table_id: row.table_id,
				cells: row.cells,
				occurred_on: row.occurred_on,
				author: row.author
			}))
		);
		for (let i = 0; i < optimistic.length; i++) {
			const tempId = optimistic[i].id;
			const idx = tableRows.findIndex((r) => r.id === tempId);
			const confirmed = mergeConfirmed(optimistic[i], created[i]);
			if (idx >= 0) tableRows[idx] = confirmed;
		}
		scheduleWorkspacePersist();
		return created.map((c, i) => mergeConfirmed(optimistic[i], c));
	} catch (e) {
		console.warn('appendTableRows deferred', e);
		return optimistic;
	}
}

/**
 * @param {any} row
 */
export async function saveTableRow(row) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	const idx = tableRows.findIndex((r) => r.id === row.id);
	if (idx >= 0) Object.assign(tableRows[idx], { ...row, _pending: !canPush });
	else tableRows.unshift({ ...row, _pending: !canPush });
	scheduleWorkspacePersist();
	if (!canPush) return row;
	try {
		const saved = await drivePutTableRow(session, row);
		const i = tableRows.findIndex((r) => r.id === saved.id);
		const local = i >= 0 ? tableRows[i] : row;
		const confirmed = mergeConfirmed(local, saved);
		if (i >= 0) tableRows[i] = confirmed;
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		console.warn('saveTableRow deferred', e);
		return row;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 * @param {{ select?: boolean }} [opts]
 */
export async function saveMetric(draft, isNew, opts = {}) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	const select = opts.select !== false;
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: !canPush };
		metrics.unshift(optimistic);
		if (select) ui.selection = { kind: 'metric', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;
		try {
			const created = await driveCreateMetric(session, draft);
			const idx = metrics.findIndex((a) => a.id === tempId);
			const confirmed = mergeConfirmed(optimistic, created);
			if (idx >= 0) metrics[idx] = confirmed;
			else metrics.unshift(confirmed);
			if (select && ui.selection?.id === tempId) ui.selection = { kind: 'metric', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			console.warn('saveMetric create deferred', e);
			return optimistic;
		}
	}
	const idx = metrics.findIndex((a) => a.id === draft.id);
	if (idx >= 0) Object.assign(metrics[idx], { ...draft, _pending: !canPush });
	scheduleWorkspacePersist();
	if (!canPush) return draft;
	try {
		const saved = await drivePutMetric(session, draft);
		const i = metrics.findIndex((a) => a.id === saved.id);
		const local = i >= 0 ? metrics[i] : draft;
		const confirmed = mergeConfirmed(local, saved);
		if (i >= 0) metrics[i] = confirmed;
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		console.warn('saveMetric update deferred', e);
		return draft;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 * @param {{ select?: boolean }} [opts]
 */
export async function saveCaptureForm(draft, isNew, opts = {}) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	const select = opts.select !== false;
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: !canPush };
		captureForms.unshift(optimistic);
		if (select) ui.selection = { kind: 'form', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;
		try {
			const created = await driveCreateForm(session, draft);
			const idx = captureForms.findIndex((a) => a.id === tempId);
			const confirmed = mergeConfirmed(optimistic, created);
			if (idx >= 0) captureForms[idx] = confirmed;
			else captureForms.unshift(confirmed);
			if (select && ui.selection?.id === tempId) ui.selection = { kind: 'form', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			console.warn('saveCaptureForm create deferred', e);
			return optimistic;
		}
	}
	const idx = captureForms.findIndex((a) => a.id === draft.id);
	if (idx >= 0) Object.assign(captureForms[idx], { ...draft, _pending: !canPush });
	scheduleWorkspacePersist();
	if (!canPush) return draft;
	try {
		const saved = await drivePutForm(session, draft);
		const i = captureForms.findIndex((a) => a.id === saved.id);
		const local = i >= 0 ? captureForms[i] : draft;
		const confirmed = mergeConfirmed(local, saved);
		if (i >= 0) captureForms[i] = confirmed;
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		console.warn('saveCaptureForm update deferred', e);
		return draft;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 * @param {{ select?: boolean }} [opts]
 */
export async function saveDataView(draft, isNew, opts = {}) {
	const session = activeSession();
	const canPush = Boolean(session) && !isOffline();
	const select = opts.select !== false;
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: !canPush };
		dataViews.unshift(optimistic);
		if (select) ui.selection = { kind: 'view', id: tempId };
		scheduleWorkspacePersist();
		if (!canPush) return optimistic;
		try {
			const created = await driveCreateView(session, draft);
			const idx = dataViews.findIndex((a) => a.id === tempId);
			const confirmed = mergeConfirmed(optimistic, created);
			if (idx >= 0) dataViews[idx] = confirmed;
			else dataViews.unshift(confirmed);
			if (select && ui.selection?.id === tempId) ui.selection = { kind: 'view', id: confirmed.id };
			scheduleWorkspacePersist();
			return confirmed;
		} catch (e) {
			console.warn('saveDataView create deferred', e);
			return optimistic;
		}
	}
	const idx = dataViews.findIndex((a) => a.id === draft.id);
	if (idx >= 0) Object.assign(dataViews[idx], { ...draft, _pending: !canPush });
	scheduleWorkspacePersist();
	if (!canPush) return draft;
	try {
		const saved = await drivePutView(session, draft);
		const i = dataViews.findIndex((a) => a.id === saved.id);
		const local = i >= 0 ? dataViews[i] : draft;
		const confirmed = mergeConfirmed(local, saved);
		if (i >= 0) dataViews[i] = confirmed;
		scheduleWorkspacePersist();
		return confirmed;
	} catch (e) {
		console.warn('saveDataView update deferred', e);
		return draft;
	}
}
