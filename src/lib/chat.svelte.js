/**
 * Family Chat — Drive-backed feed + comments (Chatmail notify later).
 */

import { activePerson, displayNameFromEmail } from './actor.svelte.js';
import {
	createChatMessage,
	deleteChatMessage,
	listComments,
	listFeedMessages,
	markChatMessagesRead
} from './drive/entities.js';
import { activeSession } from './drive/session.svelte.js';
import { notifyChatRecipients } from './push.js';
import { findMail } from './mail.svelte.js';
import {
	enterprises,
	notes,
	projects,
	selectEntity,
	tasks
} from './workspace.svelte.js';
import { projectDisplayIcon, projectLifecycle } from './project-status.js';

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
	/** Active chat id (list + detail). Default General. */
	activeChannelId: 'general'
});

/** Built-in + future DM/agent channels (Drive-backed later). */
export const chatChannels = $state([
	{
		schema: 'alpha.chat_channel/1',
		id: 'general',
		kind: 'general',
		title: 'General',
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
		chatFeed.push(...cached);
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
			Boolean(m?._local || m?._pending) || String(id).startsWith('local-');
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
	chatUi.error = null;
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
			writeChatCache(merged.filter((m) => !String(m.id || '').startsWith('local-')));
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

/** Quick-react set — matches Alpha Chat defaults (subset). */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

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
	return 'shared something';
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
		...(input.ref ? { ref: input.ref } : {}),
		...(input.reaction ? { reaction: input.reaction } : {}),
		...(input.reply_to ? { reply_to: input.reply_to } : {}),
		...(Array.isArray(input.attachments) && input.attachments.length
			? { attachments: input.attachments }
			: {}),
		_local: true,
		_pending: true
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

	if (!session) return optimistic;

	/* Drive write in background — no ✓ until leaf+feed are on the server. */
	void (async () => {
		chatUi.posting = true;
		try {
			/** @type {any[]} */
			let attachments = Array.isArray(input.attachments) ? input.attachments : [];
			if (typeof input.resolveAttachments === 'function') {
				attachments = await input.resolveAttachments();
				const idxAtt = chatFeed.findIndex((m) => m.id === localId);
				if (idxAtt >= 0) {
					chatFeed[idxAtt] = {
						...chatFeed[idxAtt],
						attachments: attachments.map((a) => ({
							...a,
							previewUrl: a.previewUrl || chatFeed[idxAtt].attachments?.find(
								(/** @type {any} */ x) => x.name === a.name
							)?.previewUrl
						}))
					};
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

			/** Paint ✓ as soon as the message leaf ciphertext is on the server (before tip). */
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
					_local: false
				};
				feedFetchGen += 1;
				const idx = chatFeed.findIndex((m) => m.id === localId);
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
					const key = commentKey(/** @type {any} */ (input.ref.type), input.ref.id);
					const prev = commentsByKey[key] ?? [];
					commentsByKey[key] = prev.map((m) => (m.id === localId ? settledMsg : m));
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
					ref: input.ref ?? null,
					reply_to: input.reply_to ?? null,
					delivery: 'sent',
					...(input.reaction ? { reaction: input.reaction } : {}),
					...(attachments.length ? { attachments } : {})
				},
				{
					knownFeedIds: knownFeedIds().filter((id) => id !== localId),
					knownCommentIds: knownComments,
					onLeafStored: (leafMsg) => {
						settleFrom({
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

			/* Tip finished — refresh settle fields if leaf callback already ran. */
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
			const idx = chatFeed.findIndex((m) => m.id === localId);
			if (idx >= 0) chatFeed[idx] = { ...chatFeed[idx], _pending: false, _failed: true };
			chatUi.error = e instanceof Error ? e.message : String(e);
		} finally {
			chatUi.posting = false;
		}
	})();

	return optimistic;
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

	/** @type {'task' | 'note' | 'project' | 'enterprise' | 'mail' | null} */
	let kind = null;
	if (ref.type === 'task') kind = 'task';
	else if (ref.type === 'note') kind = 'note';
	else if (ref.type === 'project') kind = 'project';
	else if (ref.type === 'enterprise') kind = 'enterprise';
	else if (ref.type === 'mail') kind = 'mail';
	if (!kind) return;

	selectEntity(kind, ref.id);
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
		ref.type !== 'mail'
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
 *   enterprise?: any
 * } | null}
 */
export function chatRefMeta(msg) {
	const ref = msg?.ref;
	if (!ref?.type) return null;
	if (ref.type === 'task') {
		const t = tasks.find((x) => x.id === ref.id);
		return {
			kind: 'Task',
			title: t?.title || 'Task',
			icon: 'tasks',
			box: 'task',
			status: t?.status || 'open'
		};
	}
	if (ref.type === 'note') {
		const n = notes.find((x) => x.id === ref.id);
		return { kind: 'Note', title: n?.title || 'Untitled', icon: 'notes', box: 'note' };
	}
	if (ref.type === 'project') {
		const p = projects.find((x) => x.id === ref.id);
		return {
			kind: 'Project',
			title: p?.title || 'Project',
			icon: 'projects',
			box: 'project',
			project: p ?? null
		};
	}
	if (ref.type === 'enterprise') {
		const e = enterprises.find((x) => x.id === ref.id);
		return {
			kind: 'Enterprise',
			title: e?.title || 'Enterprise',
			icon: 'entreprises',
			box: 'enterprise',
			enterprise: e ?? null
		};
	}
	if (ref.type === 'mail') {
		const m = findMail(ref.id);
		return {
			kind: 'Mail',
			title: m?.subject || '(no subject)',
			icon: 'mail'
		};
	}
	return { kind: String(ref.type), title: String(ref.type), icon: 'chat' };
}

/**
 * @param {string | null | undefined} replyToId
 */
export function findChatParent(replyToId) {
	if (!replyToId) return null;
	return chatFeed.find((m) => m.id === replyToId) ?? null;
}

/** Helpers for project boxes in chat tips. */
export function chatProjectBoxProps(project) {
	return {
		state: projectLifecycle(project, tasks),
		icon: projectDisplayIcon(project, enterprises)
	};
}
