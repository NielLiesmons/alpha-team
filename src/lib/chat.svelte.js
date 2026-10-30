/**
 * Family Chat — Drive-backed feed + comments (Chatmail notify later).
 */

import { goto } from '$app/navigation';
import { activePerson, displayNameFromEmail } from './actor.svelte.js';
import {
	createChatMessage,
	deleteChatMessage,
	listComments,
	listFeedMessages
} from './drive/entities.js';
import { activeSession } from './drive/session.svelte.js';
import { notifyChatRecipients } from './push.js';
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
	 * Until then the panel shows skeleton — never a false “No messages”.
	 */
	settled: false,
	/** Active channel id (list + detail). Default family channel. */
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

function commentKey(type, id) {
	return `${type}:${id}`;
}

const CHAT_CACHE_KEY = 'alpha.chat.feed.v1';

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
		localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(list.slice(0, 80)));
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

export async function refreshChatFeed() {
	const session = activeSession();
	if (!session) {
		/* Keep cache / in-memory — never wipe to an empty “No messages” flash. */
		if (chatFeed.length === 0) hydrateChatFeedFromCache();
		chatUi.loading = false;
		return;
	}
	if (chatFeed.length === 0) hydrateChatFeedFromCache();
	chatUi.loading = chatFeed.length === 0;
	chatUi.error = null;
	try {
		const list = await listFeedMessages(session, 80);
		chatFeed.length = 0;
		chatFeed.push(...list);
		writeChatCache(list);
	} catch (e) {
		chatUi.error = e instanceof Error ? e.message : String(e);
	} finally {
		chatUi.loading = false;
		/* First refresh finished — empty copy is OK only after this. */
		chatUi.settled = true;
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
			{ knownFeedIds: knownFeedIds().filter((id) => id !== localId) }
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
 * @param {{
 *   body: string,
 *   kind?: 'comment' | 'chat' | 'reaction' | 'event',
 *   ref?: { type: string, id: string } | null,
 *   reply_to?: string | null,
 *   reaction?: string,
 *   channel_id?: string
 * }} input
 */
export async function postChatMessage(input) {
	const session = activeSession();
	const author = activePerson().email;
	if (!author) throw new Error('Pick who you are in Settings first');
	const isReaction = input.kind === 'reaction';
	const isEvent = input.kind === 'event';
	if (!isReaction && !isEvent && !input.body?.trim()) throw new Error('Empty message');
	if (isEvent && !(input.ref?.type && input.ref?.id)) throw new Error('Event needs a ref');

	const body = isReaction || isEvent ? String(input.body || '').trim() : input.body.trim();
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
		...(input.ref ? { ref: input.ref } : {}),
		...(input.reaction ? { reaction: input.reaction } : {}),
		...(input.reply_to ? { reply_to: input.reply_to } : {}),
		_local: true,
		_pending: true
	};

	/* Paint immediately — never wait on Drive tip for the bubble. */
	chatFeed.unshift(optimistic);
	if (
		!isEvent &&
		input.ref &&
		(input.ref.type === 'task' || input.ref.type === 'note' || input.ref.type === 'project')
	) {
		const key = commentKey(/** @type {any} */ (input.ref.type), input.ref.id);
		const prev = commentsByKey[key] ?? [];
		commentsByKey[key] = [...prev, optimistic];
	}
	writeChatCache(chatFeed);

	if (!session) return optimistic;

	/* Drive write runs in background — bubble already at full opacity with ✓ pending. */
	void (async () => {
		chatUi.posting = true;
		try {
			const knownComments =
				!isEvent &&
				input.ref &&
				(input.ref.type === 'task' || input.ref.type === 'note' || input.ref.type === 'project')
					? (commentsByKey[commentKey(/** @type {any} */ (input.ref.type), input.ref.id)] ?? [])
							.map((m) => String(m.id))
							.filter((id) => id && !id.startsWith('local-'))
					: undefined;

			const created = await createChatMessage(
				session,
				{
					body,
					author,
					kind,
					ref: input.ref ?? null,
					reply_to: input.reply_to ?? null,
					...(input.reaction ? { reaction: input.reaction } : {})
				},
				{
					knownFeedIds: knownFeedIds().filter((id) => id !== localId),
					knownCommentIds: knownComments
				}
			);

			const settledMsg = {
				...created,
				channel_id: created.channel_id || channelId,
				delivery: created.delivery || 'sent'
			};
			const idx = chatFeed.findIndex((m) => m.id === localId);
			if (idx >= 0) chatFeed[idx] = settledMsg;
			else chatFeed.unshift(settledMsg);

			if (
				!isEvent &&
				input.ref &&
				(input.ref.type === 'task' || input.ref.type === 'note' || input.ref.type === 'project')
			) {
				const key = commentKey(/** @type {any} */ (input.ref.type), input.ref.id);
				const prev = commentsByKey[key] ?? [];
				commentsByKey[key] = prev.map((m) => (m.id === localId ? settledMsg : m));
			}
			writeChatCache(chatFeed);

			/* Wake other family devices (Home Screen PWA push). Never block the send UX. */
			if (!isReaction && kind !== 'reaction') {
				const pushBody =
					kind === 'event'
						? `${displayNameFromEmail(author)} ${chatEventLabel({ ref: input.ref })}`
						: body;
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
 * Desktop: select into the third column beside chat (no section navigate).
 * Mobile: navigate to the entity section, then select (after route settles).
 * @param {any} msg
 */
export function openChatRef(msg) {
	const ref = msg?.ref;
	if (!ref?.type || !ref?.id) return;

	/** @type {'task' | 'note' | 'project' | 'enterprise' | null} */
	let kind = null;
	/** @type {string | null} */
	let path = null;
	if (ref.type === 'task') {
		kind = 'task';
		path = '/tasks';
	} else if (ref.type === 'note') {
		kind = 'note';
		path = '/notes';
	} else if (ref.type === 'project') {
		kind = 'project';
		path = '/projects';
	} else if (ref.type === 'enterprise') {
		kind = 'enterprise';
		path = '/entreprises';
	}
	if (!kind || !path) return;

	const mobile =
		typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
	if (!mobile) {
		/* Stay on /chat — DetailColumn renders any ui.selection. */
		selectEntity(kind, ref.id);
		return;
	}
	void goto(path).then(() => selectEntity(kind, ref.id));
}

/** @param {any} msg */
export function chatRefLabel(msg) {
	const meta = chatRefMeta(msg);
	if (!meta) return null;
	return meta.kind ? `${meta.kind} · ${meta.title}` : meta.title;
}

/**
 * Stable key for publication comments in the family feed.
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
		ref.type !== 'enterprise'
	) {
		return null;
	}
	/* Events stay their own tip row — don't merge into a comment thread panel. */
	if (msg?.kind === 'event') return `event:${ref.type}:${ref.id}:${msg.id}`;
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
