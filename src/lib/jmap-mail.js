/**
 * Stalwart JMAP client for personal mailboxes (mail.bley.farm).
 * Auth: HTTP Basic with mailbox email + password (or app password).
 *
 * Browser calls are same-origin `/jmap/*` (Vite proxy in dev; Caddy on admin.bley.farm
 * in prod). Direct mail.bley.farm fetch fails with NetworkError — no CORS.
 */

import { MAIL_FOLDER_ROLES } from './mail-view.svelte.js';

export const JMAP_ORIGIN = 'https://mail.bley.farm';

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
		return 'Cannot reach Stalwart from this page (CORS). Use Admin via admin.bley.farm with /jmap proxied, or local Vite (proxy enabled).';
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
 */
async function jmapCall(apiUrl, email, password, methodCalls) {
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
				using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
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
 * @param {any} email
 */
export function toUiMessage(email) {
	const from = email?.from?.[0]?.email || email?.sender?.[0]?.email || '';
	const to = (email?.to || []).map((a) => a.email).filter(Boolean);
	const created = email?.receivedAt || email?.sentAt || new Date().toISOString();
	const fromNorm = String(from).toLowerCase();
	return {
		schema: 'alpha.mail_message/1',
		id: email.id,
		threadId: email.threadId || email.id,
		from: fromNorm,
		to: to.map((e) => String(e).toLowerCase()),
		subject: email.subject || '(no subject)',
		body: email.preview || '',
		created_at: created,
		transport: 'jmap',
		read_by: email.keywords?.$seen ? [fromNorm] : [],
		_jmap: email,
		_unread: !email.keywords?.$seen
	};
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
		/* Author focus: other party when possible */
		let authorEmail = latest.from;
		if (meN && authorEmail === meN) {
			const other = (latest.to || []).find((e) => e !== meN);
			if (other) authorEmail = other;
			else {
				const earlier = [...msgs].reverse().find((m) => m.from && m.from !== meN);
				if (earlier) authorEmail = earlier.from;
			}
		}
		threads.push({
			...latest,
			id: threadId,
			threadId,
			from: authorEmail,
			_latestFrom: latest.from,
			messages: msgs,
			count: msgs.length,
			_unread: msgs.some((m) => m._unread && m.from !== meN),
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
	'mailboxIds'
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
		['Email/get', { accountId, ids: allEmailIds, properties: EMAIL_PROPS }, '0']
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

/** @deprecated use listJmapFolder */
export async function listJmapMailbox(email, password, limit = 100) {
	return listJmapFolder(email, password, 'inbox', limit);
}
