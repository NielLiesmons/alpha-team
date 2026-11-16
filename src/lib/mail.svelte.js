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
import { approvedContacts, isApprovedContact } from './mail-contacts.svelte.js';
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
		if (folder === 'sent') return isSentFor(m, me);
		if (folder === 'inbox') return isInboxFor(m, me);
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
 * Triage category for a thread.
 * Primary = approved first-contact only.
 * @param {any} thread
 * @returns {import('./mail-view.svelte.js').MailCategory}
 */
export function mailCategoryFor(thread) {
	if (isUpdatesMail(thread)) return 'updates';
	if (isOtherMail(thread)) return 'other';
	const contact = normEmail(thread?.from);
	if (contact && isApprovedContact(contact)) return 'primary';
	return 'new';
}

/**
 * Folder threads filtered by active triage category.
 */
export function mailThreadsForCurrentView() {
	mailView.category;
	approvedContacts().size; /* subscribe to approved + members */
	const all = mailThreadsForCurrentFolder();
	const cat = mailView.category;
	return all.filter((t) => mailCategoryFor(t) === cat);
}

/**
 * Messages in a thread, oldest → newest.
 * @param {any} thread
 */
export function threadMessages(thread) {
	if (!thread) return [];
	if (Array.isArray(thread.messages) && thread.messages.length) {
		return [...thread.messages].sort((a, b) =>
			String(a.created_at || '').localeCompare(String(b.created_at || ''))
		);
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
 * @type {Record<string, { subject: string, from: string, from_name: string }>}
 */
export const mailTipCache = $state({});

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
	/* Skip no-op writes — chat feed derived tracks mailTipCache; rewriting loops forever. */
	if (
		prev &&
		prev.subject === subject &&
		prev.from === from &&
		prev.from_name === from_name
	) {
		return;
	}
	mailTipCache[id] = { subject, from, from_name };
	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.setItem('alpha.mail.tips.v1', JSON.stringify(mailTipCache));
		} catch {
			/* ignore */
		}
	}
}

export function hydrateMailTipCache() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem('alpha.mail.tips.v1');
		const doc = raw ? JSON.parse(raw) : null;
		if (!doc || typeof doc !== 'object') return;
		for (const [id, row] of Object.entries(doc)) {
			if (!id || !row || typeof row !== 'object') continue;
			mailTipCache[id] = {
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
 * Pending / failed optimistic messages that must survive a folder refresh.
 * @returns {{ threadId: string, msgs: any[] }[]}
 */
function snapshotOptimisticMail() {
	/** @type {{ threadId: string, msgs: any[] }[]} */
	const out = [];
	for (const t of mailMessages) {
		const tid = String(t.threadId || t.id || '');
		const msgs = threadMessages(t).filter(
			(m) => m?._pending || m?._sendError || String(m?.id || '').startsWith('pending:')
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
			const serverHas = mailMessages.some((t) => {
				const msgs = threadMessages(t);
				return msgs.some(
					(m) =>
						String(m.id) === String(msg.id) ||
						(msg._serverId && String(m.id) === String(msg._serverId))
				);
			});
			if (serverHas) continue;
			upsertMailMessage({
				...msg,
				threadId: snap.threadId || msg.threadId
			});
		}
	}
}

export async function refreshMail() {
	const me = mailActorEmail();
	const pw = me ? getMailboxPassword(me) : '';
	const folder = mailView.folder;
	const hadLocal = mailMessages.length > 0;
	const pendingSnap = snapshotOptimisticMail();
	const keepError = mailUi.error;
	const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
	if (offline && hadLocal) {
		mailUi.loading = false;
		return;
	}
	mailUi.loading = mailMessages.length === 0;
	/* Don't clear a fresh send error — that caused an accent flash then wipe. */
	if (!keepError) mailUi.error = null;
	try {
		if (me && pw) {
			const list = await listJmapFolder(me, pw, folder, 80);
			mailMessages.length = 0;
			mailMessages.push(...list);
			for (const m of list) rememberMailTip(m);
			reapplyOptimisticMail(pendingSnap);
			reapplyUnreadOverrides();
			return;
		}

		const session = activeSession();
		if (!session) {
			const locals = mailMessages.filter((m) => m._local);
			mailMessages.splice(0, mailMessages.length, ...locals);
			for (const m of locals) rememberMailTip(m);
			reapplyOptimisticMail(pendingSnap);
			reapplyUnreadOverrides();
			if (me && !pw) {
				mailUi.error =
					'Add your mailbox password in Settings → Mail (Stalwart) to load the real inbox.';
			}
			return;
		}
		const list = await listMailMessages(session, 200);
		mailMessages.length = 0;
		mailMessages.push(...list);
		for (const m of list) rememberMailTip(m);
		reapplyOptimisticMail(pendingSnap);
		reapplyUnreadOverrides();
		if (me && !pw) {
			mailUi.error =
				'Showing Drive drafts only — add mailbox password in Settings to sync Stalwart.';
		}
	} catch (e) {
		/* Keep whatever was already painted — never wipe on network blips. */
		if (!hadLocal) {
			mailUi.error = e instanceof Error ? e.message : String(e);
		}
	} finally {
		mailUi.loading = false;
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
		return msgs.some((m) => String(m.id) === pendingKey || String(m.id) === String(msg.id));
	});

	if (threadIdx >= 0) {
		const thread = mailMessages[threadIdx];
		const stableThreadId = String(thread.threadId || thread.id || threadKey);
		const msgs = Array.isArray(thread.messages) ? [...thread.messages] : threadMessages(thread);
		const without = msgs.filter(
			(m) => String(m.id) !== pendingKey && String(m.id) !== String(msg.id)
		);
		without.push({ ...msg, threadId: stableThreadId });
		without.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
		const latest = without[without.length - 1] || msg;
		/* Never rewrite the open thread's list id to a pending/server create id. */
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
			messages: without,
			_pending: without.some((m) => m._pending),
			_sendError: without.find((m) => m._sendError)?._sendError || undefined
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

/**
 * Optimistic send: paint immediately, deliver via JMAP (or Drive fallback) in background.
 * @param {{
 *   to: string[],
 *   subject: string,
 *   body: string,
 *   threadId?: string,
 *   inReplyTo?: string,
 *   scheduleAt?: string | null
 * }} input
 */
export function sendMail(input) {
	const from = activePerson().email;
	if (!from) throw new Error('Pick who you are in Settings first');
	const to = [...new Set((input.to || []).map(normEmail).filter(Boolean))];
	if (!to.length) throw new Error('Add at least one recipient');
	const subject = (input.subject || '').trim();
	const body = (input.body || '').trim();
	if (!subject && !body) throw new Error('Write a subject or body');

	const pendingId = `pending:${crypto.randomUUID()}`;
	const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
	const scheduleAt = input.scheduleAt ? String(input.scheduleAt) : '';
	const scheduleMs = scheduleAt ? Date.parse(scheduleAt) : NaN;
	const scheduled = Number.isFinite(scheduleMs) && scheduleMs > Date.now() + 5_000;
	const threadId = String(input.threadId || pendingId);
	const fromName = activePerson().name || '';

	const optimistic = {
		schema: 'alpha.mail_message/1',
		id: pendingId,
		threadId,
		from: normEmail(from),
		from_name: fromName,
		to,
		subject: subject || '(no subject)',
		body,
		created_at: scheduled ? new Date(scheduleMs).toISOString() : now,
		transport: 'jmap',
		read_by: [normEmail(from)],
		_pending: true,
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
					subject: subject || '(no subject)',
					body,
					fromName,
					inReplyTo: input.inReplyTo || '',
					threadId: threadId === pendingId ? undefined : threadId,
					scheduleAt: scheduled ? new Date(scheduleMs).toISOString() : null
				});
			} else {
				const session = activeSession();
				if (!session) {
					created = { ...optimistic, id: crypto.randomUUID(), _pending: false, _local: true, transport: 'drive' };
				} else {
					created = await createMailMessage(session, {
						from,
						to,
						subject: subject || '(no subject)',
						body
					});
					created = { ...created, threadId: created.threadId || threadId };
				}
			}
			upsertMailMessage(
				{
					...created,
					/* Keep the open conversation id so the card stays in-thread. */
					threadId,
					_pending: false,
					_serverId: created.id,
					_scheduled: Boolean(created._scheduled || scheduled),
					_scheduledAt: created._scheduledAt || optimistic._scheduledAt
				},
				pendingId
			);
			mailUi.error = null;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			mailUi.error = msg;
			upsertMailMessage({ ...optimistic, _pending: false, _sendError: msg }, pendingId);
		} finally {
			mailUi.sending = false;
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
 * Reply-all is the default when the message has more than one other party (to/cc + from).
 * @param {any} msg
 * @param {string} [meEmail]
 */
export function preferReplyAll(msg, meEmail = '') {
	const me = normEmail(meEmail || mailActorEmail());
	const parties = new Set();
	const from = normEmail(msg?.from);
	if (from && from !== me) parties.add(from);
	for (const e of [...(msg?.to || []), ...(msg?.cc || [])]) {
		const n = normEmail(e);
		if (n && n !== me) parties.add(n);
	}
	return parties.size > 1;
}

/**
 * Seed fields for Reply / Reply all / Forward composers.
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
			subject: mailComposeSubject(subject, 'fwd'),
			body: quoted,
			threadId: '',
			inReplyTo: '',
			focus: 'to'
		};
	}

	/** @type {string[]} */
	let to = [];
	if (mode === 'replyAll') {
		if (from && from !== me) to.push(from);
		for (const e of last?.to || []) {
			const n = normEmail(e);
			if (n && n !== me && !to.includes(n)) to.push(n);
		}
	} else if (from === me) {
		to = (last?.to || []).map(normEmail).filter((e) => e && e !== me);
	} else if (from) {
		to = [from];
	}

	return {
		to: to.join(', '),
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
 * @param {'junk' | 'trash' | 'inbox'} folder
 */
export function moveMailThreadLocal(id, folder) {
	const idx = mailMessages.findIndex((m) => String(m.id) === String(id));
	if (idx < 0) return false;
	/* Drop from the painted list; refreshMail will reconcile on next folder load. */
	if (folder === 'junk' || folder === 'trash') {
		mailMessages.splice(idx, 1);
		return true;
	}
	return false;
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
