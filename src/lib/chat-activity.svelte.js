/**
 * User-targeted chat activity — reactions / replies on my messages, tasks assigned to me.
 * Powers the Chat 3rd-column synopsis + top-bar unread mark.
 *
 * Seen cursor lives in person-cursors (Drive + local) for cross-device badges.
 */
import { activePerson } from './actor.svelte.js';
import { chatFeed } from './chat.svelte.js';
import {
	cursorsTick,
	markActivitySeen as markCursorActivitySeen,
	readCursor
} from './person-cursors.svelte.js';
import { tasks } from './workspace.svelte.js';

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

/** @param {string} text @param {number} [max] */
function clip(text, max = 96) {
	const plain = String(text || '')
		.replace(/\s+/g, ' ')
		.trim();
	if (plain.length <= max) return plain;
	return `${plain.slice(0, max).trim()}…`;
}

/** @returns {number} */
export function readActivitySeenAt() {
	cursorsTick.value;
	return readCursor('activity');
}

export function markActivitySeen() {
	markCursorActivitySeen();
}

/** Reactive bump when seen timestamp changes (alias for cursorsTick). */
export const seenTick = cursorsTick;

/**
 * @typedef {{
 *   id: string,
 *   kind: 'reaction' | 'reply' | 'assigned',
 *   at: number,
 *   author: string,
 *   preview: string,
 *   targetPreview?: string,
 *   emoji?: string,
 *   ref?: { type: string, id: string } | null,
 *   messageId?: string,
 *   taskId?: string,
 *   taskStatus?: string
 * }} ChatActivityItem
 */

/**
 * Chronological activity aimed at the signed-in person (newest first).
 * @returns {ChatActivityItem[]}
 */
export function activityForMe() {
	cursorsTick.value; /* subscribe */
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
		const author = String(m.author || '')
			.trim()
			.toLowerCase();
		if (!author || author === me) continue;
		const at = Date.parse(String(m.created_at || '')) || 0;
		const replyTo = String(m.reply_to || '');

		if (m.kind === 'reaction' && replyTo && myMsgIds.has(replyTo)) {
			const emoji = String(m.reaction || m.body || '').trim() || '👍';
			const parent = byId.get(replyTo);
			items.push({
				id: `reaction:${m.id}`,
				kind: 'reaction',
				at,
				author,
				preview: emoji,
				emoji,
				targetPreview: clip(parent?.body || ''),
				ref: m.ref ?? parent?.ref ?? null,
				messageId: replyTo
			});
			continue;
		}

		if (
			(m.kind === 'comment' || m.kind === 'chat' || !m.kind) &&
			replyTo &&
			myMsgIds.has(replyTo)
		) {
			const plain = clip(m.body || '', 96) || 'Reply';
			items.push({
				id: `reply:${m.id}`,
				kind: 'reply',
				at,
				author,
				preview: plain,
				targetPreview: plain,
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
		const driveUpdated = task._drive?.updated_at ? Date.parse(String(task._drive.updated_at)) : 0;
		const at =
			Number(task.updatedAt || 0) ||
			(Number.isFinite(driveUpdated) ? driveUpdated : 0) ||
			Number(task.createdAt || 0) ||
			0;
		items.push({
			id: `assigned:${task.id}`,
			kind: 'assigned',
			at,
			author: String(task.author || '')
				.trim()
				.toLowerCase(),
			preview: String(task.title || '').trim() || 'Task',
			targetPreview: String(task.title || '').trim() || 'Task',
			ref: { type: 'task', id: String(task.id) },
			taskId: String(task.id),
			taskStatus: st
		});
	}

	return items.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

/** Unread badge count (activity newer than last open). */
export function activityUnreadCount() {
	const seen = readActivitySeenAt();
	return activityForMe().filter((a) => a.at > seen).length;
}

/**
 * Unread counts by category for the mobile chat chrome.
 * @returns {{ reaction: number, reply: number, assigned: number }}
 */
export function activityUnreadByKind() {
	const seen = readActivitySeenAt();
	/** @type {{ reaction: number, reply: number, assigned: number }} */
	const out = { reaction: 0, reply: 0, assigned: 0 };
	for (const a of activityForMe()) {
		if (a.at <= seen) continue;
		if (a.kind === 'reaction') out.reaction += 1;
		else if (a.kind === 'reply') out.reply += 1;
		else if (a.kind === 'assigned') out.assigned += 1;
	}
	return out;
}
