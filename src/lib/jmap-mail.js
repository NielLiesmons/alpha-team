/**
 * Stalwart JMAP client for Space mailboxes.
 * Auth: HTTP Basic with mailbox email + password (or app password).
 *
 * Browser calls are same-origin `/jmap/*` (Vite proxy in dev; Caddy on admin.{apex}
 * in prod). Direct mail.{apex} fetch fails with NetworkError — no CORS.
 */

import { MAIL_FOLDER_ROLES } from './mail-view.svelte.js';

import { serviceOrigin } from './space-host.js';

export const JMAP_ORIGIN = serviceOrigin(
	typeof import.meta !== 'undefined' ? import.meta.env?.PUBLIC_MAIL_URL : '',
	'mail'
) || 'http://127.0.0.1:8080';

const PW_KEY = 'alpha-admin-mailbox-pw.v1';

/** Same-origin JMAP base (proxied to Stalwart). */
function jmapBase() {
	if (typeof location !== 'undefined' && location.origin) {
		return `${location.origin}/jmap`;
	}
	return `${JMAP_ORIGIN}/jmap`;
}

/**
 * @param {unknown} e
 */
function networkHint(e) {
	const msg = e instanceof Error ? e.message : String(e);
	if (/NetworkError|Failed to fetch|Load failed|network/i.test(msg)) {
		return 'Cannot reach Stalwart from this page (CORS). Use Admin with /jmap proxied, or local Vite (proxy enabled).';
	}
	return msg;
}

/**
 * @returns {Record<string, string>} email → password
 */
function loadPwMap() {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(PW_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * @param {string} email
 */
export function getMailboxPassword(email) {
	const e = (email || '').trim().toLowerCase();
	if (!e) return '';
	return loadPwMap()[e] || '';
}

/**
 * @param {string} email
 * @param {string} password
 */
export function setMailboxPassword(email, password) {
	const e = (email || '').trim().toLowerCase();
	if (!e || typeof localStorage === 'undefined') return;
	const map = loadPwMap();
	if (password) map[e] = password;
	else delete map[e];
	localStorage.setItem(PW_KEY, JSON.stringify(map));
}

/**
 * @param {string} email
 * @param {string} password
 */
function basicAuth(email, password) {
	return `Basic ${btoa(`${email}:${password}`)}`;
}

/**
 * @param {string} email
 * @param {string} password
 */
export async function jmapSession(email, password) {
	let res;
	try {
		res = await fetch(`${jmapBase()}/session`, {
			headers: {
				Accept: 'application/json',
				Authorization: basicAuth(email, password)
			}
		});
	} catch (e) {
		throw new Error(networkHint(e));
	}
	if (res.status === 401) throw new Error('Mailbox password rejected by Stalwart');
	if (!res.ok) throw new Error(`JMAP session HTTP ${res.status}`);
	const session = /** @type {any} */ (await res.json());
	session.apiUrl = `${jmapBase()}/`;
	return session;
}

/**
 * @param {string} apiUrl
 * @param {string} email
 * @param {string} password
 * @param {any[]} methodCalls
 * @param {string[]} [using]
 */
async function jmapCall(
	apiUrl,
	email,
	password,
	methodCalls,
	using = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail']
) {
	let res;
	try {
		res = await fetch(apiUrl || `${jmapBase()}/`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Authorization: basicAuth(email, password)
			},
			body: JSON.stringify({
				using,
				methodCalls
			})
		});
	} catch (e) {
		throw new Error(networkHint(e));
	}
	if (res.status === 401) throw new Error('Mailbox password rejected by Stalwart');
	if (!res.ok) throw new Error(`JMAP call HTTP ${res.status}`);
	return /** @type {any} */ (await res.json());
}

/**
 * @param {any} session
 */
function primaryMailAccountId(session) {
	const primary = session?.primaryAccounts?.['urn:ietf:params:jmap:mail'];
	if (primary) return primary;
	const accounts = session?.accounts || {};
	for (const [id, acc] of Object.entries(accounts)) {
		if (acc?.accountCapabilities?.['urn:ietf:params:jmap:mail']) return id;
	}
	const ids = Object.keys(accounts);
	if (ids.length) return ids[0];
	throw new Error('No JMAP mail account on this mailbox');
}

/**
 * @param {any[]} methodResponses
 * @param {string} name
 */
function firstResult(methodResponses, name) {
	const row = methodResponses?.find((r) => r?.[0] === name);
	if (!row) return null;
	if (row[0] === 'error') throw new Error(row[1]?.description || row[1]?.type || 'JMAP error');
	return row[1];
}

/**
 * Prefer JMAP EmailAddress.name (what Apple Mail shows), not a local-part guess.
 * @param {{ name?: string, email?: string } | null | undefined} addr
 */
function addrDisplayName(addr) {
	const name = String(addr?.name || '').trim();
	if (name) return name;
	return '';
}

/**
 * Full message text from JMAP bodyValues (plain preferred, else HTML).
 * Falls back to preview only when bodies weren't fetched.
 * @param {any} email
 */
function bodyFromEmail(email) {
	const values = email?.bodyValues && typeof email.bodyValues === 'object' ? email.bodyValues : {};
	/** @param {any[]} parts */
	const fromParts = (parts) => {
		if (!Array.isArray(parts)) return '';
		const chunks = [];
		for (const p of parts) {
			const id = p?.partId;
			if (!id) continue;
			const v = values[id]?.value;
			if (v) chunks.push(String(v));
		}
		return chunks.join('\n').trim();
	};
	const plain = fromParts(email?.textBody);
	if (plain) return plain;
	const html = fromParts(email?.htmlBody);
	if (html) return html;
	return String(email?.preview || '').trim();
}

/**
 * @param {any} email
 */
export function toUiMessage(email) {
	const fromAddr = email?.from?.[0] || email?.sender?.[0] || null;
	const from = fromAddr?.email || '';
	const toAddrs = Array.isArray(email?.to) ? email.to : [];
	const to = toAddrs.map((a) => a?.email).filter(Boolean);
	const created = email?.receivedAt || email?.sentAt || new Date().toISOString();
	const fromNorm = String(from).toLowerCase();
	return {
		schema: 'alpha.mail_message/1',
		id: email.id,
		threadId: email.threadId || email.id,
		from: fromNorm,
		from_name: addrDisplayName(fromAddr),
		to: to.map((e) => String(e).toLowerCase()),
		to_people: toAddrs
			.filter((a) => a?.email)
			.map((a) => ({
				email: String(a.email).toLowerCase(),
				name: addrDisplayName(a)
			})),
		subject: email.subject || '(no subject)',
		body: bodyFromEmail(email),
		created_at: created,
		transport: 'jmap',
		read_by: email.keywords?.$seen ? [fromNorm] : [],
		_jmap: email,
		_unread: !email.keywords?.$seen,
		_flagged: Boolean(email.keywords?.$flagged)
	};
}

/**
 * Display name for a mailbox address on a message (JMAP name → fallback).
 * @param {any} msg
 * @param {string} email
 */
export function mailPersonName(msg, email) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	if (!e || !msg) return '';
	if (msg.from === e && msg.from_name) return msg.from_name;
	const hit = Array.isArray(msg.to_people)
		? msg.to_people.find((p) => p.email === e)
		: null;
	if (hit?.name) return hit.name;
	for (const m of msg.messages || []) {
		if (m.from === e && m.from_name) return m.from_name;
		const p = Array.isArray(m.to_people) ? m.to_people.find((x) => x.email === e) : null;
		if (p?.name) return p.name;
	}
	return '';
}

/**
 * Collapse messages into threads (one row per conversation).
 * @param {any[]} messages
 * @param {string} me
 */
export function groupMailThreads(messages, me) {
	const meN = (me || '').trim().toLowerCase();
	/** @type {Map<string, any[]>} */
	const by = new Map();
	for (const m of messages) {
		const key = m.threadId || m.id;
		if (!by.has(key)) by.set(key, []);
		by.get(key).push(m);
	}
	/** @type {any[]} */
	const threads = [];
	for (const [threadId, msgs] of by) {
		msgs.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
		const latest = msgs[msgs.length - 1];
		/* Author focus: other party when possible — keep their real display name */
		let authorEmail = latest.from;
		let authorName = latest.from_name || '';
		if (meN && authorEmail === meN) {
			const other = (latest.to || []).find((e) => e !== meN);
			if (other) {
				authorEmail = other;
				authorName = mailPersonName(latest, other);
			} else {
				const earlier = [...msgs].reverse().find((m) => m.from && m.from !== meN);
				if (earlier) {
					authorEmail = earlier.from;
					authorName = earlier.from_name || '';
				}
			}
		}
		threads.push({
			...latest,
			id: threadId,
			threadId,
			from: authorEmail,
			from_name: authorName,
			_latestFrom: latest.from,
			messages: msgs,
			count: msgs.length,
			_unread: msgs.some((m) => m._unread && m.from !== meN),
			_flagged: msgs.some((m) => m._flagged),
			created_at: latest.created_at,
			subject: latest.subject,
			body: latest.body
		});
	}
	threads.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
	return threads;
}

const EMAIL_PROPS = [
	'id',
	'threadId',
	'subject',
	'from',
	'to',
	'sender',
	'receivedAt',
	'sentAt',
	'preview',
	'keywords',
	'mailboxIds',
	'textBody',
	'htmlBody',
	'bodyValues'
];

/**
 * List one folder from Stalwart as real conversation threads.
 * Uses collapseThreads + Thread/get so every message in a thread is loaded.
 * @param {string} email
 * @param {string} password
 * @param {keyof typeof MAIL_FOLDER_ROLES} folder
 * @param {number} [limit] max threads (not messages)
 */
export async function listJmapFolder(email, password, folder, limit = 50) {
	const role = MAIL_FOLDER_ROLES[folder] || 'inbox';
	const session = await jmapSession(email, password);
	const accountId = primaryMailAccountId(session);
	const apiUrl = session.apiUrl || `${jmapBase()}/`;

	const boxes = await jmapCall(apiUrl, email, password, [
		[
			'Mailbox/get',
			{ accountId, ids: null, properties: ['id', 'name', 'role', 'sortOrder'] },
			'0'
		]
	]);
	const mailboxList = firstResult(boxes.methodResponses, 'Mailbox/get')?.list || [];
	const box = mailboxList.find((m) => m.role === role);
	if (!box?.id) return [];

	const q = await jmapCall(apiUrl, email, password, [
		[
			'Email/query',
			{
				accountId,
				filter: { inMailbox: box.id },
				sort: [{ property: 'receivedAt', isAscending: false }],
				collapseThreads: true,
				limit
			},
			'0'
		]
	]);
	const seedIds = firstResult(q.methodResponses, 'Email/query')?.ids || [];
	if (!seedIds.length) return [];

	const seeds = await jmapCall(apiUrl, email, password, [
		['Email/get', { accountId, ids: seedIds, properties: ['id', 'threadId'] }, '0']
	]);
	const seedList = firstResult(seeds.methodResponses, 'Email/get')?.list || [];
	const threadIds = [...new Set(seedList.map((e) => e.threadId).filter(Boolean))];
	if (!threadIds.length) return [];

	const threadsRes = await jmapCall(apiUrl, email, password, [
		['Thread/get', { accountId, ids: threadIds }, '0']
	]);
	const threadList = firstResult(threadsRes.methodResponses, 'Thread/get')?.list || [];
	/** @type {string[]} */
	const allEmailIds = [];
	for (const t of threadList) {
		for (const id of t.emailIds || []) {
			if (id && !allEmailIds.includes(id)) allEmailIds.push(id);
		}
	}
	if (!allEmailIds.length) return [];

	const got = await jmapCall(apiUrl, email, password, [
		[
			'Email/get',
			{
				accountId,
				ids: allEmailIds,
				properties: EMAIL_PROPS,
				fetchTextBodyValues: true,
				fetchHTMLBodyValues: true,
				maxBodyValueBytes: 1_000_000
			},
			'0'
		]
	]);
	const list = (firstResult(got.methodResponses, 'Email/get')?.list || []).map(toUiMessage);
	return groupMailThreads(list, email);
}

/**
 * @param {string} email
 * @param {string} password
 */
export async function testMailboxLogin(email, password) {
	const session = await jmapSession(email, password);
	primaryMailAccountId(session);
	return true;
}

/**
 * @param {unknown} value
 */
function cleanContactEmail(value) {
	let s = String(value || '')
		.trim()
		.toLowerCase();
	if (s.startsWith('mailto:')) s = s.slice(7);
	s = s.split('?')[0].trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
	return s;
}

/**
 * @param {any} card
 */
function contactDisplayName(card) {
	const name = card?.name;
	if (typeof name === 'string' && name.trim()) return name.trim();
	if (name && typeof name === 'object') {
		if (typeof name.full === 'string' && name.full.trim()) return name.full.trim();
		const comps = name.components;
		/** @type {string[]} */
		const parts = [];
		const pushComp = (c) => {
			const v = String(c?.value || '').trim();
			if (v) parts.push(v);
		};
		if (Array.isArray(comps)) comps.forEach(pushComp);
		else if (comps && typeof comps === 'object') Object.values(comps).forEach(pushComp);
		if (parts.length) return parts.join(' ');
	}
	if (typeof card?.fullName === 'string' && card.fullName.trim()) return card.fullName.trim();
	const nicks = card?.nicknames;
	if (nicks && typeof nicks === 'object') {
		for (const nick of Object.values(nicks)) {
			if (typeof nick === 'string' && nick.trim()) return nick.trim();
			const named = /** @type {any} */ (nick)?.name;
			if (typeof named === 'string' && named.trim()) return named.trim();
		}
	}
	return '';
}

/**
 * @param {any} card
 * @returns {string[]}
 */
function contactEmails(card) {
	/** @type {string[]} */
	const out = [];
	const push = (value) => {
		const email = cleanContactEmail(value);
		if (email && !out.includes(email)) out.push(email);
	};
	const emails = card?.emails;
	if (Array.isArray(emails)) {
		for (const item of emails) push(item?.address || item?.email || item);
	} else if (emails && typeof emails === 'object') {
		for (const item of Object.values(emails)) {
			push(/** @type {any} */ (item)?.address || /** @type {any} */ (item)?.email || item);
		}
	}
	if (!out.length && typeof card?.vCard === 'string') {
		for (const match of card.vCard.matchAll(/EMAIL[^:\n]*:([^\s]+)/gi)) push(match[1]);
	}
	return out;
}

/**
 * JSContact cards from Stalwart `ContactCard/get` → one row per email.
 * @param {any[]} cards
 * @returns {{ email: string, name: string }[]}
 */
export function contactsFromCards(cards) {
	/** @type {Map<string, string>} */
	const byEmail = new Map();
	for (const card of cards || []) {
		const name = contactDisplayName(card);
		for (const email of contactEmails(card)) {
			if (!byEmail.has(email)) byEmail.set(email, name);
			else if (!byEmail.get(email) && name) byEmail.set(email, name);
		}
	}
	return [...byEmail.entries()].map(([email, name]) => ({ email, name }));
}

/**
 * Address book on the signed-in Stalwart mailbox (RFC 9610 ContactCard).
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ email: string, name: string }[]>}
 */
export async function listJmapContacts(email, password) {
	const session = await jmapSession(email, password);
	const cap = 'urn:ietf:params:jmap:contacts';
	const accountId = session?.primaryAccounts?.[cap];
	if (!accountId) return [];
	const apiUrl = session.apiUrl || `${jmapBase()}/`;
	const got = await jmapCall(
		apiUrl,
		email,
		password,
		[['ContactCard/get', { accountId }, 'contacts']],
		['urn:ietf:params:jmap:core', cap]
	);
	const row = got?.methodResponses?.find((r) => r?.[0] === 'ContactCard/get' || r?.[2] === 'contacts');
	if (!row || row[0] === 'error') return [];
	const list = row[1]?.list || [];
	return contactsFromCards(list);
}

/** @deprecated use listJmapFolder */
export async function listJmapMailbox(email, password, limit = 100) {
	return listJmapFolder(email, password, 'inbox', limit);
}
