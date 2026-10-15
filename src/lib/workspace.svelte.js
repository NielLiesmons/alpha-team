/**
 * Workspace state. When Drive is connected, Tasks/Projects/Notes load from ciphertext.
 * Otherwise sample fixtures (demo).
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
import { activeSession, driveSession, loadSessionFromStorage } from './drive/session.svelte.js';

const niel = members[0];
const sarah = members[1];
const marc = { email: 'marc@bley.farm', name: 'Marc' };

/** People available for assignee pickers (demo + local). Email = account id. */
export const people = [niel, sarah, marc];

const demoTasks = [
	{
		id: 't4',
		title: 'Check the tunnel vents',
		status: 'inReview',
		priority: 'urgent',
		body: 'South door sticks when the wind picks up.',
		labels: ['Farm', 'Urgent'],
		targets: [{ id: 'p1', label: 'Spring CSA' }],
		project_ids: ['p1'],
		author: niel.email,
		assignees: [sarah],
		commenters: [marc],
		createdAt: 4
	},
	{
		id: 't2',
		title: 'Pack the first ice cream tubs',
		status: 'inProgress',
		priority: 'medium',
		body: 'Vanilla only. Strawberry waits on the fruit.',
		labels: ['Shop'],
		targets: [],
		project_ids: [],
		author: sarah.email,
		assignees: [marc],
		commenters: [],
		createdAt: 3
	},
	{
		id: 't1',
		title: 'Move the egg mobile',
		status: 'open',
		priority: 'high',
		body: 'New paddock behind the tunnels, before Friday drop-off.',
		labels: ['Farm', 'Drop-off'],
		targets: [{ id: 'p2', label: 'Egg mobile' }],
		project_ids: ['p2'],
		author: niel.email,
		assignees: [marc],
		commenters: [],
		createdAt: 2
	},
	{
		id: 't5',
		title: 'Order boxes for the market',
		status: 'backlog',
		priority: 'low',
		body: '',
		labels: ['Shop'],
		targets: [],
		project_ids: [],
		author: marc.email,
		assignees: [],
		commenters: [],
		createdAt: 1
	},
	{
		id: 't3',
		title: 'Send the March letter',
		status: 'closed',
		priority: 'none',
		body: 'Already on the site.',
		labels: ['News'],
		targets: [],
		project_ids: [],
		author: niel.email,
		assignees: [],
		commenters: [],
		createdAt: 0
	}
];

const demoProjects = [
	{
		id: 'p1',
		title: 'Spring CSA',
		status: 'planned',
		summary: 'Drop-offs in Guingamp and Saint-Brieuc.',
		body: 'Open the list when the tunnels are producing.'
	},
	{
		id: 'p2',
		title: 'Egg mobile',
		status: 'inProgress',
		summary: 'Move the hens, then update the map.',
		body: 'Private notes stay off the website.'
	}
];

const demoNotes = [
	{
		id: 'n1',
		title: 'Drop-off planning',
		body: `## This week\n\n- Wednesday: Guingamp\n- Thursday: Saint-Brieuc\n- Saturday: at the farm, by appointment\n`,
		labels: ['Logistics'],
		targets: [{ id: 'p1', label: 'Spring CSA' }],
		project_ids: ['p1'],
		author: niel.email,
		assignees: [sarah],
		createdAt: 2
	},
	{
		id: 'n2',
		title: 'Pasture notes',
		body: `Hens follow the sheep.\n\nThe logs for mushrooms stay on the north edge.\n`,
		labels: ['Farm'],
		targets: [{ id: 'p2', label: 'Egg mobile' }],
		project_ids: ['p2'],
		author: sarah.email,
		assignees: [],
		createdAt: 1
	}
];

/** @type {any[]} */
export const tasks = $state([...demoTasks]);
/** @type {any[]} */
export const projects = $state([...demoProjects]);
/** @type {any[]} */
export const notes = $state([...demoNotes]);

export const ui = $state({
	/** @type {string | null} */
	projectId: 'p1',
	/** @type {string | null} */
	noteId: 'n1',
	/**
	 * Opened entity in the desktop detail column (view, not create).
	 * @type {null | { kind: 'task' | 'project' | 'note' | 'mail' | 'chat', id: string }}
	 */
	selection: null,
	/** @type {null | { kind: 'task' | 'project' | 'note', id?: string, status?: string }} */
	composer: null,
	/** @type {'demo' | 'drive'} */
	source: 'demo'
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

export async function refreshFromDrive() {
	const session = activeSession();
	if (!session) {
		replaceArray(tasks, demoTasks);
		replaceArray(projects, demoProjects);
		replaceArray(notes, demoNotes);
		ui.source = 'demo';
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
				status: 'planned',
				summary: p.description ?? '',
				body: '',
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
		ui.source = 'demo';
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
			/* Assignees not on Drive schema yet — keep UI-side picks */
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
				id,
				title: draft.title,
				summary: draft.summary ?? '',
				body: draft.body ?? '',
				status: draft.status ?? 'planned'
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
		/* v0: local fields only; project.json rewrite comes with full edit later */
		const idx = projects.findIndex((p) => p.id === draft.id);
		if (idx >= 0) Object.assign(projects[idx], draft);
		ui.projectId = draft.id;
	}
}

loadSessionFromStorage();
if (typeof window !== 'undefined' && activeSession()) {
	refreshFromDrive();
}
