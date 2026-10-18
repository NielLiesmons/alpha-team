/**
 * Workspace state. Data loads from Drive when signed in; otherwise empty.
 */

import {
	createNote as driveCreateNote,
	createProject as driveCreateProject,
	createTask as driveCreateTask,
	ensureSpace,
	fromUiNote,
	fromUiTask,
	listNotes,
	listProjects,
	listTasks,
	putNote,
	putProject as drivePutProject,
	putTask,
	toUiNote,
	toUiTask
} from './drive/entities.js';
import { activePerson, members } from './actor.svelte.js';
import { activeSession, driveSession } from './drive/session.svelte.js';

/** People available for assignee pickers. Email = account id. */
export const people = members;

/** @type {any[]} */
export const tasks = $state([]);
/** @type {any[]} */
export const projects = $state([]);
/** @type {any[]} */
export const notes = $state([]);

export const ui = $state({
	/** @type {string | null} */
	projectId: null,
	/** @type {string | null} */
	noteId: null,
	/**
	 * Opened entity in the desktop detail column (view, not create).
	 * @type {null | { kind: 'task' | 'project' | 'note' | 'mail' | 'chat' | 'newsletter' | 'welcome', id: string }}
	 */
	selection: null,
	/** @type {null | { kind: 'task' | 'project' | 'note' | 'newsletter' | 'welcome', id?: string, status?: string }} */
	composer: null,
	/** @type {'none' | 'drive'} */
	source: 'none'
});

/**
 * Open an entity in the third column (does not open the create/edit modal).
 * @param {'task' | 'project' | 'note' | 'mail' | 'chat' | 'newsletter' | 'welcome'} kind
 * @param {string} id
 */
export function selectEntity(kind, id) {
	ui.selection = { kind, id };
}

export function clearSelection() {
	ui.selection = null;
}

/**
 * @param {'task' | 'project' | 'note' | 'newsletter' | 'welcome'} kind
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
	ui.projectId = null;
	ui.noteId = null;
	ui.selection = null;
	ui.composer = null;
	ui.source = 'none';
}

export async function refreshFromDrive() {
	const session = activeSession();
	if (!session) {
		clearWorkspace();
		return;
	}
	driveSession.loading = true;
	driveSession.error = null;
	try {
		await ensureSpace(session, 'Bley Family');
		const [plist, tlist, nlist] = await Promise.all([
			listProjects(session),
			listTasks(session),
			listNotes(session)
		]);
		replaceArray(
			projects,
			plist.map((p) => ({
				id: p.id,
				title: p.title,
				summary: p.description ?? '',
				body: p.body ?? '',
				status: p.status || 'planned',
				milestones: Array.isArray(p.milestones) ? p.milestones : [],
				slug: p.slug,
				_drive: p
			}))
		);
		replaceArray(
			tasks,
			tlist.map((t) => toUiTask(t, plist))
		);
		replaceArray(
			notes,
			nlist.map((n) => toUiNote(n, plist))
		);
		ui.source = 'drive';
	} catch (e) {
		driveSession.error = e instanceof Error ? e.message : String(e);
		clearWorkspace();
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
			_pending: Boolean(session)
		};
		tasks.unshift(optimistic);
		ui.selection = { kind: 'task', id: tempId };
		if (!session) return optimistic;

		try {
			const created = await driveCreateTask(session, {
				title: draft.title,
				description: draft.body,
				status: draft.status,
				priority: draft.priority,
				labels: draft.labels,
				project_ids: draft.project_ids ?? [],
				author
			});
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
			return uiTask;
		} catch (e) {
			const idx = tasks.findIndex((t) => t.id === tempId);
			if (idx >= 0) tasks.splice(idx, 1);
			throw e;
		}
	}

	const idx = tasks.findIndex((t) => t.id === draft.id);
	const prev = idx >= 0 ? { ...tasks[idx] } : null;
	if (idx >= 0) Object.assign(tasks[idx], { ...draft, author, _pending: Boolean(session) });
	if (!session) return draft;

	try {
		const entity = fromUiTask({ ...draft, author });
		const saved = await putTask(session, entity);
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
		return uiTask;
	} catch (e) {
		if (idx >= 0 && prev) Object.assign(tasks[idx], prev);
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
			return uiNote;
		} catch (e) {
			const idx = notes.findIndex((n) => n.id === tempId);
			if (idx >= 0) notes.splice(idx, 1);
			throw e;
		}
	}

	const idx = notes.findIndex((n) => n.id === draft.id);
	const prev = idx >= 0 ? { ...notes[idx] } : null;
	if (idx >= 0) Object.assign(notes[idx], { ...draft, author, _pending: Boolean(session) });
	ui.noteId = draft.id;
	ui.selection = { kind: 'note', id: draft.id };
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
		return uiNote;
	} catch (e) {
		if (idx >= 0 && prev) Object.assign(notes[idx], prev);
		throw e;
	}
}

/**
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveProject(draft, isNew) {
	const session = activeSession();
	if (!session) {
		if (isNew) {
			const id = draft.id || crypto.randomUUID();
			projects.unshift({
				...draft,
				id,
				slug: draft.slug,
				milestones: draft.milestones ?? [],
				status: draft.status ?? 'planned'
			});
			ui.projectId = id;
			ui.selection = { kind: 'project', id };
		} else {
			const idx = projects.findIndex((p) => p.id === draft.id);
			if (idx >= 0) Object.assign(projects[idx], draft);
			ui.projectId = draft.id;
			ui.selection = { kind: 'project', id: draft.id };
		}
		return;
	}

	if (isNew) {
		const created = await driveCreateProject(session, {
			title: draft.title,
			description: draft.summary || '',
			body: draft.body || '',
			status: draft.status ?? 'planned',
			milestones: draft.milestones ?? []
		});
		const uiProj = {
			id: created.id,
			title: created.title,
			summary: created.description ?? '',
			body: created.body ?? '',
			status: created.status ?? draft.status ?? 'planned',
			milestones: created.milestones ?? [],
			slug: created.slug,
			_drive: created
		};
		projects.unshift(uiProj);
		ui.projectId = created.id;
		ui.selection = { kind: 'project', id: created.id };
	} else {
		const prev = projects.find((p) => p.id === draft.id);
		const base = {
			...(prev?._drive ?? {}),
			id: draft.id,
			slug: draft.slug || prev?.slug,
			title: draft.title,
			description: draft.summary ?? '',
			body: draft.body ?? '',
			status: draft.status ?? 'planned',
			milestones: draft.milestones ?? prev?.milestones ?? [],
			created_at: prev?._drive?.created_at
		};
		const saved = await drivePutProject(session, base);
		const uiProj = {
			id: saved.id,
			title: saved.title,
			summary: saved.description ?? '',
			body: saved.body ?? '',
			status: saved.status ?? 'planned',
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
