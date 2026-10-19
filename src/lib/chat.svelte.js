/**
 * Family Chat — Drive-backed feed + comments (Chatmail notify later).
 */

import { activePerson } from './actor.svelte.js';
import {
	createChatMessage,
	listComments,
	listFeedMessages
} from './drive/entities.js';
import { activeSession } from './drive/session.svelte.js';
import { notes, projects, selectEntity, tasks } from './workspace.svelte.js';
import { goto } from '$app/navigation';

/** @type {any[]} */
export const chatFeed = $state([]);

/** Cache: `${type}:${id}` → messages */
/** @type {Record<string, any[]>} */
export const commentsByKey = $state({});

export const chatUi = $state({
	loading: false,
	error: /** @type {string | null} */ (null),
	posting: false
});

function commentKey(type, id) {
	return `${type}:${id}`;
}

export async function refreshChatFeed() {
	const session = activeSession();
	if (!session) {
		chatFeed.length = 0;
		return;
	}
	chatUi.loading = chatFeed.length === 0;
	chatUi.error = null;
	try {
		const list = await listFeedMessages(session, 80);
		chatFeed.length = 0;
		chatFeed.push(...list);
	} catch (e) {
		chatUi.error = e instanceof Error ? e.message : String(e);
	} finally {
		chatUi.loading = false;
	}
}

/**
 * @param {'task' | 'note' | 'project'} type
 * @param {string} entityId
 */
export async function loadComments(type, entityId) {
	const session = activeSession();
	const key = commentKey(type, entityId);
	if (!session) {
		commentsByKey[key] = [];
		return [];
	}
	try {
		const list = await listComments(session, type, entityId);
		commentsByKey[key] = list;
		return list;
	} catch (e) {
		commentsByKey[key] = [];
		throw e;
	}
}

/**
 * @param {{
 *   body: string,
 *   kind?: 'comment' | 'chat',
 *   ref?: { type: string, id: string } | null,
 *   reply_to?: string | null
 * }} input
 */
export async function postChatMessage(input) {
	const session = activeSession();
	const author = activePerson().email;
	if (!author) throw new Error('Pick who you are in Settings first');
	if (!input.body?.trim()) throw new Error('Empty message');

	chatUi.posting = true;
	try {
		if (!session) {
			const local = {
				schema: 'alpha.chat_message/1',
				id: crypto.randomUUID(),
				kind: input.kind || (input.ref ? 'comment' : 'chat'),
				author,
				body: input.body.trim(),
				created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
				...(input.ref ? { ref: input.ref } : {}),
				...(input.reply_to ? { reply_to: input.reply_to } : {}),
				_local: true
			};
			chatFeed.unshift(local);
			if (input.ref && (input.ref.type === 'task' || input.ref.type === 'note' || input.ref.type === 'project')) {
				const key = commentKey(/** @type {any} */ (input.ref.type), input.ref.id);
				const prev = commentsByKey[key] ?? [];
				commentsByKey[key] = [...prev, local];
			}
			return local;
		}

		const created = await createChatMessage(session, {
			body: input.body.trim(),
			author,
			kind: input.kind || (input.ref ? 'comment' : 'chat'),
			ref: input.ref ?? null,
			reply_to: input.reply_to ?? null
		});
		chatFeed.unshift(created);
		if (input.ref && (input.ref.type === 'task' || input.ref.type === 'note' || input.ref.type === 'project')) {
			const key = commentKey(/** @type {any} */ (input.ref.type), input.ref.id);
			const prev = commentsByKey[key] ?? [];
			commentsByKey[key] = [...prev, created];
		}
		return created;
	} finally {
		chatUi.posting = false;
	}
}

/**
 * Open the entity a chat card refers to.
 * @param {any} msg
 */
export function openChatRef(msg) {
	const ref = msg?.ref;
	if (!ref?.type || !ref?.id) {
		selectEntity('chat', msg.id);
		return;
	}
	if (ref.type === 'task') {
		void goto('/tasks');
		selectEntity('task', ref.id);
	} else if (ref.type === 'note') {
		void goto('/notes');
		selectEntity('note', ref.id);
	} else if (ref.type === 'project') {
		void goto('/projects');
		selectEntity('project', ref.id);
	} else {
		selectEntity('chat', msg.id);
	}
}

/** @param {any} msg */
export function chatRefLabel(msg) {
	const ref = msg?.ref;
	if (!ref) return null;
	if (ref.type === 'task') {
		const t = tasks.find((x) => x.id === ref.id);
		return t ? `Task · ${t.title}` : 'Task';
	}
	if (ref.type === 'note') {
		const n = notes.find((x) => x.id === ref.id);
		return n ? `Note · ${n.title || 'Untitled'}` : 'Note';
	}
	if (ref.type === 'project') {
		const p = projects.find((x) => x.id === ref.id);
		return p ? `Project · ${p.title}` : 'Project';
	}
	return `${ref.type}`;
}
