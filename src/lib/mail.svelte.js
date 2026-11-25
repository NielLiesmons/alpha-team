/**
 * Personal Mail — Stalwart JMAP when mailbox password is set; else Drive interim leaves.
 */

import { activePerson, actor } from './actor.svelte.js';
import {
	createMailMessage,
	listMailMessages,
	putMailMessage
} from './drive/entities.js';
import { activeSession } from './drive/session.svelte.js';
import {
	getMailboxPassword,
	groupMailThreads,
	listJmapFolder,
	mailPersonName,
	sendJmapMail,
	setJmapEmailsSeen
} from './jmap-mail.js';
import {
	approvedContacts,
	contactBucket,
	contactBucketsVersion
} from './mail-contacts.svelte.js';
import { mailView } from './mail-view.svelte.js';
import { displayNameFromEmail } from './actor.svelte.js';

/** Thread rows (or flat Drive messages). */
/** @type {any[]} */
export const mailMessages = $state([]);

export const mailUi = $state({
	loading: false,
	error: /** @type {string | null} */ (null),
	sending: false
});

/** localStorage list cache — paint folder threads before JMAP/Drive (chat feed pattern). */
const MAIL_LIST_CACHE_KEY = 'alpha.mail.list.v1';

/**
 * Slim rows for cache — drop heavy HTML / raw JMAP so quota stays healthy.
 * @param {any} msg
 */
function thinMailMessage(msg) {
	if (!msg || typeof msg !== 'object') return msg;
	const body = String(msg.body || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 400);
	return {
		schema: msg.schema || 'alpha.mail_message/1',
		id: msg.id,
		threadId: msg.threadId || msg.id,
		from: msg.from,
		from_name: msg.from_name,
		to: Array.isArray(msg.to) ? msg.to : [],
		to_people: Array.isArray(msg.to_people) ? msg.to_people : undefined,
		cc: Array.isArray(msg.cc) ? msg.cc : undefined,
		cc_people: Array.isArray(msg.cc_people) ? msg.cc_people : undefined,
		bcc: Array.isArray(msg.bcc) ? msg.bcc : undefined,
		subject: msg.subject,
		body,
		created_at: msg.created_at,
		transport: msg.transport,
		messageId: msg.messageId,
		read_by: Array.isArray(msg.read_by) ? msg.read_by : undefined,
		attachments: Array.isArray(msg.attachments)
			? msg.attachments.map((a) => ({
					name: a?.name || 'attachment',
					type: a?.type || '',
					size: Number(a?.size) || 0,
					blobId: a?.blobId || ''
				}))
			: undefined,
		hasAttachment: Boolean(msg.hasAttachment),
		_unread: Boolean(msg._unread),
		_flagged: Boolean(msg._flagged),
		...(msg._priority != null ? { _priority: msg._priority } : {}),
		...(msg._local ? { _local: true } : {}),
		...(msg._pending ? { _pending: true } : {}),
		...(msg._jmap?.keywords ? { _jmap: { keywords: { ...msg._jmap.keywords } } } : {})
	};
}

/**
 * @param {any} thread
 */
function thinMailThread(thread) {
	if (!thread || typeof thread !== 'object') return thread;
	const msgs = Array.isArray(thread.messages)
		? thread.messages.map(thinMailMessage)
		: undefined;
	const base = thinMailMessage(thread);
	return {
		...base,
		...(msgs ? { messages: msgs } : {}),
		...(thread._latestFrom ? { _latestFrom: thread._latestFrom } : {}),
		...(thread.participantEmails ? { participantEmails: thread.participantEmails } : {})
	};
}

/**
 * @param {string} email
 * @param {string} folder
 */
function mailListCacheSlot(email, folder) {
	return `${normEmail(email)}|${String(folder || 'inbox')}`;
}

/**
 * @param {string} email
 * @param {string} folder
 * @param {any[]} threads
 */
function writeMailListCache(email, folder, threads) {
	if (typeof localStorage === 'undefined') return;
	const me = normEmail(email) || 'drive';
	if (!Array.isArray(threads)) return;
	try {
		const raw = localStorage.getItem(MAIL_LIST_CACHE_KEY);
		const doc = raw ? JSON.parse(raw) : {};
		const next = doc && typeof doc === 'object' ? doc : {};
		next[mailListCacheSlot(me, folder)] = {
			at: Date.now(),
			threads: threads.slice(0, 80).map(thinMailThread)
		};
		localStorage.setItem(MAIL_LIST_CACHE_KEY, JSON.stringify(next));
	} catch {
		/* quota */
	}
}

/**
 * @param {string} [email]
 * @param {string} [folder]
 * @returns {any[] | null}
 */
function readMailListCache(email, folder) {
	if (typeof localStorage === 'undefined') return null;
	const me = normEmail(email || mailActorEmail()) || 'drive';
	const fold = String(folder || mailView.folder || 'inbox');
	try {
		const raw = localStorage.getItem(MAIL_LIST_CACHE_KEY);
		const doc = raw ? JSON.parse(raw) : null;
		const row = doc?.[mailListCacheSlot(me, fold)];
		return Array.isArray(row?.threads) ? row.threads : null;
	} catch {
		return null;
	}
}

/**
 * Paint cached folder threads immediately (hard refresh) — mirror hydrateChatFeedFromCache.
 * @param {string} [email]
 * @param {string} [folder]
 * @returns {boolean}
 */
export function hydrateMailFromCache(email, folder) {
	const cached = readMailListCache(email, folder);
	if (!Array.isArray(cached) || !cached.length) return false;
	if (mailMessages.length === 0) {
		mailMessages.push(...cached);
		mailUi.loading = false;
	}
	return true;
}

/**
 * Optimistic unread overrides survive refresh until JMAP/$seen catches up (or TTL).
 * @type {Map<string, { unread: boolean, until: number }>}
 */
const unreadOverrides = new Map();

const UNREAD_OVERRIDE_MS = 120_000;

function normEmail(value) {
	return (value || '').trim().toLowerCase();
}

/**
 * @param {string} id
 * @param {boolean} unread
 */
function rememberUnreadOverride(id, unread) {
	const key = String(id || '');
	if (!key) return;
	unreadOverrides.set(key, { unread, until: Date.now() + UNREAD_OVERRIDE_MS });
}

/**
 * @param {any} thread
 * @param {boolean} unread
 */
function applyThreadUnreadLocal(thread, unread) {
	if (!thread) return;
	thread._unread = unread;
	const msgs = Array.isArray(thread.messages) ? thread.messages : null;
	if (!msgs?.length) {
		if (thread._jmap?.keywords) {
			if (unread) delete thread._jmap.keywords.$seen;
			else thread._jmap.keywords.$seen = true;
		}
		return;
	}
	const me = mailActorEmail();
	if (!unread) {
		for (const m of msgs) {
			m._unread = false;
			if (m._jmap?.keywords) m._jmap.keywords.$seen = true;
		}
		return;
	}
	/* Mark latest inbound (or latest) unread so the thread shows as unread. */
	let target = [...msgs].reverse().find((m) => normEmail(m?.from) !== me) || msgs[msgs.length - 1];
	for (const m of msgs) m._unread = false;
	if (target) {
		target._unread = true;
		if (target._jmap?.keywords) delete target._jmap.keywords.$seen;
	}
}

/**
 * JMAP Email ids to patch for seen/unseen.
 * @param {any} thread
 * @param {boolean} seen
 * @param {string[]} [preferIds] snapshot taken before local mutation
 */
function jmapIdsForSeen(thread, seen, preferIds) {
	if (preferIds?.length) return preferIds;
	const msgs = Array.isArray(thread?.messages) ? thread.messages : thread ? [thread] : [];
	const me = mailActorEmail();
	if (seen) {
		/* Mark whole thread read — every real Email id in the conversation. */
		return msgs.map((m) => String(m.id || '')).filter(Boolean);
	}
	const inbound = [...msgs].reverse().find((m) => normEmail(m?.from) !== me) || msgs[msgs.length - 1];
	const id = String(inbound?.id || '');
	return id ? [id] : [];
}

/**
 * @param {any} thread
 * @param {boolean} seen
 * @param {string[]} [ids]
 */
async function persistJmapSeen(thread, seen, ids) {
	const me = mailActorEmail();
	const pw = me ? getMailboxPassword(me) : '';
	if (!me || !pw) return;
	if (!(thread?.transport === 'jmap' || Array.isArray(thread?.messages))) return;
	const emailIds = jmapIdsForSeen(thread, seen, ids);
	if (!emailIds.length) return;
	await setJmapEmailsSeen(me, pw, emailIds, seen);
}

/**
 * Re-apply optimistic unread after a list replace from the server.
 */
function reapplyUnreadOverrides() {
	const now = Date.now();
	for (const [id, ov] of [...unreadOverrides.entries()]) {
		if (now >= ov.until) {
			unreadOverrides.delete(id);
			continue;
		}
		const thread = findMail(id);
		if (!thread) continue;
		if (Boolean(thread._unread) !== ov.unread) applyThreadUnreadLocal(thread, ov.unread);
	}
}

/** Signed-in mailbox used to filter inbox / sent. */
export function mailActorEmail() {
	return normEmail(actor.email);
}

/**
 * @param {any} msg
 * @param {string} email
 */
export function isInboxFor(msg, email) {
	const me = normEmail(email);
	if (!me || !msg) return false;
	const to = Array.isArray(msg.to) ? msg.to.map(normEmail) : [];
	return to.includes(me);
}

/**
 * @param {any} msg
 * @param {string} email
 */
export function isSentFor(msg, email) {
	const me = normEmail(email);
	if (!me || !msg) return false;
	return normEmail(msg.from) === me || normEmail(msg._latestFrom) === me;
}

/**
 * @param {any} msg
 * @param {string} [email]
 */
export function isUnreadFor(msg, email = mailActorEmail()) {
	const me = normEmail(email);
	if (!me || !msg) return false;
	if (msg.transport === 'jmap' || Array.isArray(msg.messages)) {
		return Boolean(msg._unread);
	}
	if (!isInboxFor(msg, me)) return false;
	if (normEmail(msg.from) === me) return false;
	const read = Array.isArray(msg.read_by) ? msg.read_by.map(normEmail) : [];
	return !read.includes(me);
}

/**
 * Strip Re:/Fwd: for Drive-side threading fallback.
 * @param {string} subject
 */
function threadSubjectKey(subject) {
	return String(subject || '')
		.replace(/^\s*((re|fw|fwd|aw|sv|antw)\s*:\s*)+/gi, '')
		.trim()
		.toLowerCase();
}

/**
 * Current folder threads (JMAP already filtered; Drive filtered here).
 */
export function mailThreadsForCurrentFolder() {
	const folder = mailView.folder;
	const me = mailActorEmail();
	const list = [...mailMessages];

	if (list.some((m) => m.transport === 'jmap' || Array.isArray(m.messages))) {
		return list;
	}

	/* Drive interim — filter then thread by subject */
	const filtered = list.filter((m) => {
		if (folder === 'mailbox' || folder === 'inbox') {
			return isInboxFor(m, me) || isSentFor(m, me);
		}
		if (folder === 'sent') return isSentFor(m, me);
		return false;
	});
	const asMsgs = filtered.map((m) => ({
		...m,
		threadId: m.threadId || `subj:${threadSubjectKey(m.subject)}`
	}));
	return groupMailThreads(asMsgs, me);
}

/** Automated / bulk From local-parts. */
const AUTO_FROM =
	/^(no[-_.]?reply|noreply|donotreply|do[-_.]?not[-_.]?reply|notifications?|mailer[-_.]?daemon|bounce|newsletter|news|digest|updates?|marketing|promo)([+._-]|$)/i;

/**
 * Newsletter / blog / digest heuristic → Updates category.
 * @param {any} thread
 */
export function isUpdatesMail(thread) {
	if (!thread) return false;
	const from = normEmail(thread.from || thread._latestFrom);
	const local = from.split('@')[0] || '';
	if (/newsletter|digest|news@|weekly|daily|blog|substack|medium/i.test(from)) return true;
	if (/^(newsletter|news|digest|updates?|marketing|promo|blog)/i.test(local)) return true;
	const blob = `${thread.subject || ''} ${thread.body || ''}`.toLowerCase();
	if (
		blob.includes('unsubscribe') ||
		blob.includes('view in browser') ||
		blob.includes('read on the web')
	) {
		return true;
	}
	const msgs = Array.isArray(thread.messages) ? thread.messages : [];
	for (const m of msgs) {
		const b = `${m.subject || ''} ${m.body || ''}`.toLowerCase();
		if (b.includes('unsubscribe')) return true;
		const headers = m._jmap?.headers || m._jmap?.header || null;
		if (headers && (headers['list-id'] || headers['List-Id'] || headers['list-unsubscribe'])) {
			return true;
		}
	}
	return false;
}

/** @deprecated use isUpdatesMail */
export const isNewsMail = isUpdatesMail;

/**
 * Transactional / automated (not a person, not Updates).
 * @param {any} thread
 */
export function isOtherMail(thread) {
	if (!thread || isUpdatesMail(thread)) return false;
	const from = normEmail(thread.from || thread._latestFrom);
	const local = from.split('@')[0] || '';
	return AUTO_FROM.test(local);
}

/**
 * External From addresses across a thread (excludes me).
 * Used so follow-ups from a new multi-recipient sender stay with an
 * already-accepted conversation instead of bouncing back to Requests.
 * @param {any} thread
 * @returns {string[]}
 */
function threadAuthorEmails(thread) {
	const me = mailActorEmail();
	/** @type {Set<string>} */
	const out = new Set();
	/** @param {unknown} raw */
	const add = (raw) => {
		const e = normEmail(raw);
		if (e && e !== me) out.add(e);
	};
	add(thread?.from);
	add(thread?._latestFrom);
	for (const m of threadMessages(thread)) add(m?.from);
	return [...out];
}

/**
 * Triage category for a thread.
 * Explicit contact buckets win. Uncategorized people stay in Requests (`new`);
 * newsletter heuristics only suggest the Accept CTA (see isUpdatesMail).
 * Transactional senders still auto-file to Other.
 *
 * Multi-recipient follow-ups: if *any* prior author on the thread is already
 * bucketed (Accept / News / Other), inherit that bucket — do not re-file the
 * conversation into Requests when a different participant replies.
 * @param {any} thread
 * @returns {import('./mail-view.svelte.js').MailCategory}
 */
export function mailCategoryFor(thread) {
	const focus = normEmail(thread?.from || thread?._latestFrom);
	const focusBucket = focus ? contactBucket(focus) : null;
	if (focusBucket === 'primary' || focusBucket === 'updates' || focusBucket === 'other') {
		return focusBucket;
	}

	/** @type {import('./mail-view.svelte.js').MailCategory | null} */
	let inherited = null;
	for (const email of threadAuthorEmails(thread)) {
		const bucket = contactBucket(email);
		if (bucket === 'primary') return 'primary';
		if (bucket === 'updates' || bucket === 'other') {
			if (!inherited || (bucket === 'updates' && inherited === 'other')) inherited = bucket;
		}
	}
	if (inherited) return inherited;

	if (isOtherMail(thread)) return 'other';
	return 'new';
}

/**
 * Unread count per triage category in the current folder.
 * @param {import('./mail-view.svelte.js').MailCategory} cat
 */
export function mailUnreadCountForCategory(cat) {
	mailView.category;
	approvedContacts().size;
	contactBucketsVersion();
	return mailThreadsForCurrentFolder().filter(
		(t) => mailCategoryFor(t) === cat && isUnreadFor(t)
	).length;
}

/**
 * Folder threads filtered by active triage category.
 */
export function mailThreadsForCurrentView() {
	mailView.category;
	approvedContacts().size; /* subscribe to approved + members */
	contactBucketsVersion();
	const all = mailThreadsForCurrentFolder();
	const cat = mailView.category;
	return all.filter((t) => mailCategoryFor(t) === cat);
}

/**
 * Collapse duplicate cards (same JMAP id / Message-ID / near-identical outbound).
 * @param {any[]} msgs
 */
function dedupeMailMessages(msgs) {
	/** @type {any[]} */
	const out = [];
	/** @type {Set<string>} */
	const seenId = new Set();
	/** @type {Set<string>} */
	const seenMid = new Set();
	/** @type {Map<string, number>} */
	const seenFp = new Map();

	const sorted = [...msgs].sort((a, b) => {
		/* Prefer real server rows over pending overlays. */
		const ap = a?._pending || String(a?.id || '').startsWith('pending:') ? 1 : 0;
		const bp = b?._pending || String(b?.id || '').startsWith('pending:') ? 1 : 0;
		if (ap !== bp) return ap - bp;
		return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
	});

	for (const m of sorted) {
		if (!m) continue;
		const id = String(m.id || '');
		const mid = String(m.messageId || m._jmap?.messageId || '')
			.trim()
			.toLowerCase();
		const fp = [
			normEmail(m.from),
			String(m.subject || '')
				.trim()
				.toLowerCase(),
			String(m.body || '')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 280)
		].join('|');
		const t = Date.parse(String(m.created_at || '')) || 0;

		if (id && seenId.has(id)) continue;
		if (mid && seenMid.has(mid)) continue;
		const prevT = seenFp.get(fp);
		if (prevT != null && Math.abs(prevT - t) < 120_000) continue;

		if (id) seenId.add(id);
		if (mid) seenMid.add(mid);
		if (fp.length > 8) seenFp.set(fp, t || Date.now());
		out.push(m);
	}

	out.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
	return out;
}

/**
 * Messages in a thread, oldest → newest.
 * @param {any} thread
 */
export function threadMessages(thread) {
	if (!thread) return [];
	if (Array.isArray(thread.messages) && thread.messages.length) {
		return dedupeMailMessages(thread.messages);
	}
	return [thread];
}

/**
 * Last message in the thread (for feed preview).
 * @param {any} thread
 */
export function mailLatestMessage(thread) {
	const msgs = threadMessages(thread);
	return msgs[msgs.length - 1] || thread;
}

/**
 * First human party on the thread (card avatar / name).
 * @param {any} thread
 */
export function mailThreadContact(thread) {
	return {
		email: normEmail(thread?.from),
		name: mailAuthorLabel(thread)
	};
}

/**
 * Tip/cache snapshot so Chat can show Mail · subject without the Mail list loaded.
 * Also holds mail-only urgency (`priority`) until the thread is promoted to a task.
 * @type {Record<string, { subject: string, from: string, from_name: string, priority?: string }>}
 */
export const mailTipCache = $state({});

const MAIL_PRIORITIES = new Set(['none', 'low', 'medium', 'high', 'urgent']);

/**
 * @param {unknown} raw
 * @returns {'none' | 'low' | 'medium' | 'high' | 'urgent' | ''}
 */
function normalizeMailPriority(raw) {
	const p = String(raw || '').trim();
	return MAIL_PRIORITIES.has(p) ? /** @type {'none' | 'low' | 'medium' | 'high' | 'urgent'} */ (p) : '';
}

function persistMailTipCache() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem('alpha.mail.tips.v1', JSON.stringify(mailTipCache));
	} catch {
		/* ignore */
	}
}

/**
 * @param {any} thread
 */
export function rememberMailTip(thread) {
	if (!thread?.id) return;
	const id = String(thread.id);
	const subject = String(thread.subject || '').trim() || '(no subject)';
	const from = normEmail(thread.from);
	const from_name = String(thread.from_name || mailAuthorLabel(thread) || '').trim();
	const prev = mailTipCache[id];
	const fromThread =
		thread && Object.prototype.hasOwnProperty.call(thread, '_priority')
			? normalizeMailPriority(thread._priority) || 'none'
			: normalizeMailPriority(thread?.priority);
	const priority =
		fromThread ||
		(prev && Object.prototype.hasOwnProperty.call(prev, 'priority')
			? normalizeMailPriority(prev.priority) || 'none'
			: '');
	/* Skip no-op writes — chat feed derived tracks mailTipCache; rewriting loops forever. */
	if (
		prev &&
		prev.subject === subject &&
		prev.from === from &&
		prev.from_name === from_name &&
		(prev.priority || '') === (priority || '')
	) {
		return;
	}
	mailTipCache[id] = priority
		? { subject, from, from_name, priority }
		: { subject, from, from_name };
	/* Keep live row in sync with tip-cached urgency across JMAP refreshes. */
	if (priority && thread && thread._priority !== priority) thread._priority = priority;
	persistMailTipCache();
}

/**
 * Mail-only urgency (not a task). Reads live `_priority`, then tip cache, then flagged→urgent.
 * Explicit tip/`_priority` (including `none`) wins over mailbox flagged.
 * @param {string | null | undefined} threadId
 * @param {{ _priority?: string, priority?: string, _flagged?: boolean, flagged?: boolean } | null} [thread]
 */
export function mailPriorityFor(threadId, thread = null) {
	const id = String(threadId || thread?.id || '').trim();
	const live = id ? findMail(id) : null;
	if (live && Object.prototype.hasOwnProperty.call(live, '_priority')) {
		return normalizeMailPriority(live._priority) || 'none';
	}
	if (thread && Object.prototype.hasOwnProperty.call(thread, '_priority')) {
		return normalizeMailPriority(thread._priority) || 'none';
	}
	const tip = id ? mailTipCache[id] : null;
	if (tip && Object.prototype.hasOwnProperty.call(tip, 'priority')) {
		return normalizeMailPriority(tip.priority) || 'none';
	}
	const fromArg = normalizeMailPriority(thread?.priority);
	if (fromArg) return fromArg;
	if (live?._flagged || thread?._flagged || thread?.flagged) return 'urgent';
	return 'none';
}

/**
 * Persist urgency on a non-task mail thread (tip cache + live row `_priority`).
 * Does not create or patch a task.
 * @param {string} threadId
 * @param {string} priority
 */
export function setMailPriority(threadId, priority) {
	const id = String(threadId || '').trim();
	const next = normalizeMailPriority(priority) || 'none';
	if (!id) return;
	const live = findMail(id);
	if (live) live._priority = next;
	const prev = mailTipCache[id];
	const subject = String(live?.subject || prev?.subject || '').trim() || '(no subject)';
	const from = normEmail(live?.from || prev?.from);
	const from_name = String(
		live?.from_name || prev?.from_name || (live ? mailAuthorLabel(live) : '') || ''
	).trim();
	/* Always store priority (incl. none) so explicit clears survive refresh vs flagged. */
	mailTipCache[id] = { subject, from, from_name, priority: next };
	persistMailTipCache();
}

export function hydrateMailTipCache() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem('alpha.mail.tips.v1');
		const doc = raw ? JSON.parse(raw) : null;
		if (!doc || typeof doc !== 'object') return;
		for (const [id, row] of Object.entries(doc)) {
			if (!id || !row || typeof row !== 'object') continue;
			const hasPriority = Object.prototype.hasOwnProperty.call(row, 'priority');
			const priority = hasPriority
				? normalizeMailPriority(/** @type {any} */ (row).priority) || 'none'
				: '';
			mailTipCache[id] = priority
				? {
						subject: String(row.subject || '(no subject)'),
						from: normEmail(row.from),
						from_name: String(row.from_name || '').trim(),
						priority
					}
				: {
						subject: String(row.subject || '(no subject)'),
						from: normEmail(row.from),
						from_name: String(row.from_name || '').trim()
					};
		}
	} catch {
		/* ignore */
	}
}

/**
 * @param {string} id thread id or message id
 */
export function findMail(id) {
	const hit = mailMessages.find((m) => m.id === id || m.threadId === id);
	if (hit) return hit;
	for (const t of mailMessages) {
		if (Array.isArray(t.messages)) {
			const m = t.messages.find((x) => x.id === id);
			if (m) return { ...t, ...m, messages: t.messages, id: t.id };
		}
	}
	return null;
}

/** @type {Record<string, any>} */
const mailTipStubs = {};

/**
 * Live thread, or a tip-cache stub so Chat mail tips open after hard refresh
 * before JMAP/Drive list finishes loading.
 * @param {string} id
 */
export function findMailOrTip(id) {
	const key = String(id || '');
	if (!key) return null;
	const live = findMail(key);
	if (live) {
		delete mailTipStubs[key];
		return live;
	}
	const tip = mailTipCache[key];
	const subject = String(tip?.subject || '(no subject)');
	const from = String(tip?.from || '');
	const from_name = String(tip?.from_name || '');
	const prev = mailTipStubs[key];
	if (
		prev &&
		prev.subject === subject &&
		prev.from === from &&
		prev.from_name === from_name
	) {
		return prev;
	}
	const stub = {
		id: key,
		subject,
		from,
		from_name,
		body: '',
		created_at: '',
		_stub: true
	};
	mailTipStubs[key] = stub;
	return stub;
}

/**
 * Resolve subject/from for chat tips (live list → tip cache → null).
 * Read-only — never write tip cache from derived/render paths.
 * @param {string} id
 */
export function mailTipFor(id) {
	const key = String(id || '');
	if (!key) return null;
	const live = findMail(key);
	if (live) {
		return {
			subject: String(live.subject || '').trim() || '(no subject)',
			from: normEmail(live.from),
			from_name: String(live.from_name || mailAuthorLabel(live) || '').trim()
		};
	}
	return mailTipCache[key] || null;
}

/** @type {Set<string>} */
const stubMailRefreshAttempted = new Set();

/**
 * One-shot background refresh when opening a tip stub (avoids refresh↔stub loops).
 * @param {string} id
 */
export function refreshMailForStubOnce(id) {
	const key = String(id || '');
	if (!key || stubMailRefreshAttempted.has(key)) return;
	stubMailRefreshAttempted.add(key);
	void refreshMail().catch(() => {});
}

/**
 * Only in-flight sends survive refresh — never re-paint completed duplicates.
 * @returns {{ threadId: string, msgs: any[] }[]}
 */
function snapshotOptimisticMail() {
	/** @type {{ threadId: string, msgs: any[] }[]} */
	const out = [];
	for (const t of mailMessages) {
		const tid = String(t.threadId || t.id || '');
		const msgs = (Array.isArray(t.messages) ? t.messages : threadMessages(t)).filter(
			(m) => m?._pending === true || String(m?.id || '').startsWith('pending:')
		);
		if (msgs.length) out.push({ threadId: tid, msgs });
	}
	return out;
}

/**
 * @param {{ threadId: string, msgs: any[] }[]} snaps
 */
function reapplyOptimisticMail(snaps) {
	for (const snap of snaps) {
		for (const msg of snap.msgs) {
			if (!msg?._pending && !String(msg?.id || '').startsWith('pending:')) continue;
			const serverHas = mailMessages.some((t) => {
				const msgs = Array.isArray(t.messages) ? t.messages : threadMessages(t);
				return msgs.some((m) => mailMsgSame(m, msg));
			});
			if (serverHas) continue;
			upsertMailMessage({
				...msg,
				_pending: true,
				threadId: snap.threadId || msg.threadId
			});
		}
	}
}

/**
 * @param {any} a
 * @param {any} b
 */
function mailMsgSame(a, b) {
	if (!a || !b) return false;
	if (String(a.id) === String(b.id)) return true;
	if (b._serverId && String(a.id) === String(b._serverId)) return true;
	const am = String(a.messageId || '').trim().toLowerCase();
	const bm = String(b.messageId || '').trim().toLowerCase();
	if (am && bm && am === bm) return true;
	return false;
}

/** @type {Promise<void> | null} */
let refreshMailInflight = null;
let refreshMailQueued = false;
/** Last folder painted into mailMessages — swap cache on folder change. */
let paintedMailFolder = '';

export async function refreshMail() {
	/* Never clobber an in-flight send — that caused cards to flicker / duplicate. */
	if (mailUi.sending) {
		refreshMailQueued = true;
		return;
	}
	if (refreshMailInflight) {
		refreshMailQueued = true;
		return refreshMailInflight;
	}

	refreshMailInflight = (async () => {
		const me = mailActorEmail();
		const pw = me ? getMailboxPassword(me) : '';
		const folder = mailView.folder;
		/* Folder switch or cold start — paint that folder’s cache before network. */
		if (folder !== paintedMailFolder || mailMessages.length === 0) {
			const cached = readMailListCache(me, folder);
			if (Array.isArray(cached) && cached.length) {
				mailMessages.splice(0, mailMessages.length, ...cached);
				mailUi.loading = false;
			} else if (folder !== paintedMailFolder) {
				mailMessages.splice(0, mailMessages.length);
			}
			paintedMailFolder = folder;
		}
		const hadLocal = mailMessages.length > 0;
		const pendingSnap = snapshotOptimisticMail();
		const keepError = mailUi.error;
		const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
		if (offline && hadLocal) {
			mailUi.loading = false;
			return;
		}
		mailUi.loading = mailMessages.length === 0;
		if (!keepError) mailUi.error = null;
		try {
			if (me && pw) {
				/** @type {any[]} */
				let list;
				if (folder === 'mailbox') {
					const [inbox, sent] = await Promise.all([
						listJmapFolder(me, pw, 'inbox', 80),
						listJmapFolder(me, pw, 'sent', 80)
					]);
					/** @type {Map<string, any>} */
					const byThread = new Map();
					for (const t of [...inbox, ...sent]) {
						const key = String(t?.threadId || t?.id || '');
						if (!key) continue;
						const prev = byThread.get(key);
						if (!prev) {
							byThread.set(key, t);
							continue;
						}
						const prevN = Array.isArray(prev.messages) ? prev.messages.length : 1;
						const nextN = Array.isArray(t.messages) ? t.messages.length : 1;
						if (
							nextN > prevN ||
							String(t.created_at || '') > String(prev.created_at || '')
						) {
							byThread.set(key, t);
						}
					}
					list = [...byThread.values()].sort((a, b) =>
						String(b.created_at || '').localeCompare(String(a.created_at || ''))
					);
				} else {
					list = await listJmapFolder(me, pw, folder, 80);
				}
				if (mailUi.sending) {
					refreshMailQueued = true;
					return;
				}
				/* Never wipe a warm cache with an empty miss. */
				if (!list.length && mailMessages.length) {
					return;
				}
				mailMessages.length = 0;
				mailMessages.push(...list);
				for (const m of list) rememberMailTip(m);
				reapplyOptimisticMail(pendingSnap);
				reapplyUnreadOverrides();
				writeMailListCache(me, folder, mailMessages);
				return;
			}

			const session = activeSession();
			if (!session) {
				if (!hadLocal) {
					const locals = mailMessages.filter((m) => m._local);
					mailMessages.splice(0, mailMessages.length, ...locals);
					for (const m of locals) rememberMailTip(m);
				}
				reapplyOptimisticMail(pendingSnap);
				reapplyUnreadOverrides();
				if (me && !pw) {
					mailUi.error =
						'Add your mailbox password in Settings → Mail (Stalwart) to load the real inbox.';
				}
				return;
			}
			const list = await listMailMessages(session, 200);
			if (mailUi.sending) {
				refreshMailQueued = true;
				return;
			}
			if (!list.length && mailMessages.length) {
				return;
			}
			mailMessages.length = 0;
			mailMessages.push(...list);
			for (const m of list) rememberMailTip(m);
			reapplyOptimisticMail(pendingSnap);
			reapplyUnreadOverrides();
			writeMailListCache(me, folder, mailMessages);
			if (me && !pw) {
				mailUi.error =
					'Showing Drive drafts only — add mailbox password in Settings to sync Stalwart.';
			}
		} catch (e) {
			if (!hadLocal) {
				mailUi.error = e instanceof Error ? e.message : String(e);
			}
		} finally {
			mailUi.loading = false;
		}
	})();

	try {
		await refreshMailInflight;
	} finally {
		refreshMailInflight = null;
		if (refreshMailQueued && !mailUi.sending) {
			refreshMailQueued = false;
			void refreshMail();
		} else if (!mailUi.sending) {
			refreshMailQueued = false;
		}
	}
}

/**
 * Insert / merge a message into the in-memory thread list (optimistic or server).
 * @param {any} msg
 * @param {string} [replaceId] pending id to swap out
 */
function upsertMailMessage(msg, replaceId = '') {
	if (!msg?.id) return;
	const threadKey = String(msg.threadId || msg.id);
	const pendingKey = String(replaceId || '');

	/* Prefer merging into an existing thread row. */
	const threadIdx = mailMessages.findIndex((t) => {
		const tid = String(t.threadId || t.id);
		if (tid === threadKey) return true;
		if (pendingKey && String(t.id) === pendingKey) return true;
		const msgs = Array.isArray(t.messages) ? t.messages : [];
		return msgs.some(
			(m) =>
				String(m.id) === pendingKey ||
				String(m.id) === String(msg.id) ||
				mailMsgSame(m, msg)
		);
	});

	if (threadIdx >= 0) {
		const thread = mailMessages[threadIdx];
		const stableThreadId = String(thread.threadId || thread.id || threadKey);
		const msgs = Array.isArray(thread.messages) ? [...thread.messages] : threadMessages(thread);
		const without = msgs.filter(
			(m) =>
				String(m.id) !== pendingKey &&
				String(m.id) !== String(msg.id) &&
				!mailMsgSame(m, msg)
		);
		without.push({ ...msg, threadId: stableThreadId });
		const deduped = dedupeMailMessages(without);
		const latest = deduped[deduped.length - 1] || msg;
		const nextId =
			String(thread.id).startsWith('pending:') && !String(stableThreadId).startsWith('pending:')
				? stableThreadId
				: thread.id;
		mailMessages[threadIdx] = {
			...thread,
			subject: latest.subject ?? thread.subject,
			body: latest.body ?? thread.body,
			from: thread.from,
			from_name: thread.from_name,
			created_at: latest.created_at || thread.created_at,
			id: nextId,
			threadId: stableThreadId,
			messages: deduped,
			_pending: deduped.some((m) => m._pending),
			_sendError: deduped.find((m) => m._sendError)?._sendError || undefined
		};
		rememberMailTip(mailMessages[threadIdx]);
		if (pendingKey && typeof window !== 'undefined') {
			import('./workspace.svelte.js').then(({ ui }) => {
				if (ui.selection?.kind === 'mail' && String(ui.selection.id) === pendingKey) {
					ui.selection = { kind: 'mail', id: String(nextId) };
				}
			});
		}
		return mailMessages[threadIdx];
	}

	const row = {
		...msg,
		threadId: threadKey,
		messages: [msg]
	};
	mailMessages.unshift(row);
	rememberMailTip(row);
	return row;
}

/** In-flight + recent send fingerprints — hard stop on double submit. */
/** @type {Set<string>} */
const sendInflight = new Set();
/** @type {Map<string, number>} */
const recentSendFp = new Map();
const SEND_DEDUP_MS = 20_000;

/**
 * @param {{ to: string[], cc?: string[], bcc?: string[], subject: string, body: string, threadId?: string }} input
 */
function sendFingerprint(input) {
	return [
		(input.to || []).map(normEmail).filter(Boolean).sort().join(','),
		(input.cc || []).map(normEmail).filter(Boolean).sort().join(','),
		(input.bcc || []).map(normEmail).filter(Boolean).sort().join(','),
		String(input.subject || '')
			.trim()
			.toLowerCase(),
		String(input.body || '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 400),
		String(input.threadId || '')
	].join('\n');
}

/**
 * Optimistic send: paint immediately, deliver via JMAP (or Drive fallback) in background.
 * Guaranteed single network submission per fingerprint.
 * @param {{
 *   to: string[],
 *   cc?: string[],
 *   bcc?: string[],
 *   subject: string,
 *   body: string,
 *   threadId?: string,
 *   inReplyTo?: string,
 *   references?: string,
 *   scheduleAt?: string | null
 * }} input
 */
export function sendMail(input) {
	const from = activePerson().email;
	if (!from) throw new Error('Pick who you are in Settings first');
	const to = [...new Set((input.to || []).map(normEmail).filter(Boolean))];
	if (!to.length) throw new Error('Add at least one recipient');
	const toSet = new Set(to);
	const cc = [
		...new Set((input.cc || []).map(normEmail).filter((e) => e && !toSet.has(e)))
	];
	const ccSet = new Set(cc);
	const bcc = [
		...new Set(
			(input.bcc || []).map(normEmail).filter((e) => e && !toSet.has(e) && !ccSet.has(e))
		)
	];
	const subject = (input.subject || '').trim();
	const body = (input.body || '').trim();
	if (!subject && !body) throw new Error('Write a subject or body');

	const fp = sendFingerprint({ to, cc, bcc, subject, body, threadId: input.threadId });
	const recentAt = recentSendFp.get(fp) || 0;
	if (sendInflight.has(fp) || Date.now() - recentAt < SEND_DEDUP_MS) {
		/* Same send already in flight / just completed — do not submit again. */
		const existing =
			mailMessages.find((t) => String(t.threadId || t.id) === String(input.threadId || '')) ||
			mailMessages[0];
		if (!existing) throw new Error('Send already in progress');
		return existing;
	}
	sendInflight.add(fp);
	recentSendFp.set(fp, Date.now());

	const pendingId = `pending:${crypto.randomUUID()}`;
	const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
	const scheduleAt = input.scheduleAt ? String(input.scheduleAt) : '';
	const scheduleMs = scheduleAt ? Date.parse(scheduleAt) : NaN;
	const scheduled = Number.isFinite(scheduleMs) && scheduleMs > Date.now() + 5_000;
	const threadId = String(input.threadId || pendingId);
	const fromName = activePerson().name || '';
	const fromDomain = normEmail(from).includes('@')
		? normEmail(from).slice(normEmail(from).indexOf('@') + 1)
		: 'localhost';
	const messageId = `<alpha.${crypto.randomUUID().replace(/-/g, '')}@${fromDomain}>`;

	const optimistic = {
		schema: 'alpha.mail_message/1',
		id: pendingId,
		threadId,
		from: normEmail(from),
		from_name: fromName,
		to,
		cc,
		bcc,
		subject: subject || '(no subject)',
		body,
		created_at: scheduled ? new Date(scheduleMs).toISOString() : now,
		transport: 'jmap',
		messageId,
		read_by: [normEmail(from)],
		_pending: true,
		_sendFp: fp,
		_scheduled: scheduled,
		_scheduledAt: scheduled ? new Date(scheduleMs).toISOString() : undefined,
		_unread: false
	};

	const row = upsertMailMessage(optimistic);
	mailUi.sending = true;
	mailUi.error = null;

	void (async () => {
		try {
			const me = mailActorEmail();
			const pw = me ? getMailboxPassword(me) : '';
			let created;
			if (me && pw) {
				created = await sendJmapMail(me, pw, {
					to,
					cc,
					bcc,
					subject: subject || '(no subject)',
					body,
					fromName,
					inReplyTo: input.inReplyTo || '',
					references: input.references || input.inReplyTo || '',
					messageId,
					/* Let Stalwart assign the real thread id; we only force UI merge key. */
					threadId: undefined,
					scheduleAt: scheduled ? new Date(scheduleMs).toISOString() : null
				});
			} else {
				const session = activeSession();
				if (!session) {
					created = {
						...optimistic,
						id: crypto.randomUUID(),
						_pending: false,
						_local: true,
						transport: 'drive'
					};
				} else {
					created = await createMailMessage(session, {
						from,
						to,
						cc,
						bcc,
						subject: subject || '(no subject)',
						body
					});
					created = { ...created, threadId: created.threadId || threadId, messageId };
				}
			}
			upsertMailMessage(
				{
					...created,
					threadId,
					messageId: created.messageId || messageId,
					_pending: false,
					_serverId: created.id,
					_sendFp: fp,
					_scheduled: Boolean(created._scheduled || scheduled),
					_scheduledAt: created._scheduledAt || optimistic._scheduledAt
				},
				pendingId
			);
			mailUi.error = null;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			mailUi.error = msg;
			/* Allow a conscious retry after failure. */
			recentSendFp.delete(fp);
			upsertMailMessage({ ...optimistic, _pending: false, _sendError: msg }, pendingId);
		} finally {
			sendInflight.delete(fp);
			mailUi.sending = false;
			if (refreshMailQueued) {
				refreshMailQueued = false;
				void refreshMail();
			}
		}
	})();

	return row;
}

/**
 * @param {string} id
 */
export async function markMailRead(id) {
	const me = mailActorEmail();
	const thread = findMail(id);
	if (!me || !thread) return thread;

	const ov = unreadOverrides.get(String(id));
	/* Don't clobber a fresh mark-unread while the thread is still open / refreshing. */
	if (ov?.unread && Date.now() < ov.until) return thread;

	if (thread.transport === 'jmap' || Array.isArray(thread.messages)) {
		const msgs = Array.isArray(thread.messages) ? thread.messages : [thread];
		const ids = msgs.map((m) => String(m.id || '')).filter(Boolean);
		if (!thread._unread && !msgsStillUnread(thread)) {
			rememberUnreadOverride(id, false);
			/* Still push $seen in case local was optimistic-only. */
			try {
				await persistJmapSeen(thread, true, ids);
			} catch (e) {
				mailUi.error = e instanceof Error ? e.message : String(e);
			}
			return thread;
		}
		applyThreadUnreadLocal(thread, false);
		rememberUnreadOverride(id, false);
		try {
			await persistJmapSeen(thread, true, ids);
		} catch (e) {
			mailUi.error = e instanceof Error ? e.message : String(e);
		}
		return thread;
	}

	if (!isInboxFor(thread, me)) return thread;
	const read = Array.isArray(thread.read_by) ? thread.read_by.map(normEmail) : [];
	if (read.includes(me)) return thread;

	const next = { ...thread, read_by: [...read, me], _unread: false };
	const idx = mailMessages.findIndex((m) => m.id === id);
	if (idx >= 0) mailMessages[idx] = next;
	rememberUnreadOverride(id, false);

	const session = activeSession();
	if (!session || thread._local) return next;
	try {
		const saved = await putMailMessage(session, next);
		if (idx >= 0) mailMessages[idx] = saved;
		return saved;
	} catch (e) {
		mailUi.error = e instanceof Error ? e.message : String(e);
		return next;
	}
}

/** @param {any} thread */
function msgsStillUnread(thread) {
	const msgs = Array.isArray(thread?.messages) ? thread.messages : [];
	return msgs.some((m) => m?._unread);
}

/**
 * @param {string} id
 */
export async function markMailUnread(id) {
	const thread = findMail(id);
	if (!thread) return null;
	const unreadIds = jmapIdsForSeen(thread, false);
	applyThreadUnreadLocal(thread, true);
	rememberUnreadOverride(id, true);

	if (thread.transport === 'jmap' || Array.isArray(thread.messages)) {
		try {
			await persistJmapSeen(thread, false, unreadIds);
		} catch (e) {
			mailUi.error = e instanceof Error ? e.message : String(e);
		}
		return thread;
	}

	const me = mailActorEmail();
	if (me && isInboxFor(thread, me)) {
		const read = (Array.isArray(thread.read_by) ? thread.read_by : [])
			.map(normEmail)
			.filter((e) => e && e !== me);
		thread.read_by = read;
		const idx = mailMessages.findIndex((m) => m.id === id);
		if (idx >= 0) mailMessages[idx] = thread;
		const session = activeSession();
		if (session && !thread._local) {
			try {
				const saved = await putMailMessage(session, thread);
				if (idx >= 0) mailMessages[idx] = saved;
				return saved;
			} catch (e) {
				mailUi.error = e instanceof Error ? e.message : String(e);
			}
		}
	}
	return thread;
}

/**
 * Inbox convo stack: only when the thread grew past the first message.
 * Last message author first, then other unique authors (max 3 — ProfilePicStack also caps).
 * @param {any} thread
 * @returns {{ name: string, email: string, pictureUrl: string | null }[]}
 */
export function threadParticipantProfiles(thread) {
	const msgs = threadMessages(thread);
	if (msgs.length <= 1) return [];

	/** @type {{ name: string, email: string, pictureUrl: string | null }[]} */
	const ordered = [];
	const seen = new Set();
	for (let i = msgs.length - 1; i >= 0; i--) {
		const m = msgs[i];
		const email = normEmail(m?.from);
		if (!email || seen.has(email)) continue;
		seen.add(email);
		ordered.push({
			email,
			name: mailAuthorLabel(m) || displayNameFromEmail(m.from),
			pictureUrl: null
		});
		if (ordered.length >= 3) break;
	}
	return ordered;
}

/**
 * @param {string | undefined} subject
 * @param {'re' | 'fwd'} kind
 */
export function mailComposeSubject(subject, kind) {
	const s = String(subject || '').trim();
	if (kind === 'fwd') {
		if (!s) return 'Fwd:';
		return /^fwd\s*:/i.test(s) || /^fw\s*:/i.test(s) ? s : `Fwd: ${s}`;
	}
	if (!s) return 'Re:';
	return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * Cc addresses on a message (UI list or raw JMAP).
 * @param {any} msg
 * @returns {string[]}
 */
export function mailCcEmails(msg) {
	/** @type {string[]} */
	const out = [];
	/** @type {Set<string>} */
	const seen = new Set();
	/** @param {unknown} raw */
	const push = (raw) => {
		const e = normEmail(raw);
		if (!e || seen.has(e)) return;
		seen.add(e);
		out.push(e);
	};
	if (Array.isArray(msg?.cc)) {
		for (const e of msg.cc) push(e);
	}
	const jmapCc = Array.isArray(msg?._jmap?.cc) ? msg._jmap.cc : [];
	for (const a of jmapCc) push(a?.email);
	return out;
}

/**
 * Reply-all is the default when the message has more than one other party (to/cc + from).
 * @param {any} msg
 * @param {string} [meEmail]
 */
export function preferReplyAll(msg, meEmail = '') {
	const me = normEmail(meEmail || mailActorEmail());
	const parties = new Set();
	const from = normEmail(msg?.from);
	if (from && from !== me) parties.add(from);
	for (const e of [...(msg?.to || []), ...mailCcEmails(msg)]) {
		const n = normEmail(e);
		if (n && n !== me) parties.add(n);
	}
	return parties.size > 1;
}

/**
 * Seed fields for Reply / Reply all / Forward composers.
 * Reply-all mirrors normal clients: To = From (or original To if from me),
 * Cc = everyone else on To/Cc except me.
 * @param {any} thread
 * @param {'reply' | 'replyAll' | 'forward'} mode
 */
export function mailComposeSeed(thread, mode) {
	const msgs = threadMessages(thread);
	const last = msgs[msgs.length - 1] || thread;
	const me = mailActorEmail();
	const from = normEmail(last?.from);
	const subject = String(last?.subject || thread?.subject || '').trim();
	const body = String(last?.body || '')
		.replace(/\r\n/g, '\n')
		.trim();

	const threadId = String(thread?.threadId || thread?.id || last?.threadId || '');
	const rawMid = last?.messageId || last?._jmap?.messageId || '';
	const inReplyTo = Array.isArray(rawMid)
		? String(rawMid[0] || '').trim()
		: String(rawMid || '').trim();

	if (mode === 'forward') {
		const who = mailAuthorLabel(last) || from || '';
		const when = last?.created_at ? String(last.created_at) : '';
		const quoted = [
			'',
			'',
			'---------- Forwarded message ----------',
			who ? `From: ${who}${from ? ` <${from}>` : ''}` : from ? `From: ${from}` : '',
			when ? `Date: ${when}` : '',
			subject ? `Subject: ${subject}` : '',
			'',
			body
		]
			.filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
			.join('\n');
		return {
			to: '',
			cc: '',
			bcc: '',
			subject: mailComposeSubject(subject, 'fwd'),
			body: quoted,
			threadId: '',
			inReplyTo: '',
			focus: 'to'
		};
	}

	/** @type {string[]} */
	let to = [];
	/** @type {string[]} */
	let cc = [];
	const lastCc = mailCcEmails(last);

	if (mode === 'replyAll') {
		if (from && from !== me) {
			to = [from];
		} else {
			to = (last?.to || []).map(normEmail).filter((e) => e && e !== me);
		}
		/** @type {Set<string>} */
		const toSet = new Set(to);
		for (const e of [...(last?.to || []), ...lastCc]) {
			const n = normEmail(e);
			if (n && n !== me && !toSet.has(n) && !cc.includes(n)) cc.push(n);
		}
	} else if (from === me) {
		to = (last?.to || []).map(normEmail).filter((e) => e && e !== me);
		cc = lastCc.filter((e) => e && e !== me && !to.includes(e));
	} else if (from) {
		to = [from];
	}

	return {
		to: to.join(', '),
		cc: cc.join(', '),
		bcc: '',
		subject: mailComposeSubject(subject, 're'),
		body: '',
		threadId,
		inReplyTo,
		focus: 'body'
	};
}

/**
 * Soft-remove a thread from the current folder list (local until JMAP move exists).
 * @param {string} id
 * @param {'junk' | 'trash' | 'archive' | 'inbox'} folder
 */
export function moveMailThreadLocal(id, folder) {
	const idx = mailMessages.findIndex((m) => String(m.id) === String(id));
	if (idx < 0) return false;
	/* Drop from the painted list; refreshMail will reconcile on next folder load. */
	if (folder === 'junk' || folder === 'trash' || folder === 'archive') {
		mailMessages.splice(idx, 1);
		return true;
	}
	return false;
}

/**
 * Archive a mail thread (swipe / filter). Drops it from the current folder list.
 * @param {string} id
 */
export function archiveMailThread(id) {
	return moveMailThreadLocal(id, 'archive');
}

/** Preview line for list rows. */
export function mailPreview(msg) {
	const raw = String(msg?.body || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return raw.slice(0, 120);
}

/**
 * Prefer JMAP From display-name (Apple Mail style), then directory, then local-part.
 * @param {any} msg
 */
export function mailAuthorLabel(msg) {
	if (!msg) return '';
	const named = String(msg.from_name || '').trim();
	if (named) return named;
	const from = String(msg.from || '').trim().toLowerCase();
	const fromMsgName = mailPersonName(msg, from);
	if (fromMsgName) return fromMsgName;
	return displayNameFromEmail(from);
}

/**
 * @param {string} [iso]
 */
export function formatMailWhen(iso) {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const now = Date.now();
	const diff = now - d.getTime();
	if (diff < 60_000) return 'just now';
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
