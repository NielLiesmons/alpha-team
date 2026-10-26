/**
 * Personal Mail — Stalwart JMAP when mailbox password is set; else Drive interim leaves.
 * Not Publications / Resend newsletters.
 */

import { activePerson, actor } from './actor.svelte.js';
import {
	createMailMessage,
	listMailMessages,
	putMailMessage
} from './drive/entities.js';
import { activeSession } from './drive/session.svelte.js';
import { getMailboxPassword, listJmapMailbox } from './jmap-mail.js';

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
	return normEmail(msg.from) === me;
}

/**
 * @param {any} msg
 * @param {string} [email]
 */
export function isUnreadFor(msg, email = mailActorEmail()) {
	const me = normEmail(email);
	if (!me || !msg) return false;
	if (msg.transport === 'jmap') {
		if (normEmail(msg.from) === me) return false;
		return Boolean(msg._unread);
	}
	if (!isInboxFor(msg, me)) return false;
	if (normEmail(msg.from) === me) return false;
	const read = Array.isArray(msg.read_by) ? msg.read_by.map(normEmail) : [];
	return !read.includes(me);
}

/**
 * @param {'inbox' | 'sent'} folder
 * @param {string} [email]
 */
export function mailForFolder(folder, email = mailActorEmail()) {
	const me = normEmail(email);
	const list = mailMessages.filter((m) =>
		folder === 'sent' ? isSentFor(m, me) : isInboxFor(m, me)
	);
	return list.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/**
 * @param {string} id
 */
export function findMail(id) {
	return mailMessages.find((m) => m.id === id) ?? null;
}

export async function refreshMail() {
	const me = mailActorEmail();
	const pw = me ? getMailboxPassword(me) : '';
	mailUi.loading = mailMessages.length === 0;
	mailUi.error = null;
	try {
		if (me && pw) {
			const list = await listJmapMailbox(me, pw, 100);
			mailMessages.length = 0;
			mailMessages.push(...list);
			return;
		}

		const session = activeSession();
		if (!session) {
			mailMessages.splice(
				0,
				mailMessages.length,
				...mailMessages.filter((m) => m._local)
			);
			if (me && !pw) {
				mailUi.error =
					'Add your mailbox password in Settings → Mail (Stalwart) to load the real inbox.';
			}
			return;
		}
		const list = await listMailMessages(session, 200);
		mailMessages.length = 0;
		mailMessages.push(...list);
		if (me && !pw) {
			mailUi.error =
				'Showing Drive drafts only — add mailbox password in Settings to sync Stalwart.';
		}
	} catch (e) {
		mailUi.error = e instanceof Error ? e.message : String(e);
	} finally {
		mailUi.loading = false;
	}
}

/**
 * Compose + store on Drive (Space-local). Recipients who share this Drive see it in Inbox.
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
 * Mark opened by the signed-in mailbox (inbox only).
 * @param {string} id
 */
export async function markMailRead(id) {
	const me = mailActorEmail();
	const msg = findMail(id);
	if (!me || !msg || !isInboxFor(msg, me)) return msg;
	const read = Array.isArray(msg.read_by) ? msg.read_by.map(normEmail) : [];
	if (read.includes(me)) return msg;

	const next = { ...msg, read_by: [...read, me] };
	const idx = mailMessages.findIndex((m) => m.id === id);
	if (idx >= 0) mailMessages[idx] = next;

	const session = activeSession();
	if (!session || msg._local) return next;
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
