/**
 * Family Chat — Drive-backed feed + comments (Chatmail notify later).
 */

import { activePerson, displayNameFromEmail } from './actor.svelte.js';
import {
	createChatMessage,
	deleteChatMessage,
	listComments,
	listFeedMessages,
	markChatMessagesRead,
	softDeleteChatMessage
} from './drive/entities.js';
import { recentEmojis, rememberEmoji } from './emoji.js';
import { activeSession } from './drive/session.svelte.js';
import { notifyChatRecipients } from './push.js';
import { mailTipFor } from './mail.svelte.js';
import {
	enterprises,
	notes,
	projects,
	selectEntity,
	tasks
} from './workspace.svelte.js';
import { projectDisplayIcon, projectLifecycle } from './project-status.js';
import { getContentType, resolveContentTypeCard } from './content-types/index.js';
import { t } from './i18n.svelte.js';

/** Chat ref.type → entity schema / package lookup */
const REF_TYPE_SCHEMA = {
	task: 'alpha.task/4',
	note: 'alpha.note/1',
	project: 'alpha.project/1',
	mail: 'alpha.mail_message/1',
	sheet: 'alpha.table/1',
	table: 'alpha.table/1',
	ai_thread: 'alpha.ai_thread/1',
	git_repo: 'alpha.git_repo/1',
	file: 'alpha.media_blob/1'
};

/** @type {any[]} */
export const chatFeed = $state([]);

/** Cache: `${type}:${id}` → messages */
/** @type {Record<string, any[]>} */
export const commentsByKey = $state({});

export const chatUi = $state({
	loading: false,
	error: /** @type {string | null} */ (null),
	posting: false,
	/**
	 * True after a successful Drive refresh (or a warm cache hydrate).
	 * Until then the panel shows skeleton — never a false empty flash.
	 */
	settled: false,
	/** Active chat id (list + detail). Default shared feed. */
	activeChannelId: 'general',
	/**
	 * When set, CommentThread on that entity opens its sheet once.
	 * Used by chat feed “view more comments” — does not expand inline in the feed.
	 * Shape: `{ key: 'mail:id', scrollToId?: string }` or legacy `'mail:id'` string.
	 * @type {null | string | { key: string, scrollToId?: string | null }}
	 */
	openCommentsFor: null
});

/**
 * Ask CommentThread for `kind:id` to open (and optionally scroll to a comment).
 * @param {'task' | 'note' | 'project' | 'mail' | string} type
 * @param {string} entityId
 * @param {string | null} [scrollToId]
 */
export function requestOpenComments(type, entityId, scrollToId = null) {
	const key = `${type}:${entityId}`;
	chatUi.openCommentsFor = scrollToId
		? { key, scrollToId: String(scrollToId) }
		: { key, scrollToId: null };
}

/** Built-in shared feed (+ future DM/agent channels, Drive-backed later). */
export const chatChannels = $state([
	{
		schema: 'alpha.chat_channel/1',
		id: 'general',
		kind: 'general',
		title: 'Chat',
		created_at: '2020-01-01T00:00:00Z',
		members: []
	}
]);

/**
 * Ephemeral presence (typing / recording / agent) — realtime later; not Drive SoT.
 * Shape: alpha.chat_ephemeral/1
 * @type {any[]}
 */
export const chatEphemeral = $state([]);

/** @param {string} id */
export function setActiveChannel(id) {
	chatUi.activeChannelId = String(id || 'general');
}

export function channelById(id) {
	return chatChannels.find((c) => c.id === id) || chatChannels[0];
}

/**
 * @deprecated Chat feed lives in the list column — kept for call-site compat.
 */
export function ensureChatFeedOpen() {
	setActiveChannel(chatUi.activeChannelId || 'general');
}

/**
 * Remember the active channel id. Does not open a detail pane — the Chat section
 * owns the feed in the list column.
 * @param {string} [id]
 */
export function openChatChannel(id = 'general') {
	setActiveChannel(id);
}

/**
 * Unread messages in a channel for the signed-in person (others' tips not yet in read_by).
 * @param {string} channelId
 * @param {string} [email]
 */
export function unreadCountForChannel(channelId, email = activePerson().email || '') {
	const me = String(email || '')
		.trim()
		.toLowerCase();
	if (!me) return 0;
	const cid = String(channelId || 'general');
	let n = 0;
	for (const m of chatFeed) {
		if (!m?.id || String(m.id).startsWith('local-')) continue;
		if (m.kind === 'reaction' || m.kind === 'event') continue;
		if ((m.channel_id || 'general') !== cid) continue;
		const author = String(m.author || '')
			.trim()
			.toLowerCase();
		if (!author || author === me) continue;
		const readBy = Array.isArray(m.read_by)
			? m.read_by.map((e) => String(e).toLowerCase())
			: [];
		if (!readBy.includes(me)) n += 1;
	}
	return n;
}

function commentKey(type, id) {
	return `${type}:${id}`;
}

const CHAT_CACHE_KEY = 'alpha.chat.feed.v1';
const CHAT_FEED_LIMIT = 200;
/** Keep recently settled sends that a stale tip fetch has not listed yet. */
const SETTLE_GRACE_MS = 120_000;

/** Bumped on each refresh / settle so stale fetches cannot clobber newer state. */
let feedFetchGen = 0;

function readChatCache() {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(CHAT_CACHE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function writeChatCache(list) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(list.slice(0, CHAT_FEED_LIMIT)));
	} catch {
		/* quota */
	}
}

/** Stable feed ids excluding optimistic locals — skips a GET on send. */
function knownFeedIds() {
	return chatFeed.map((m) => String(m.id)).filter((id) => id && !String(id).startsWith('local-'));
}

/** Paint cached feed immediately (hard refresh). */
export function hydrateChatFeedFromCache() {
	const cached = readChatCache();
	if (!Array.isArray(cached) || !cached.length) return false;
	if (chatFeed.length === 0) {
		/* Stale in-flight rows from a killed tab → failed (never silent vanish). */
		const rows = cached.map((m) => {
			if (!m?._pending && m?.delivery !== 'sending') return m;
			return {
				...m,
				_pending: false,
				_local: true,
				_failed: true,
				delivery: 'failed'
			};
		});
		chatFeed.push(...rows);
		if (rows.some((m) => m._failed)) {
			chatUi.error = t('chat.pendingLost');
			writeChatCache(chatFeed);
		}
	}
	chatUi.settled = true;
	chatUi.loading = false;
	return true;
}

/**
 * Merge server rows with in-memory pending / recent settles. Never drops in-flight sends.
 * @param {any[]} list
 * @param {any[]} prev
 */
function mergeFeedRows(list, prev) {
	const byId = new Map();
	for (const m of list) {
		const id = String(m?.id || '');
		if (id) byId.set(id, m);
	}
	const now = Date.now();
	for (const m of prev) {
		const id = String(m?.id || '');
		if (!id) continue;
		if (byId.has(id)) {
			if (Array.isArray(m.attachments)) {
				const server = byId.get(id);
				const prevAtt = m.attachments;
				const nextAtt = Array.isArray(server.attachments) ? server.attachments : [];
				byId.set(id, {
					...server,
					attachments: nextAtt.map((a) => ({
						...a,
						...(prevAtt.find((p) => p?.path === a?.path)?.previewUrl
							? { previewUrl: prevAtt.find((p) => p?.path === a?.path)?.previewUrl }
							: {})
					}))
				});
			}
			continue;
		}
		const pending =
			Boolean(m?._local || m?._pending || m?._failed) ||
			String(id).startsWith('local-') ||
			m?.delivery === 'sending' ||
			m?.delivery === 'failed';
		const created = Date.parse(m.created_at || '');
		const recent =
			Number.isFinite(created) && now - created >= 0 && now - created < SETTLE_GRACE_MS;
		if (pending || recent) byId.set(id, m);
	}

	const serverOrder = list.map((m) => String(m.id)).filter(Boolean);
	const extras = [...byId.keys()].filter((id) => !serverOrder.includes(id));
	return [
		...extras.map((id) => byId.get(id)),
		...serverOrder.map((id) => byId.get(id))
	].filter(Boolean);
}

export async function refreshChatFeed() {
	const session = activeSession();
	if (!session) {
		/* Keep cache / in-memory — never wipe to an empty flash. */
		if (chatFeed.length === 0) hydrateChatFeedFromCache();
		chatUi.loading = false;
		if (chatFeed.length > 0) chatUi.settled = true;
		return;
	}
	if (chatFeed.length === 0) hydrateChatFeedFromCache();
	const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
	if (offline && chatFeed.length > 0) {
		chatUi.loading = false;
		chatUi.settled = true;
		return;
	}
	/* Skeleton only when we have nothing to paint — never clear the feed mid-fetch. */
	chatUi.loading = chatFeed.length === 0;
	const hasFailed = chatFeed.some((m) => m?._failed);
	if (!hasFailed) chatUi.error = null;
	const gen = ++feedFetchGen;
	const prev = chatFeed.slice();
	try {
		const apply = (/** @type {any[]} */ list) => {
			if (gen !== feedFetchGen) return;
			const merged = mergeFeedRows(list, prev);
			if (!merged.length && !chatFeed.length) return;
			chatFeed.splice(0, chatFeed.length, ...merged);
			chatUi.loading = false;
			chatUi.settled = true;
			/* Keep pending/failed locals — stripping them made reopen vanish sends. */
			writeChatCache(merged);
		};

		const list = await listFeedMessages(session, CHAT_FEED_LIMIT, {
			onPartial: (partial) => {
				/* Leaf-cache hits / early batches — drop skeleton before network misses finish. */
				if (partial?.length) apply(partial);
			}
		});
		/* A newer refresh or settle won — do not clobber. */
		if (gen !== feedFetchGen) return;
		apply(list);
	} catch (e) {
		if (gen === feedFetchGen) {
			chatUi.error = e instanceof Error ? e.message : String(e);
		}
	} finally {
		if (gen === feedFetchGen) {
			chatUi.loading = false;
			chatUi.settled = true;
		}
	}
}

/**
 * @param {'task' | 'note' | 'project' | 'mail'} type
 * @param {string} entityId
 */
/**
 * Stamp 0-based `ref.seq` on comment leaves (oldest → newest) and mirror onto the feed.
 * @param {any[]} list
 */
function stampCommentSeq(list) {
	const comments = (Array.isArray(list) ? list : [])
		.filter((m) => m && m.kind !== 'event' && m.kind !== 'reaction')
		.slice()
		.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
	/** @type {Map<string, number>} */
	const byId = new Map();
	comments.forEach((m, i) => {
		byId.set(String(m.id), i);
		if (m.ref && typeof m.ref === 'object') {
			m.ref = { ...m.ref, seq: i };
		}
	});
	if (byId.size) {
		for (let i = 0; i < chatFeed.length; i++) {
			const m = chatFeed[i];
			const seq = byId.get(String(m?.id));
			if (seq == null || !m?.ref) continue;
			if (m.ref.seq === seq) continue;
			chatFeed[i] = { ...m, ref: { ...m.ref, seq } };
		}
	}
	return list;
}

export async function loadComments(type, entityId) {
	const session = activeSession();
	const key = commentKey(type, entityId);
	if (!session) {
		commentsByKey[key] = [];
		return [];
	}
	try {
		const list = await listComments(session, type, entityId);
		stampCommentSeq(list);
		commentsByKey[key] = list;
		return list;
	} catch (e) {
		commentsByKey[key] = [];
		throw e;
	}
}

/** Quick-react defaults — matches Alpha Chat `MessageReactions.DEFAULT_EMOJI`. */
export const REACTION_EMOJI = [
	'👍',
	'❤️',
	'😂',
	'😮',
	'😢',
	'🙏',
	'👎',
	'🎉',
	'🔥',
	'💯',
	'😍',
	'🤔'
];

/**
 * MRU first, then defaults (no dupes) — reaction stadium row.
 * @param {number} [limit]
 * @returns {string[]}
 */
export function quickReactionEmojis(limit = 24) {
	const recent = recentEmojis();
	const out = [];
	const seen = new Set();
	for (const g of recent) {
		const emoji = String(g || '').trim();
		if (!emoji || seen.has(emoji)) continue;
		seen.add(emoji);
		out.push(emoji);
		if (out.length >= limit) return out;
	}
	for (const g of REACTION_EMOJI) {
		if (seen.has(g)) continue;
		seen.add(g);
		out.push(g);
		if (out.length >= limit) break;
	}
	return out;
}

/**
 * Aggregate reaction leaves that target a message (`kind=reaction`, `reply_to`).
 * @param {string} messageId
 * @returns {{ emoji: string, count: number, mine: boolean, authors: string[] }[]}
 */
export function reactionsForMessage(messageId) {
	const id = String(messageId || '');
	if (!id) return [];
	const me = (activePerson().email || '').trim().toLowerCase();
	/** @type {Map<string, { emoji: string, count: number, mine: boolean, authors: string[] }>} */
	const byEmoji = new Map();
	for (const m of chatFeed) {
		if (m?.kind !== 'reaction') continue;
		if (String(m.reply_to || '') !== id) continue;
		const emoji = String(m.reaction || m.body || '').trim();
		if (!emoji) continue;
		const author = String(m.author || '').trim().toLowerCase();
		const prev = byEmoji.get(emoji) || { emoji, count: 0, mine: false, authors: [] };
		prev.count += 1;
		if (author && !prev.authors.includes(author)) prev.authors.push(author);
		if (me && author === me) prev.mine = true;
		byEmoji.set(emoji, prev);
	}
	return [...byEmoji.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

/**
 * Feed rows excluding reaction leaves (those render as chips on the parent bubble).
 * @param {any[]} list
 */
export function visibleChatMessages(list) {
	return (list || []).filter((m) => m?.kind !== 'reaction');
}

/**
 * Short verb phrase for `kind=event` rows / inbox previews.
 * @param {any} msg
 */
export function chatEventLabel(msg) {
	const t = String(msg?.ref?.type || '').toLowerCase();
	if (t === 'task') return 'added a Task';
	if (t === 'note') return 'added a Note';
	if (t === 'project') return 'added a Project';
	if (t === 'enterprise') return 'added an Enterprise';
	if (t === 'mail') return 'commented on Mail';
	return 'shared something';
}

/**
 * Centered status-line copy for system events (member joins, etc.).
 * @param {any} msg
 */
export function chatStatusText(msg) {
	const body = String(msg?.body || '').trim();
	if (body) return body;
	const t = String(msg?.ref?.type || '').toLowerCase();
	const subjectEmail = String(msg?.ref?.id || '').trim();
	const subject = subjectEmail ? displayNameFromEmail(subjectEmail) : '';
	const actor = displayNameFromEmail(msg?.author);
	if (t === 'member') {
		const action = String(msg?.ref?.action || 'added').toLowerCase();
		const who = subject || actor || 'Someone';
		if (action === 'removed') return `${who} was removed from the Space`;
		if (action === 'joined') return `${who} joined the Space`;
		if (action === 'left') return `${who} left the Space`;
		return `${who} was added to the Space`;
	}
	if (t === 'status' || t === 'system') {
		return actor ? `${actor} updated the conversation` : 'Conversation updated';
	}
	return actor ? `${actor} ${chatEventLabel(msg)}` : chatEventLabel(msg);
}

/**
 * True for centered status lines (not entity-create tip panels).
 * @param {any} msg
 */
export function isChatStatusEvent(msg) {
	if (msg?.kind !== 'event') return false;
	const t = String(msg?.ref?.type || '').toLowerCase();
	if (t === 'task' || t === 'note' || t === 'project' || t === 'enterprise' || t === 'mail') {
		return false;
	}
	return true;
}

/**
 * Announce a newly created entity in General (subtle tip-only panel).
 * Fire-and-forget — never blocks create UX.
 * @param {'task' | 'note' | 'project' | 'enterprise'} type
 * @param {string} id
 */
export function announceEntityCreated(type, id) {
	const entityId = String(id || '').trim();
	if (!entityId || !type) return;
	void postChatMessage({
		body: '',
		kind: 'event',
		ref: { type, id: entityId },
		channel_id: 'general'
	}).catch((e) => console.warn('chat event', e));
}

/**
 * Announce a membership change as a centered status line in General.
 * @param {string} email
 * @param {'added' | 'removed' | 'joined' | 'left'} [action]
 * @param {string} [name]
 */
export function announceMemberStatus(email, action = 'added', name = '') {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	if (!e) return;
	const who = String(name || '').trim() || displayNameFromEmail(e);
	const verb =
		action === 'removed'
			? 'was removed from the Space'
			: action === 'joined'
				? 'joined the Space'
				: action === 'left'
					? 'left the Space'
					: 'was added to the Space';
	void postChatMessage({
		body: `${who} ${verb}`,
		kind: 'event',
		ref: { type: 'member', id: e, action },
		channel_id: 'general'
	}).catch((err) => console.warn('chat member status', err));
}

/**
 * Toggle a reaction on a chat message (persists as `alpha.chat_message/1` kind=reaction).
 * Tapping your own reaction removes it (optimistic + Drive delete).
 * @param {string} messageId
 * @param {string} emoji
 */
export async function toggleReaction(messageId, emoji) {
	const session = activeSession();
	const author = activePerson().email;
	if (!author) throw new Error('Pick who you are in Settings first');
	const target = String(messageId || '');
	const reaction = String(emoji || '').trim();
	if (!target || !reaction) return;
	rememberEmoji(reaction);

	const me = author.trim().toLowerCase();
	const existing = chatFeed.find(
		(m) =>
			m?.kind === 'reaction' &&
			String(m.reply_to || '') === target &&
			String(m.reaction || m.body || '').trim() === reaction &&
			String(m.author || '').trim().toLowerCase() === me
	);

	if (existing) {
		const removeId = String(existing.id);
		const idx = chatFeed.findIndex((m) => m.id === removeId);
		if (idx >= 0) chatFeed.splice(idx, 1);
		writeChatCache(chatFeed);

		if (!session || removeId.startsWith('local-')) return null;

		try {
			await deleteChatMessage(session, removeId, {
				knownFeedIds: knownFeedIds()
			});
		} catch (e) {
			/* Roll back optimistic remove */
			chatFeed.unshift(existing);
			writeChatCache(chatFeed);
			throw e;
		}
		return null;
	}

	const localId = `local-${crypto.randomUUID()}`;
	const optimistic = {
		schema: 'alpha.chat_message/1',
		id: localId,
		kind: 'reaction',
		author,
		body: '',
		reaction,
		created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
		reply_to: target,
		ref: { type: 'chat', id: target },
		_local: true,
		_pending: true
	};
	chatFeed.unshift(optimistic);
	writeChatCache(chatFeed);

	if (!session) return optimistic;

	try {
		const created = await createChatMessage(
			session,
			{
				body: '',
				author,
				kind: 'reaction',
				reaction,
				reply_to: target,
				ref: { type: 'chat', id: target }
			},
			{
				knownFeedIds: knownFeedIds().filter((id) => id !== localId),
				onTipWritten: (tip) => {
					void import('./realtime.svelte.js').then(({ publishTipWake }) => publishTipWake(tip));
				}
			}
		);
		const idx = chatFeed.findIndex((m) => m.id === localId);
		if (idx >= 0) chatFeed[idx] = created;
		else chatFeed.unshift(created);
		writeChatCache(chatFeed);
		return created;
	} catch (e) {
		const idx = chatFeed.findIndex((m) => m.id === localId);
		if (idx >= 0) chatFeed.splice(idx, 1);
		throw e;
	}
}

/**
 * Mark others' visible messages as read by this account (double-check for them).
 * One tip write for the batch — never N serial tip updates (that made sends feel multi-second).
 */
export async function markIncomingMessagesRead() {
	const session = activeSession();
	const me = (activePerson().email || '').trim().toLowerCase();
	if (!session || !me || chatUi.posting) return;
	const channel = chatUi.activeChannelId || 'general';
	const targets = chatFeed.filter((m) => {
		if (!m?.id || String(m.id).startsWith('local-')) return false;
		if (m.kind === 'reaction' || m.kind === 'event') return false;
		if ((m.channel_id || 'general') !== channel) return false;
		const author = String(m.author || '')
			.trim()
			.toLowerCase();
		if (!author || author === me) return false;
		const readBy = Array.isArray(m.read_by)
			? m.read_by.map((e) => String(e).toLowerCase())
			: [];
		return !readBy.includes(me);
	});
	const batch = targets.slice(0, 25);
	if (!batch.length) return;
	try {
		const updated = await markChatMessagesRead(session, batch, me);
		for (const next of updated) {
			const idx = chatFeed.findIndex((m) => m.id === next.id);
			if (idx >= 0) chatFeed[idx] = { ...chatFeed[idx], ...next };
		}
		if (updated.length) writeChatCache(chatFeed);
	} catch {
		/* ignore — next wake retries */
	}
}

/**
 * @param {{
 *   body: string,
 *   kind?: 'comment' | 'chat' | 'reaction' | 'event',
 *   ref?: { type: string, id: string } | null,
 *   reply_to?: string | null,
 *   reaction?: string,
 *   channel_id?: string,
 *   attachments?: any[],
 *   resolveAttachments?: () => Promise<any[]>
 * }} input
 */
export async function postChatMessage(input) {
	const session = activeSession();
	const author = activePerson().email;
	if (!author) throw new Error('Pick who you are in Settings first');
	const isReaction = input.kind === 'reaction';
	const isEvent = input.kind === 'event';
	const hasAtt =
		(Array.isArray(input.attachments) && input.attachments.length > 0) ||
		typeof input.resolveAttachments === 'function';
	if (!isReaction && !isEvent && !input.body?.trim() && !hasAtt) throw new Error('Empty message');
	if (isEvent && !(input.ref?.type && input.ref?.id)) throw new Error('Event needs a ref');

	const body = isReaction || isEvent ? String(input.body || '').trim() : String(input.body || '').trim();
	const kind = input.kind || (input.ref ? 'comment' : 'chat');
	const channelId = String(input.channel_id || chatUi.activeChannelId || 'general');
	const localId = `local-${crypto.randomUUID()}`;

	/** 0-based comment index on the entity — feed uses this for instant “view more”. */
	let refWithSeq = input.ref ? { ...input.ref } : null;
	if (
		refWithSeq &&
		!isEvent &&
		!isReaction &&
		(refWithSeq.type === 'task' ||
			refWithSeq.type === 'note' ||
			refWithSeq.type === 'project' ||
			refWithSeq.type === 'mail')
	) {
		if (typeof refWithSeq.seq !== 'number') {
			const ck = commentKey(/** @type {any} */ (refWithSeq.type), refWithSeq.id);
			const existing = (commentsByKey[ck] ?? []).filter(
				(m) => m?.kind !== 'event' && m?.kind !== 'reaction'
			);
			let maxSeq = -1;
			for (const m of existing) {
				if (typeof m?.ref?.seq === 'number') maxSeq = Math.max(maxSeq, m.ref.seq);
			}
			for (const m of chatFeed) {
				if (
					m?.kind === 'event' ||
					m?.kind === 'reaction' ||
					m?.ref?.type !== refWithSeq.type ||
					m?.ref?.id !== refWithSeq.id
				) {
					continue;
				}
				if (typeof m.ref?.seq === 'number') maxSeq = Math.max(maxSeq, m.ref.seq);
			}
			refWithSeq = {
				...refWithSeq,
				seq: maxSeq >= 0 ? maxSeq + 1 : existing.length
			};
		}
	}

	/** Serializable enough to retry after reopen (paths only — not File blobs). */
	const outbox = {
		body,
		kind,
		channel_id: channelId,
		ref: refWithSeq ?? null,
		reply_to: input.reply_to ?? null,
		...(input.reaction ? { reaction: input.reaction } : {}),
		...(Array.isArray(input.attachments) && input.attachments.length
			? { attachments: input.attachments }
			: {})
	};

	const optimistic = {
		schema: 'alpha.chat_message/1',
		id: localId,
		kind,
		author,
		body,
		created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
		channel_id: channelId,
		delivery: 'sending',
		read_by: [],
		...(refWithSeq ? { ref: refWithSeq } : {}),
		...(input.reaction ? { reaction: input.reaction } : {}),
		...(input.reply_to ? { reply_to: input.reply_to } : {}),
		...(Array.isArray(input.attachments) && input.attachments.length
			? { attachments: input.attachments }
			: {}),
		_local: true,
		_pending: true,
		_localId: localId,
		_outbox: outbox
	};

	/* Paint immediately — never wait on Drive tip for the bubble. */
	chatFeed.unshift(optimistic);
	if (
		!isEvent &&
		input.ref &&
		(input.ref.type === 'task' ||
			input.ref.type === 'note' ||
			input.ref.type === 'project' ||
			input.ref.type === 'mail')
	) {
		const key = commentKey(/** @type {any} */ (input.ref.type), input.ref.id);
		const prev = commentsByKey[key] ?? [];
		commentsByKey[key] = [...prev, optimistic];
	}
	writeChatCache(chatFeed);

	if (!session) {
		const idx = chatFeed.findIndex((m) => m.id === localId);
		if (idx >= 0) {
			chatFeed[idx] = {
				...chatFeed[idx],
				_pending: false,
				_failed: true,
				delivery: 'failed'
			};
		}
		chatUi.error = t('chat.notConnected');
		writeChatCache(chatFeed);
		return optimistic;
	}

	/**
	 * Find this send’s row after leaf may have swapped local-* → server id.
	 * @param {string | null} serverId
	 */
	function findSendIndex(serverId) {
		return chatFeed.findIndex(
			(m) =>
				m.id === localId ||
				m._localId === localId ||
				(serverId && m.id === serverId)
		);
	}

	/**
	 * @param {string} key
	 * @param {any} next
	 * @param {string | null} serverId
	 */
	function patchCommentRow(key, next, serverId) {
		const prev = commentsByKey[key] ?? [];
		commentsByKey[key] = prev.map((m) =>
			m.id === localId || m._localId === localId || (serverId && m.id === serverId) ? next : m
		);
	}

	/* Drive write in background — ✓ only after feed tip is committed. */
	void (async () => {
		chatUi.posting = true;
		/** @type {string | null} */
		let serverId = null;
		try {
			/** @type {any[]} */
			let attachments = Array.isArray(input.attachments) ? input.attachments : [];
			if (typeof input.resolveAttachments === 'function') {
				attachments = await input.resolveAttachments();
				const idxAtt = findSendIndex(serverId);
				if (idxAtt >= 0) {
					const nextAtt = attachments.map((a) => ({
						...a,
						previewUrl:
							a.previewUrl ||
							chatFeed[idxAtt].attachments?.find(
								(/** @type {any} */ x) => x.name === a.name
							)?.previewUrl
					}));
					chatFeed[idxAtt] = {
						...chatFeed[idxAtt],
						attachments: nextAtt,
						_outbox: {
							...(chatFeed[idxAtt]._outbox || outbox),
							attachments: nextAtt.map((a) => {
								const { previewUrl: _p, ...rest } = a;
								return rest;
							})
						}
					};
					writeChatCache(chatFeed);
				}
			}

			const knownComments =
				!isEvent &&
				input.ref &&
				(input.ref.type === 'task' ||
					input.ref.type === 'note' ||
					input.ref.type === 'project' ||
					input.ref.type === 'mail')
					? (commentsByKey[commentKey(/** @type {any} */ (input.ref.type), input.ref.id)] ?? [])
							.map((m) => String(m.id))
							.filter((id) => id && !id.startsWith('local-'))
					: undefined;

			const previewByName = new Map(
				(Array.isArray(attachments) ? attachments : [])
					.filter((a) => a?.previewUrl)
					.map((a) => [String(a.name || a.path), a.previewUrl])
			);

			/** Leaf landed — keep “sending” until tip/index write finishes. */
			function adoptLeaf(/** @type {any} */ leafMsg) {
				serverId = String(leafMsg.id || '') || null;
				const idx = findSendIndex(serverId);
				if (idx < 0) return;
				const prev = chatFeed[idx];
				const next = {
					...prev,
					...leafMsg,
					id: leafMsg.id,
					channel_id: leafMsg.channel_id || channelId,
					delivery: 'sending',
					_pending: true,
					_local: true,
					_failed: false,
					_localId: localId,
					_outbox: prev._outbox || outbox,
					...(Array.isArray(prev.attachments) && prev.attachments.length
						? { attachments: prev.attachments }
						: attachments.length
							? { attachments }
							: {})
				};
				chatFeed[idx] = next;
				if (
					!isEvent &&
					input.ref &&
					(input.ref.type === 'task' ||
						input.ref.type === 'note' ||
						input.ref.type === 'project' ||
						input.ref.type === 'mail')
				) {
					patchCommentRow(
						commentKey(/** @type {any} */ (input.ref.type), input.ref.id),
						next,
						serverId
					);
				}
				writeChatCache(chatFeed);
			}

			/** Tip + feed.json committed — only now show ✓. */
			function settleFrom(/** @type {any} */ created) {
				const settledAtt = Array.isArray(created.attachments)
					? created.attachments.map((a) => ({
							...a,
							...(previewByName.get(String(a.name || a.path))
								? { previewUrl: previewByName.get(String(a.name || a.path)) }
								: {})
						}))
					: attachments.filter((a) => a?.previewUrl);
				const settledMsg = {
					...created,
					channel_id: created.channel_id || channelId,
					delivery: 'sent',
					read_by: Array.isArray(created.read_by) ? created.read_by : [],
					...(settledAtt.length ? { attachments: settledAtt } : {}),
					...(previewByName.size && !settledAtt.length && attachments.length
						? { attachments }
						: {}),
					_pending: false,
					_local: false,
					_failed: false
				};
				delete settledMsg._localId;
				delete settledMsg._outbox;
				feedFetchGen += 1;
				const idx = findSendIndex(String(created.id || '') || serverId);
				if (idx >= 0) chatFeed[idx] = settledMsg;
				else chatFeed.unshift(settledMsg);
				if (
					!isEvent &&
					input.ref &&
					(input.ref.type === 'task' ||
						input.ref.type === 'note' ||
						input.ref.type === 'project' ||
						input.ref.type === 'mail')
				) {
					patchCommentRow(
						commentKey(/** @type {any} */ (input.ref.type), input.ref.id),
						settledMsg,
						String(created.id || '') || serverId
					);
				}
				writeChatCache(chatFeed);
				return settledMsg;
			}

			const created = await createChatMessage(
				session,
				{
					body,
					author,
					kind,
					channel_id: channelId,
					ref: refWithSeq ?? null,
					reply_to: input.reply_to ?? null,
					delivery: 'sent',
					...(input.reaction ? { reaction: input.reaction } : {}),
					...(attachments.length ? { attachments } : {})
				},
				{
					knownFeedIds: knownFeedIds().filter((id) => id !== localId),
					knownCommentIds: knownComments,
					onLeafStored: (leafMsg) => {
						adoptLeaf({
							...leafMsg,
							...(attachments.length ? { attachments } : {})
						});
					},
					/* Publish tip hash the instant putTip lands — no extra getTip RTT. */
					onTipWritten: (tip) => {
						void import('./realtime.svelte.js').then(({ publishTipWake }) => publishTipWake(tip));
					}
				}
			);

			settleFrom(created);

			/* Wake other devices (Home Screen PWA push). Never block the send UX. */
			if (!isReaction && kind !== 'reaction') {
				const pushBody =
					kind === 'event'
						? `${displayNameFromEmail(author)} ${chatEventLabel({ ref: input.ref })}`
						: body || (attachments.length ? '📎 Attachment' : '');
				void notifyChatRecipients({
					authorEmail: author,
					authorName: displayNameFromEmail(author),
					body: pushBody
				}).catch((e) => console.warn('chat push', e));
			}
		} catch (e) {
			const idx = findSendIndex(serverId);
			if (idx >= 0) {
				chatFeed[idx] = {
					...chatFeed[idx],
					_pending: false,
					_failed: true,
					delivery: 'failed',
					_local: true,
					_localId: localId
				};
			}
			chatUi.error = e instanceof Error ? e.message : String(e);
			writeChatCache(chatFeed);
		} finally {
			chatUi.posting = false;
		}
	})();

	return optimistic;
}

/**
 * Re-send a failed bubble (must still have `_outbox`).
 * @param {any} msg
 */
export async function retryChatMessage(msg) {
	const draft = msg?._outbox;
	if (!draft || typeof draft !== 'object') {
		chatUi.error = t('chat.retryUnavailable');
		throw new Error(chatUi.error);
	}
	const trackId = String(msg._localId || msg.id || '');
	const drop = (/** @type {any[]} */ list) =>
		list.filter(
			(m) => m.id !== msg.id && m._localId !== trackId && m.id !== trackId
		);
	chatFeed.splice(0, chatFeed.length, ...drop(chatFeed));
	if (draft.ref?.type && draft.ref?.id) {
		const key = commentKey(/** @type {any} */ (draft.ref.type), draft.ref.id);
		if (commentsByKey[key]) commentsByKey[key] = drop(commentsByKey[key]);
	}
	writeChatCache(chatFeed);
	chatUi.error = null;
	return postChatMessage({
		body: draft.body,
		kind: draft.kind,
		channel_id: draft.channel_id,
		ref: draft.ref,
		reply_to: draft.reply_to,
		...(draft.reaction ? { reaction: draft.reaction } : {}),
		...(Array.isArray(draft.attachments) && draft.attachments.length
			? { attachments: draft.attachments }
			: {})
	});
}

/**
 * Soft-delete a chat bubble — leaves a muted tombstone in the feed.
 * @param {string} messageId
 */
export async function softDeleteChatMessageUi(messageId) {
	const session = activeSession();
	const author = activePerson().email;
	const id = String(messageId || '');
	if (!id) return;
	const idx = chatFeed.findIndex((m) => m.id === id);
	const prev = idx >= 0 ? chatFeed[idx] : null;
	if (prev?.deleted || prev?.deleted_at) return;
	const tombstone = {
		...(prev || { schema: 'alpha.chat_message/1', id, kind: 'chat', author }),
		body: '',
		attachments: [],
		deleted: true,
		deleted_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
		_pending: false,
		_failed: false,
		_local: false
	};
	delete tombstone._outbox;
	delete tombstone._localId;
	if (idx >= 0) chatFeed[idx] = tombstone;
	else chatFeed.unshift(tombstone);
	writeChatCache(chatFeed);

	if (!session || id.startsWith('local-')) return tombstone;

	try {
		const saved = await softDeleteChatMessage(session, id, { author: author || prev?.author });
		const i2 = chatFeed.findIndex((m) => m.id === id);
		if (i2 >= 0) chatFeed[i2] = { ...chatFeed[i2], ...saved, deleted: true };
		writeChatCache(chatFeed);
		return saved;
	} catch (e) {
		if (idx >= 0 && prev) chatFeed[idx] = prev;
		writeChatCache(chatFeed);
		chatUi.error = e instanceof Error ? e.message : String(e);
		throw e;
	}
}

/**
 * Open the entity a chat card refers to.
 * Always stay on the current route (usually /chat) and open DetailColumn —
 * never jump to /tasks|/notes|/… or Back leaves the chat feed.
 * @param {any} msg
 */
export function openChatRef(msg) {
	const ref = msg?.ref;
	if (!ref?.type || !ref?.id) return;

	/* Git: leave Admin for the forge URL (trust plane B — not cryptree). */
	if (ref.type === 'git_repo') {
		const href = String(ref.web_url || ref.remote_url || '').trim();
		if (href && typeof window !== 'undefined') {
			window.open(href, '_blank', 'noopener,noreferrer');
		}
		return;
	}

	/** @type {'task' | 'note' | 'project' | 'enterprise' | 'mail' | null} */
	let kind = null;
	if (ref.type === 'task') kind = 'task';
	else if (ref.type === 'note') kind = 'note';
	else if (ref.type === 'project') kind = 'project';
	else if (ref.type === 'enterprise') kind = 'enterprise';
	else if (ref.type === 'mail') kind = 'mail';
	if (!kind) return;

	selectEntity(kind, ref.id);
	if (kind === 'mail') {
		/* Hard refresh: tip opens from cache; pull live thread in background. */
		void import('./mail.svelte.js')
			.then((m) => m.refreshMail())
			.catch(() => {});
	}
}

/** @param {any} msg */
export function chatRefLabel(msg) {
	const meta = chatRefMeta(msg);
	if (!meta) return null;
	return meta.kind ? `${meta.kind} · ${meta.title}` : meta.title;
}

/**
 * Stable key for publication comments in the chat feed.
 * Plain chat / reaction-target `chat` refs return null (no panel grouping).
 * Events are tip-only panels and never share a key with comments.
 * @param {any} msg
 * @returns {string | null}
 */
export function chatPublicationRefKey(msg) {
	const ref = msg?.ref;
	if (!ref?.type || !ref?.id) return null;
	if (ref.type === 'chat' || ref.type === 'reaction') return null;
	if (
		ref.type !== 'task' &&
		ref.type !== 'note' &&
		ref.type !== 'project' &&
		ref.type !== 'enterprise' &&
		ref.type !== 'mail' &&
		ref.type !== 'sheet' &&
		ref.type !== 'table' &&
		ref.type !== 'ai_thread' &&
		ref.type !== 'git_repo' &&
		ref.type !== 'file'
	) {
		return null;
	}
	/* Events share the entity key so create-tips + comments land in one panel. */
	return `${ref.type}:${ref.id}`;
}

/**
 * Content tip for CommentCard-style feed rows.
 * @param {any} msg
 * @returns {{
 *   kind: string,
 *   title: string,
 *   icon: string,
 *   box?: 'task' | 'project' | 'enterprise' | 'note',
 *   status?: string,
 *   project?: any,
 *   enterprise?: any,
 *   tipEmails?: string[],
 *   tipNames?: Record<string, string>
 * } | null}
 */
export function chatRefMeta(msg) {
	const ref = msg?.ref;
	if (!ref?.type) return null;

	const pkg = getContentType(REF_TYPE_SCHEMA[ref.type] || '');
	const typeName = pkg?.chat?.type_name;
	const typeIcon = pkg?.chat?.icon;

	if (ref.type === 'task') {
		const task = tasks.find((x) => x.id === ref.id);
		if (!task) {
			return {
				kind: typeName || 'Task',
				title: t('chat.deletedTask'),
				icon: typeIcon || 'tasks',
				box: 'task',
				status: 'open',
				deleted: true
			};
		}
		const card = resolveContentTypeCard({ ...task, schema: 'alpha.task/4' }, {
			packageId: 'alpha.tasks'
		});
		return {
			kind: card?.typeName || typeName || 'Task',
			title: card?.title || task?.title || 'Task',
			icon: card?.icon || typeIcon || 'tasks',
			/* First-party host status glyph — not package CSS. */
			box: 'task',
			status: task?.status || 'open'
		};
	}
	if (ref.type === 'note') {
		const n = notes.find((x) => x.id === ref.id);
		if (!n) {
			return {
				kind: typeName || 'Note',
				title: t('chat.deletedNote'),
				icon: typeIcon || 'notes',
				box: 'note',
				deleted: true
			};
		}
		const card = resolveContentTypeCard({ ...n, schema: 'alpha.note/1' }, {
			packageId: 'alpha.notes'
		});
		return {
			kind: card?.typeName || typeName || 'Note',
			title: card?.title || n?.title || 'Untitled',
			icon: card?.icon || typeIcon || 'notes',
			box: 'note'
		};
	}
	if (ref.type === 'project') {
		const p = projects.find((x) => x.id === ref.id);
		if (!p) {
			return {
				kind: typeName || 'Project',
				title: t('chat.deletedProject'),
				icon: typeIcon || 'projects',
				box: 'project',
				project: null,
				deleted: true
			};
		}
		const card = resolveContentTypeCard({ ...p, schema: 'alpha.project/1' }, {
			packageId: 'alpha.projects'
		});
		return {
			kind: card?.typeName || typeName || 'Project',
			title: card?.title || p?.title || 'Project',
			icon: card?.icon || typeIcon || 'projects',
			box: 'project',
			project: p ?? null
		};
	}
	if (ref.type === 'enterprise') {
		const e = enterprises.find((x) => x.id === ref.id);
		if (!e) {
			return {
				kind: 'Enterprise',
				title: t('chat.deletedEnterprise'),
				icon: 'entreprises',
				box: 'enterprise',
				enterprise: null,
				deleted: true
			};
		}
		return {
			kind: 'Enterprise',
			title: e?.title || 'Enterprise',
			icon: 'entreprises',
			box: 'enterprise',
			enterprise: e ?? null
		};
	}
	if (ref.type === 'sheet' || ref.type === 'table') {
		const card = resolveContentTypeCard(
			{ schema: 'alpha.table/1', id: ref.id, title: ref.title, key: ref.key },
			{ packageId: 'alpha.sheets' }
		);
		return {
			kind: card?.typeName || typeName || 'Sheet',
			title: card?.title || String(ref.title || 'Sheet'),
			icon: card?.icon || typeIcon || 'enterprise',
			summary: card?.summary || ''
		};
	}
	if (ref.type === 'ai_thread') {
		const card = resolveContentTypeCard(
			{
				schema: 'alpha.ai_thread/1',
				id: ref.id,
				title: ref.title,
				status: ref.status
			},
			{ packageId: 'alpha.ai_threads' }
		);
		return {
			kind: card?.typeName || typeName || 'AI thread',
			title: card?.title || String(ref.title || 'AI thread'),
			icon: card?.icon || typeIcon || 'chat',
			summary: card?.summary || ''
		};
	}
	if (ref.type === 'git_repo') {
		const card = resolveContentTypeCard(
			{
				schema: 'alpha.git_repo/1',
				id: ref.id,
				title: ref.title,
				default_branch: ref.default_branch
			},
			{ packageId: 'alpha.git_repos' }
		);
		return {
			kind: card?.typeName || typeName || 'Git repo',
			title: card?.title || String(ref.title || 'Git repo'),
			icon: card?.icon || typeIcon || 'drive',
			summary: card?.summary || ''
		};
	}
	if (ref.type === 'file') {
		const card = resolveContentTypeCard(
			{
				schema: 'alpha.media_blob/1',
				name: ref.title || ref.name,
				content_type: ref.content_type
			},
			{ packageId: 'alpha.files', path: ref.path || ref.id }
		);
		return {
			kind: card?.typeName || typeName || 'File',
			title: card?.title || String(ref.title || ref.name || 'File'),
			icon: card?.icon || typeIcon || 'drive',
			summary: card?.summary || ''
		};
	}
	if (ref.type === 'mail') {
		const tip = mailTipFor(ref.id);
		/* Prefer snapshot on this leaf, then siblings in the feed, then tip cache. */
		let subject = String(ref.title || ref.subject || '').trim();
		let from = normEmail(ref.from || '');
		let fromName = String(ref.from_name || '').trim();
		if (!subject || !from) {
			const sib = chatFeed.find(
				(m) =>
					m?.ref?.type === 'mail' &&
					String(m.ref.id) === String(ref.id) &&
					(m.ref.title || m.ref.subject || m.ref.from)
			);
			if (sib?.ref) {
				if (!subject) subject = String(sib.ref.title || sib.ref.subject || '').trim();
				if (!from) from = normEmail(sib.ref.from);
				if (!fromName) fromName = String(sib.ref.from_name || '').trim();
			}
		}
		if (!subject) subject = String(tip?.subject || '').trim();
		if (!from) from = normEmail(tip?.from || '');
		if (!fromName) fromName = String(tip?.from_name || '').trim();
		if (!subject) subject = '(no subject)';
		return {
			kind: typeName || 'Mail',
			title: subject,
			icon: typeIcon || 'mail',
			/* Tip row pfps = mail contact (not team comment authors). */
			tipEmails: from ? [from] : [],
			tipNames: from ? { [from]: fromName || displayNameFromEmail(from) } : {}
		};
	}
	if (pkg) {
		return {
			kind: pkg.chat.type_name,
			title: String(ref.title || pkg.chat.type_name),
			icon: pkg.chat.icon
		};
	}
	return { kind: String(ref.type), title: String(ref.type), icon: 'chat' };
}

function normEmail(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

/**
 * Resolve a reply_to parent for quote chrome.
 * Soft-deleted parents stay in the feed as tombstones; missing ids get a
 * deleted stub so ChatFeedCard can still show “Deleted Message”.
 * @param {string | null | undefined} replyToId
 */
export function findChatParent(replyToId) {
	if (!replyToId) return null;
	const id = String(replyToId);
	const found = chatFeed.find((m) => m.id === id);
	if (found) return found;
	return { id, deleted: true, body: '', author: '' };
}

/** Helpers for project boxes in chat tips. */
export function chatProjectBoxProps(project) {
	return {
		state: projectLifecycle(project, tasks),
		icon: projectDisplayIcon(project, enterprises)
	};
}
