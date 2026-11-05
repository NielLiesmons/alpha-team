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
	mailPersonName
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

function normEmail(value) {
	return (value || '').trim().toLowerCase();
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

export async function refreshMail() {
	const me = mailActorEmail();
	const pw = me ? getMailboxPassword(me) : '';
	const folder = mailView.folder;
	const hadLocal = mailMessages.length > 0;
	const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
	if (offline && hadLocal) {
		mailUi.loading = false;
		return;
	}
	mailUi.loading = mailMessages.length === 0;
	mailUi.error = null;
	try {
		if (me && pw) {
			const list = await listJmapFolder(me, pw, folder, 80);
			mailMessages.length = 0;
			mailMessages.push(...list);
			for (const m of list) rememberMailTip(m);
			return;
		}

		const session = activeSession();
		if (!session) {
			const locals = mailMessages.filter((m) => m._local);
			mailMessages.splice(0, mailMessages.length, ...locals);
			for (const m of locals) rememberMailTip(m);
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
 * @param {{ to: string[], subject: string, body: string }} input
 */
export async function sendMail(input) {
	const from = activePerson().email;
	if (!from) throw new Error('Pick who you are in Settings first');
	const to = [...new Set((input.to || []).map(normEmail).filter(Boolean))];
	if (!to.length) throw new Error('Add at least one recipient');
	const subject = (input.subject || '').trim();
	const body = (input.body || '').trim();
	if (!subject && !body) throw new Error('Write a subject or body');

	mailUi.sending = true;
	try {
		const session = activeSession();
		if (!session) {
			const local = {
				schema: 'alpha.mail_message/1',
				id: crypto.randomUUID(),
				from,
				to,
				subject: subject || '(no subject)',
				body,
				created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
				transport: 'drive',
				read_by: [from],
				_local: true
			};
			mailMessages.unshift(local);
			return local;
		}
		const created = await createMailMessage(session, {
			from,
			to,
			subject: subject || '(no subject)',
			body
		});
		mailMessages.unshift(created);
		return created;
	} finally {
		mailUi.sending = false;
	}
}

/**
 * @param {string} id
 */
export async function markMailRead(id) {
	const me = mailActorEmail();
	const thread = findMail(id);
	if (!me || !thread) return thread;

	if (thread.transport === 'jmap' || Array.isArray(thread.messages)) {
		thread._unread = false;
		if (Array.isArray(thread.messages)) {
			for (const m of thread.messages) m._unread = false;
		}
		return thread;
	}

	if (!isInboxFor(thread, me)) return thread;
	const read = Array.isArray(thread.read_by) ? thread.read_by.map(normEmail) : [];
	if (read.includes(me)) return thread;

	const next = { ...thread, read_by: [...read, me] };
	const idx = mailMessages.findIndex((m) => m.id === id);
	if (idx >= 0) mailMessages[idx] = next;

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
