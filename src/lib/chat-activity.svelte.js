/**
 * User-targeted chat activity — reactions / replies on my messages, tasks assigned to me.
 * Powers the Chat 3rd-column synopsis + top-bar unread mark.
 *
 * Seen cursor lives in person-cursors (Drive + local) for cross-device badges.
 */
import { activePerson } from './actor.svelte.js';
import { chatFeed } from './chat.svelte.js';
import { members } from './members.svelte.js';
import { tokenizeChatBody } from './message-emoji.js';
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
 *   kind: 'reaction' | 'reply' | 'mention' | 'assigned',
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

/** @param {string} body @param {string} me */
function bodyMentionsMe(body, me) {
	if (!me || !body) return false;
	const people = (members || []).map((m) => ({
		email: String(m.email || '')
			.trim()
			.toLowerCase(),
		name: String(m.name || '').trim()
	}));
	if (!people.some((p) => p.email === me)) {
		people.push({ email: me, name: '' });
	}
	return tokenizeChatBody(body, { people }).some(
		(tok) => tok.type === 'mention' && String(tok.email || '').toLowerCase() === me
	);
}

/** @type {{ feedLen: number, tip: string, tasksLen: number, membersLen: number, me: string, items: ChatActivityItem[] } | null} */
let activityForMeCache = null;

/**
 * Chronological activity aimed at the signed-in person (newest first).
 * @returns {ChatActivityItem[]}
 */
export function activityForMe() {
	/* Do not subscribe to cursorsTick here — list shape is feed/tasks only. */
	const feedLen = chatFeed.length;
	const tip = feedLen ? String(chatFeed[0]?.id || '') : '';
	const tipMsg = feedLen ? chatFeed[0] : null;
	const tasksLen = tasks.length;
	const membersLen = members.length;
	const me = meEmail();
	if (!me) {
		activityForMeCache = null;
		return [];
	}
	/*
	 * Own / local tip cannot create activity aimed at me — keep the prior list
	 * so Chat Send doesn’t rebuild notifications on the sync path.
	 */
	if (
		activityForMeCache &&
		activityForMeCache.me === me &&
		activityForMeCache.tasksLen === tasksLen &&
		activityForMeCache.membersLen === membersLen &&
		feedLen === activityForMeCache.feedLen + 1 &&
		tip !== activityForMeCache.tip &&
		tipMsg &&
		(String(tipMsg.id || '').startsWith('local-') ||
			String(tipMsg.author || '')
				.trim()
				.toLowerCase() === me) &&
		tipMsg.kind !== 'reaction'
	) {
		activityForMeCache = {
			feedLen,
			tip,
			tasksLen,
			membersLen,
			me,
			items: activityForMeCache.items
		};
		return activityForMeCache.items;
	}
	if (
		activityForMeCache &&
		activityForMeCache.feedLen === feedLen &&
		activityForMeCache.tip === tip &&
		activityForMeCache.tasksLen === tasksLen &&
		activityForMeCache.membersLen === membersLen &&
		activityForMeCache.me === me
	) {
		return activityForMeCache.items;
	}

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

		if (m.kind === 'comment' || m.kind === 'chat' || !m.kind) {
			const plain = clip(m.body || '', 96) || 'Reply';
			const isReplyToMe = Boolean(replyTo && myMsgIds.has(replyTo));
			if (isReplyToMe) {
				const parent = byId.get(replyTo);
				items.push({
					id: `reply:${m.id}`,
					kind: 'reply',
					at,
					author,
					preview: plain,
					/* Parent/target body for “replied to "…"” — not the reply itself. */
					targetPreview: clip(parent?.body || '', 48),
					ref: m.ref ?? parent?.ref ?? null,
					messageId: String(m.id)
				});
				continue;
			}
			if (bodyMentionsMe(m.body || '', me)) {
				items.push({
					id: `mention:${m.id}`,
					kind: 'mention',
					at,
					author,
					preview: plain,
					targetPreview: plain,
					ref: m.ref ?? null,
					messageId: String(m.id)
				});
			}
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

	items.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
	activityForMeCache = { feedLen, tip, tasksLen, membersLen, me, items };
	return items;
}

/**
 * Calendar-relative bucket for an activity timestamp.
 * Buckets are mutually exclusive: today → rest of this week → rest of this month → earlier.
 * @param {number} at
 * @param {number} [now]
 * @returns {'today' | 'week' | 'month' | 'earlier'}
 */
export function activityTimeBucket(at, now = Date.now()) {
	const t = Number(at) || 0;
	const dayStart = startOfLocalDay(now);
	if (t >= dayStart) return 'today';
	const weekStart = startOfLocalWeek(now);
	if (t >= weekStart) return 'week';
	const monthStart = startOfLocalMonth(now);
	if (t >= monthStart) return 'month';
	return 'earlier';
}

/**
 * Group newest-first activity into TODAY / THIS WEEK / THIS MONTH / EARLIER sections.
 * Empty buckets are omitted.
 * @param {ChatActivityItem[]} items
 * @param {number} [now]
 * @returns {{ key: 'today' | 'week' | 'month' | 'earlier', items: ChatActivityItem[] }[]}
 */
export function groupActivityByTime(items, now = Date.now()) {
	/** @type {Record<'today' | 'week' | 'month' | 'earlier', ChatActivityItem[]>} */
	const buckets = { today: [], week: [], month: [], earlier: [] };
	for (const item of items) {
		buckets[activityTimeBucket(item.at, now)].push(item);
	}
	/** @type {('today' | 'week' | 'month' | 'earlier')[]} */
	const order = ['today', 'week', 'month', 'earlier'];
	return order
		.filter((key) => buckets[key].length > 0)
		.map((key) => ({ key, items: buckets[key] }));
}

/** @param {number} ms */
function startOfLocalDay(ms) {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Monday-start local week. @param {number} ms */
function startOfLocalWeek(ms) {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	const day = d.getDay(); /* 0 = Sun */
	const diff = day === 0 ? 6 : day - 1;
	d.setDate(d.getDate() - diff);
	return d.getTime();
}

/** @param {number} ms */
function startOfLocalMonth(ms) {
	const d = new Date(ms);
	d.setDate(1);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
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
		else if (a.kind === 'reply' || a.kind === 'mention') out.reply += 1;
		else if (a.kind === 'assigned') out.assigned += 1;
	}
	return out;
}
