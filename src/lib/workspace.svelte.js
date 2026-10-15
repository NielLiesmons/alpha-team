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
	 * @type {null | { kind: 'task' | 'project' | 'note' | 'mail' | 'chat', id: string }}
	 */
	selection: null,
	/** @type {null | { kind: 'task' | 'project' | 'note', id?: string, status?: string }} */
	composer: null,
	/** @type {'none' | 'drive'} */
	source: 'none'
});

/**
 * Open an entity in the third column (does not open the create/edit modal).
 * @param {'task' | 'project' | 'note' | 'mail' | 'chat'} kind
 * @param {string} id
 */
export function selectEntity(kind, id) {
	ui.selection = { kind, id };
}

export function clearSelection() {
	ui.selection = null;
}

/** @param {'task' | 'project' | 'note'} kind @param {string} [id] @param {string} [status] */
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
				body: '',
				status: 'planned',
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
 * Persist a new or edited task. Drive when connected; otherwise local only.
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveTask(draft, isNew) {
	const session = activeSession();
	if (!session) {
		if (isNew) {
			tasks.unshift({
				...draft,
				id: draft.id || crypto.randomUUID(),
				createdAt: Date.now(),
				author: draft.author ?? activePerson().email,
				assignees: draft.assignees ?? [],
				commenters: draft.commenters ?? [],
				targets: draft.targets ?? [],
				project_ids: draft.project_ids ?? []
			});
		} else {
			const idx = tasks.findIndex((t) => t.id === draft.id);
			if (idx >= 0) Object.assign(tasks[idx], draft);
		}
		return;
	}

	if (isNew) {
		const created = await driveCreateTask(session, {
			title: draft.title,
			description: draft.body,
			status: draft.status,
			priority: draft.priority,
			labels: draft.labels,
			project_ids: draft.project_ids ?? [],
			author: draft.author ?? activePerson().email
		});
		const plist = projects.map((p) => p._drive ?? p);
		tasks.unshift(toUiTask(created, plist));
	} else {
		const entity = fromUiTask({
			...draft,
			author: draft.author ?? activePerson().email
		});
		const saved = await putTask(session, entity);
		const idx = tasks.findIndex((t) => t.id === saved.id);
		const plist = projects.map((p) => p._drive ?? p);
		const uiTask = {
			...toUiTask(saved, plist),
			author: draft.author ?? (idx >= 0 ? tasks[idx].author : undefined) ?? activePerson().email,
			assignees: draft.assignees ?? (idx >= 0 ? tasks[idx].assignees : []) ?? [],
			commenters: draft.commenters ?? (idx >= 0 ? tasks[idx].commenters : []) ?? []
		};
		if (idx >= 0) Object.assign(tasks[idx], uiTask);
		else tasks.unshift(uiTask);
	}
}

/**
 * Persist a new or edited note. Drive when connected; otherwise local only.
 * @param {any} draft
 * @param {boolean} isNew
 */
export async function saveNote(draft, isNew) {
	const session = activeSession();
	if (!session) {
		if (isNew) {
			const id = draft.id || crypto.randomUUID();
			notes.unshift({
				...draft,
				id,
				createdAt: Date.now(),
				targets: draft.targets ?? [],
				project_ids: draft.project_ids ?? [],
				labels: draft.labels ?? [],
				assignees: draft.assignees ?? [],
				author: draft.author ?? activePerson().email
			});
			ui.noteId = id;
			ui.selection = { kind: 'note', id };
		} else {
			const idx = notes.findIndex((n) => n.id === draft.id);
			if (idx >= 0) Object.assign(notes[idx], draft);
			ui.noteId = draft.id;
			ui.selection = { kind: 'note', id: draft.id };
		}
		return;
	}

	if (isNew) {
		const created = await driveCreateNote(session, {
			title: draft.title,
			body: draft.body,
			labels: draft.labels,
			project_ids: draft.project_ids ?? [],
			author: draft.author ?? activePerson().email
		});
		const plist = projects.map((p) => p._drive ?? p);
		const uiNote = {
			...toUiNote(created, plist),
			assignees: draft.assignees ?? [],
			author: draft.author ?? activePerson().email
		};
		notes.unshift(uiNote);
		ui.noteId = uiNote.id;
		ui.selection = { kind: 'note', id: uiNote.id };
	} else {
		const entity = fromUiNote({
			...draft,
			author: draft.author ?? activePerson().email
		});
		const saved = await putNote(session, entity);
		const idx = notes.findIndex((n) => n.id === saved.id);
		const plist = projects.map((p) => p._drive ?? p);
		const uiNote = {
			...toUiNote(saved, plist),
			assignees: draft.assignees ?? (idx >= 0 ? notes[idx].assignees : []) ?? [],
			author: draft.author ?? (idx >= 0 ? notes[idx].author : undefined) ?? activePerson().email
		};
		if (idx >= 0) Object.assign(notes[idx], uiNote);
		else notes.unshift(uiNote);
		ui.noteId = uiNote.id;
		ui.selection = { kind: 'note', id: uiNote.id };
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
				slug: draft.slug
			});
			ui.projectId = id;
		} else {
			const idx = projects.findIndex((p) => p.id === draft.id);
			if (idx >= 0) Object.assign(projects[idx], draft);
			ui.projectId = draft.id;
		}
		return;
	}

	if (isNew) {
		const created = await driveCreateProject(session, {
			title: draft.title,
			description: draft.summary || draft.body || ''
		});
		projects.unshift({
			id: created.id,
			title: created.title,
			summary: created.description ?? '',
			body: '',
			status: draft.status ?? 'planned',
			slug: created.slug,
			_drive: created
		});
		ui.projectId = created.id;
	} else {
		const idx = projects.findIndex((p) => p.id === draft.id);
		if (idx >= 0) Object.assign(projects[idx], draft);
		ui.projectId = draft.id;
	}
}
