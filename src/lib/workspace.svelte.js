/**
 * Workspace state. Data loads from Drive when signed in; otherwise empty.
 */

import {
	createCostItem as driveCreateCostItem,
	createEnterprise as driveCreateEnterprise,
	createLedgerEntry as driveCreateLedgerEntry,
	createSalesLine as driveCreateSalesLine,
	createNote as driveCreateNote,
	createProject as driveCreateProject,
	createMoment as driveCreateMoment,
	createTask as driveCreateTask,
	ensureDefaultAccounts,
	ensureSpace,
	fromUiNote,
	fromUiTask,
	listCostItems,
	listEnterprises,
	listLedgerEntries,
	listMoments,
	listSalesLines,
	listNotes,
	listProjects,
	listTasks,
	putEnterprise as drivePutEnterprise,
	putLedgerEntry,
	putMoment as drivePutMoment,
	putNote,
	putProject as drivePutProject,
	putTask,
	toUiLedgerEntry,
	toUiNote,
	toUiTask
} from './drive/entities.js';
import { activePerson, members } from './actor.svelte.js';
import { activeSession, driveSession } from './drive/session.svelte.js';
import { idbGet, idbSet, workspaceCacheKey } from './local-db.js';
import { popDetailLayer, pushDetailLayer } from './nav-stack.js';

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

export const ui = $state({
	/** @type {string | null} */
	projectId: null,
	/** @type {string | null} */
	noteId: null,
	/**
	 * Opened entity in the desktop detail column (view, not create).
	 * @type {null | { kind: 'task' | 'project' | 'note' | 'mail' | 'chat' | 'newsletter' | 'welcome' | 'ledger' | 'cost' | 'sales' | 'enterprise', id: string }}
	 */
	selection: null,
	/** @type {null | { kind: 'task' | 'project' | 'note' | 'newsletter' | 'welcome' | 'ledger' | 'cost' | 'sales' | 'enterprise', id?: string, status?: string }} */
	composer: null,
	/** @type {'none' | 'drive'} */
	source: 'none'
});

/**
 * Open an entity in the third column (does not open the create/edit modal).
 * @param {'task' | 'project' | 'note' | 'mail' | 'chat' | 'newsletter' | 'welcome' | 'ledger' | 'cost' | 'sales' | 'enterprise'} kind
 * @param {string} id
 */
export function selectEntity(kind, id) {
	const opening = !ui.selection;
	ui.selection = { kind, id };
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
 * @param {'task' | 'project' | 'note' | 'newsletter' | 'welcome' | 'ledger' | 'cost' | 'sales' | 'enterprise'} kind
 * @param {string} [id]
 * @param {string} [status]
 */
export function openComposer(kind, id, status) {
	ui.composer = {
		kind,
		...(id ? { id } : {}),
		...(status ? { status } : {})
	};
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
	ui.projectId = null;
	ui.noteId = null;
	ui.selection = null;
	ui.composer = null;
	ui.source = 'none';
}

function cacheKeyForSession(session) {
	return workspaceCacheKey(session);
}

/** Persist a thin workspace snapshot for instant PWA reopen. */
async function persistWorkspaceCache(session) {
	if (!session) return;
	const snapshot = {
		at: Date.now(),
		projects: projects.map((p) => {
			const { _pending: _, ...rest } = p;
			return rest;
		}),
		tasks: tasks.map((t) => {
			const { _pending: _, ...rest } = t;
			return rest;
		}),
		notes: notes.map((n) => {
			const { _pending: _, ...rest } = n;
			return rest;
		}),
		moments: moments.map((m) => {
			const { _pending: _, ...rest } = m;
			return rest;
		}),
		accounts: accounts.map((a) => {
			const { _pending: _, ...rest } = a;
			return rest;
		}),
		ledgerEntries: ledgerEntries.map((e) => {
			const { _pending: _, ...rest } = e;
			return rest;
		}),
		costItems: costItems.map((a) => {
			const { _pending: _, ...rest } = a;
			return rest;
		}),
		salesLines: salesLines.map((a) => {
			const { _pending: _, ...rest } = a;
			return rest;
		}),
		enterprises: enterprises.map((a) => {
			const { _pending: _, ...rest } = a;
			return rest;
		})
	};
	await idbSet(cacheKeyForSession(session), snapshot);
}

/** Call after local mutations so home-screen reopen stays fresh. */
export function scheduleWorkspacePersist() {
	const session = activeSession();
	if (session) void persistWorkspaceCache(session);
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
	ui.source = 'drive';
	return hasAny || Array.isArray(snap.tasks);
}

export async function refreshFromDrive() {
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
	driveSession.loading = !hadLocal;
	driveSession.error = null;
	try {
		await ensureSpace(session, 'Bley Family');
		const [plist, tlist, nlist, mlist, alist, elist, costs, sales, ents] = await Promise.all([
			listProjects(session),
			listTasks(session),
			listNotes(session),
			listMoments(session),
			ensureDefaultAccounts(session),
			listLedgerEntries(session),
			listCostItems(session),
			listSalesLines(session),
			listEnterprises(session)
		]);
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
			tlist.map((t) => toUiTask(t, plist))
		);
		replaceArray(moments, mlist);
		replaceArray(
			notes,
			nlist.map((n) => toUiNote(n, plist))
		);
		replaceArray(accounts, alist);
		replaceArray(
			ledgerEntries,
			elist.map((e) => toUiLedgerEntry(e, plist, alist))
		);
		replaceArray(costItems, costs);
		replaceArray(salesLines, sales);
		replaceArray(enterprises, ents);
		ui.source = 'drive';
		void persistWorkspaceCache(session);
	} catch (e) {
		driveSession.error = e instanceof Error ? e.message : String(e);
		if (!hadLocal) clearWorkspace();
	} finally {
		driveSession.loading = false;
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

export async function saveTask(draft, isNew) {
	const session = activeSession();
	const author = draft.author ?? activePerson().email;

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
			_pending: Boolean(session)
		};
		tasks.unshift(optimistic);
		ui.selection = { kind: 'task', id: tempId };
		scheduleWorkspacePersist();
		if (!session) return optimistic;

		try {
			const created = await driveCreateTask(session, {
				title: draft.title,
				description: draft.body,
				status: draft.status,
				priority: draft.priority,
				labels: draft.labels,
				project_ids: draft.project_ids ?? [],
				deadline_at: draft.deadline_at ?? null,
				author
			});
			await syncTaskScheduleMoment(session, created.id, draft._schedule, draft.assignees ?? []);
			const plist = projects.map((p) => p._drive ?? p);
			const uiTask = {
				...toUiTask(created, plist),
				author,
				assignees: draft.assignees ?? [],
				commenters: draft.commenters ?? []
			};
			const idx = tasks.findIndex((t) => t.id === tempId);
			if (idx >= 0) tasks[idx] = uiTask;
			else tasks.unshift(uiTask);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'task', id: uiTask.id };
			scheduleWorkspacePersist();
			return uiTask;
		} catch (e) {
			const idx = tasks.findIndex((t) => t.id === tempId);
			if (idx >= 0) tasks.splice(idx, 1);
			scheduleWorkspacePersist();
			throw e;
		}
	}

	const idx = tasks.findIndex((t) => t.id === draft.id);
	const prev = idx >= 0 ? { ...tasks[idx] } : null;
	if (idx >= 0) Object.assign(tasks[idx], { ...draft, author, _pending: Boolean(session) });
	scheduleWorkspacePersist();
	if (!session) return draft;

	try {
		const entity = fromUiTask({ ...draft, author });
		const saved = await putTask(session, entity);
		await syncTaskScheduleMoment(session, saved.id, draft._schedule, draft.assignees ?? []);
		const plist = projects.map((p) => p._drive ?? p);
		const uiTask = {
			...toUiTask(saved, plist),
			author: draft.author ?? prev?.author ?? author,
			assignees: draft.assignees ?? prev?.assignees ?? [],
			commenters: draft.commenters ?? prev?.commenters ?? []
		};
		const i = tasks.findIndex((t) => t.id === saved.id);
		if (i >= 0) Object.assign(tasks[i], uiTask);
		else tasks.unshift(uiTask);
		scheduleWorkspacePersist();
		return uiTask;
	} catch (e) {
		if (idx >= 0 && prev) Object.assign(tasks[idx], prev);
		scheduleWorkspacePersist();
		throw e;
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

	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = {
			...draft,
			id: tempId,
			createdAt: Date.now(),
			targets: draft.targets ?? [],
			project_ids: draft.project_ids ?? [],
			labels: draft.labels ?? [],
			assignees: draft.assignees ?? [],
			author,
			_pending: Boolean(session)
		};
		notes.unshift(optimistic);
		ui.noteId = tempId;
		ui.selection = { kind: 'note', id: tempId };
		scheduleWorkspacePersist();
		if (!session) return optimistic;

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
			if (idx >= 0) notes[idx] = uiNote;
			else notes.unshift(uiNote);
			ui.noteId = uiNote.id;
			ui.selection = { kind: 'note', id: uiNote.id };
			scheduleWorkspacePersist();
			return uiNote;
		} catch (e) {
			const idx = notes.findIndex((n) => n.id === tempId);
			if (idx >= 0) notes.splice(idx, 1);
			scheduleWorkspacePersist();
			throw e;
		}
	}

	const idx = notes.findIndex((n) => n.id === draft.id);
	const prev = idx >= 0 ? { ...notes[idx] } : null;
	if (idx >= 0) Object.assign(notes[idx], { ...draft, author, _pending: Boolean(session) });
	ui.noteId = draft.id;
	ui.selection = { kind: 'note', id: draft.id };
	scheduleWorkspacePersist();
	if (!session) return draft;

	try {
		const entity = fromUiNote({ ...draft, author });
		const saved = await putNote(session, entity);
		const plist = projects.map((p) => p._drive ?? p);
		const uiNote = {
			...toUiNote(saved, plist),
			assignees: draft.assignees ?? prev?.assignees ?? [],
			author: draft.author ?? prev?.author ?? author
		};
		const i = notes.findIndex((n) => n.id === saved.id);
		if (i >= 0) Object.assign(notes[i], uiNote);
		else notes.unshift(uiNote);
		ui.noteId = uiNote.id;
		ui.selection = { kind: 'note', id: uiNote.id };
		scheduleWorkspacePersist();
		return uiNote;
	} catch (e) {
		if (idx >= 0 && prev) Object.assign(notes[idx], prev);
		scheduleWorkspacePersist();
		throw e;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveProject(draft, isNew) {
	const session = activeSession();
	const description =
		draft.description ?? draft.summary ?? draft.body ?? '';
	const enterpriseIds = Array.isArray(draft.enterprise_ids)
		? draft.enterprise_ids
		: [];
	const primaryEnterpriseId =
		draft.primary_enterprise_id || enterpriseIds[0] || null;
	const dependsOn = Array.isArray(draft.depends_on) ? draft.depends_on : [];

	if (!session) {
		if (isNew) {
			const id = draft.id || crypto.randomUUID();
			projects.unshift({
				...draft,
				id,
				slug: draft.slug,
				description,
				milestones: draft.milestones ?? [],
				status: draft.status ?? 'planned',
				icon: draft.icon ?? null,
				enterprise_ids: enterpriseIds,
				primary_enterprise_id: primaryEnterpriseId,
				depends_on: dependsOn
			});
			ui.projectId = id;
			ui.selection = { kind: 'project', id };
		} else {
			const idx = projects.findIndex((p) => p.id === draft.id);
			if (idx >= 0)
				Object.assign(projects[idx], {
					...draft,
					description,
					enterprise_ids: enterpriseIds,
					primary_enterprise_id: primaryEnterpriseId,
					depends_on: dependsOn
				});
			ui.projectId = draft.id;
			ui.selection = { kind: 'project', id: draft.id };
		}
		return;
	}

	if (isNew) {
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
		projects.unshift(uiProj);
		ui.projectId = created.id;
		ui.selection = { kind: 'project', id: created.id };
	} else {
		const prev = projects.find((p) => p.id === draft.id);
		const nextIcon = draft.icon === undefined ? (prev?.icon ?? null) : draft.icon;
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
		const idx = projects.findIndex((p) => p.id === saved.id);
		if (idx >= 0) Object.assign(projects[idx], uiProj);
		else projects.unshift(uiProj);
		ui.projectId = saved.id;
		ui.selection = { kind: 'project', id: saved.id };
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
			_pending: Boolean(session)
		};
		ledgerEntries.unshift(optimistic);
		ui.selection = { kind: 'ledger', id: tempId };
		scheduleWorkspacePersist();
		if (!session) return optimistic;

		try {
			const created = await driveCreateLedgerEntry(session, {
				...draft,
				author
			});
			const uiEntry = toUiLedgerEntry(created, plist, accounts);
			const idx = ledgerEntries.findIndex((e) => e.id === tempId);
			if (idx >= 0) ledgerEntries[idx] = uiEntry;
			else ledgerEntries.unshift(uiEntry);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'ledger', id: uiEntry.id };
			scheduleWorkspacePersist();
			return uiEntry;
		} catch (e) {
			const idx = ledgerEntries.findIndex((x) => x.id === tempId);
			if (idx >= 0) ledgerEntries.splice(idx, 1);
			scheduleWorkspacePersist();
			throw e;
		}
	}

	const idx = ledgerEntries.findIndex((e) => e.id === draft.id);
	const prev = idx >= 0 ? { ...ledgerEntries[idx] } : null;
	if (idx >= 0) {
		Object.assign(
			ledgerEntries[idx],
			toUiLedgerEntry({ ...draft, author }, plist, accounts),
			{ _pending: Boolean(session) }
		);
	}
	ui.selection = { kind: 'ledger', id: draft.id };
	scheduleWorkspacePersist();
	if (!session) return draft;

	try {
		const saved = await putLedgerEntry(session, {
			...(draft._drive ?? {}),
			...draft,
			author
		});
		const uiEntry = toUiLedgerEntry(saved, plist, accounts);
		const i = ledgerEntries.findIndex((e) => e.id === saved.id);
		if (i >= 0) Object.assign(ledgerEntries[i], uiEntry);
		else ledgerEntries.unshift(uiEntry);
		scheduleWorkspacePersist();
		return uiEntry;
	} catch (e) {
		if (idx >= 0 && prev) Object.assign(ledgerEntries[idx], prev);
		scheduleWorkspacePersist();
		throw e;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveCostItem(draft, isNew) {
	const session = activeSession();
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: Boolean(session) };
		costItems.unshift(optimistic);
		ui.selection = { kind: 'cost', id: tempId };
		scheduleWorkspacePersist();
		if (!session) return optimistic;
		try {
			const created = await driveCreateCostItem(session, draft);
			const idx = costItems.findIndex((a) => a.id === tempId);
			if (idx >= 0) costItems[idx] = created;
			else costItems.unshift(created);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'cost', id: created.id };
			scheduleWorkspacePersist();
			return created;
		} catch (e) {
			const idx = costItems.findIndex((a) => a.id === tempId);
			if (idx >= 0) costItems.splice(idx, 1);
			scheduleWorkspacePersist();
			throw e;
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
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: Boolean(session) };
		salesLines.unshift(optimistic);
		ui.selection = { kind: 'sales', id: tempId };
		scheduleWorkspacePersist();
		if (!session) return optimistic;
		try {
			const created = await driveCreateSalesLine(session, draft);
			const idx = salesLines.findIndex((a) => a.id === tempId);
			if (idx >= 0) salesLines[idx] = created;
			else salesLines.unshift(created);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'sales', id: created.id };
			scheduleWorkspacePersist();
			return created;
		} catch (e) {
			const idx = salesLines.findIndex((a) => a.id === tempId);
			if (idx >= 0) salesLines.splice(idx, 1);
			scheduleWorkspacePersist();
			throw e;
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
	if (isNew) {
		const tempId = draft.id || crypto.randomUUID();
		const optimistic = { ...draft, id: tempId, _pending: Boolean(session) };
		enterprises.unshift(optimistic);
		ui.selection = { kind: 'enterprise', id: tempId };
		scheduleWorkspacePersist();
		if (!session) return optimistic;
		try {
			const created = await driveCreateEnterprise(session, draft);
			const idx = enterprises.findIndex((a) => a.id === tempId);
			if (idx >= 0) enterprises[idx] = created;
			else enterprises.unshift(created);
			if (ui.selection?.id === tempId) ui.selection = { kind: 'enterprise', id: created.id };
			scheduleWorkspacePersist();
			return created;
		} catch (e) {
			const idx = enterprises.findIndex((a) => a.id === tempId);
			if (idx >= 0) enterprises.splice(idx, 1);
			scheduleWorkspacePersist();
			throw e;
		}
	}

	const idx = enterprises.findIndex((a) => a.id === draft.id);
	const prev = idx >= 0 ? { ...enterprises[idx] } : null;
	if (idx >= 0) {
		Object.assign(enterprises[idx], { ...draft, _pending: Boolean(session) });
	}
	scheduleWorkspacePersist();
	if (!session) return draft;

	try {
		const saved = await drivePutEnterprise(session, {
			...draft,
			schema: 'alpha.enterprise/1'
		});
		const i = enterprises.findIndex((a) => a.id === saved.id);
		if (i >= 0) Object.assign(enterprises[i], { ...saved, _pending: false });
		else enterprises.unshift(saved);
		scheduleWorkspacePersist();
		return saved;
	} catch (e) {
		if (idx >= 0 && prev) Object.assign(enterprises[idx], prev);
		scheduleWorkspacePersist();
		throw e;
	}
}
