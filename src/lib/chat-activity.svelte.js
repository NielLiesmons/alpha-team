/**
 * User-targeted chat activity — reactions / replies on my messages, tasks assigned to me.
 * Powers the Chat 3rd-column synopsis + top-bar bell badge.
 */
import { activePerson } from './actor.svelte.js';
import { chatFeed } from './chat.svelte.js';
import { tasks } from './workspace.svelte.js';

const SEEN_KEY = 'alpha.chatActivity.seenAt';
const DONE = new Set(['closed', 'canceled']);

/** @returns {string} */
function meEmail() {
	return String(activePerson().email || '')
		.trim()
		.toLowerCase();
}

/** @param {unknown} raw */
function assigneeEmail(raw) {
	if (typeof raw === 'string') return raw.trim().toLowerCase();
	if (raw && typeof raw === 'object' && 'email' in raw) {
		return String(/** @type {{ email?: string }} */ (raw).email || '')
			.trim()
			.toLowerCase();
	}
	return '';
}

/** @returns {number} */
export function readActivitySeenAt() {
	if (typeof localStorage === 'undefined') return 0;
	try {
		const n = Number(localStorage.getItem(SEEN_KEY) || 0);
		return Number.isFinite(n) ? n : 0;
	} catch {
		return 0;
	}
}

export function markActivitySeen() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(SEEN_KEY, String(Date.now()));
	} catch {
		/* ignore */
	}
	seenTick.value += 1;
}

/** Reactive bump when seen timestamp changes. */
export const seenTick = $state({ value: 0 });

/**
 * @typedef {{
 *   id: string,
 *   kind: 'reaction' | 'reply' | 'assigned',
 *   at: number,
 *   author: string,
 *   preview: string,
 *   emoji?: string,
 *   ref?: { type: string, id: string } | null,
 *   messageId?: string,
 *   taskId?: string
 * }} ChatActivityItem
 */

/**
 * Chronological activity aimed at the signed-in person (newest first).
 * @returns {ChatActivityItem[]}
 */
export function activityForMe() {
	seenTick.value; /* subscribe */
	chatFeed.length;
	tasks.length;
	const me = meEmail();
	if (!me) return [];

	/** @type {Map<string, any>} */
	const byId = new Map();
	for (const m of chatFeed) {
		if (m?.id) byId.set(String(m.id), m);
	}

	/** @type {Set<string>} */
	const myMsgIds = new Set();
	for (const m of chatFeed) {
		if (!m?.id) continue;
		if (m.kind === 'reaction' || m.kind === 'event') continue;
		if (String(m.author || '').trim().toLowerCase() !== me) continue;
		myMsgIds.add(String(m.id));
	}

	/** @type {ChatActivityItem[]} */
	const items = [];

	for (const m of chatFeed) {
		if (!m?.id) continue;
		const author = String(m.author || '').trim().toLowerCase();
		if (!author || author === me) continue;
		const at = Date.parse(String(m.created_at || '')) || 0;
		const replyTo = String(m.reply_to || '');

		if (m.kind === 'reaction' && replyTo && myMsgIds.has(replyTo)) {
			const emoji = String(m.reaction || m.body || '').trim() || '👍';
			items.push({
				id: `reaction:${m.id}`,
				kind: 'reaction',
				at,
				author,
				preview: emoji,
				emoji,
				ref: m.ref ?? byId.get(replyTo)?.ref ?? null,
				messageId: replyTo
			});
			continue;
		}

		if (
			(m.kind === 'comment' || m.kind === 'chat' || !m.kind) &&
			replyTo &&
			myMsgIds.has(replyTo)
		) {
			const plain = String(m.body || '')
				.replace(/\s+/g, ' ')
				.trim();
			items.push({
				id: `reply:${m.id}`,
				kind: 'reply',
				at,
				author,
				preview: plain.length > 96 ? `${plain.slice(0, 96).trim()}…` : plain || 'Reply',
				ref: m.ref ?? byId.get(replyTo)?.ref ?? null,
				messageId: String(m.id)
			});
		}
	}

	for (const task of tasks) {
		const emails = (task.assignees || []).map(assigneeEmail).filter(Boolean);
		if (!emails.includes(me)) continue;
		const st = String(task.status || 'open');
		if (DONE.has(st)) continue;
		const at = Number(task.updatedAt || task.createdAt || 0) || 0;
		items.push({
			id: `assigned:${task.id}`,
			kind: 'assigned',
			at,
			author: String(task.author || '').trim().toLowerCase(),
			preview: String(task.title || '').trim() || 'Task',
			ref: { type: 'task', id: String(task.id) },
			taskId: String(task.id)
		});
	}

	return items.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

/** Unread badge count (activity newer than last open). */
export function activityUnreadCount() {
	const seen = readActivitySeenAt();
	return activityForMe().filter((a) => a.at > seen).length;
}
