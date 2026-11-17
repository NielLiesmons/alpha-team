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
/** @type {Map<string, { session: any, at: number }>} */
const sessionCache = new Map();
const SESSION_TTL_MS = 5 * 60_000;

export async function jmapSession(email, password) {
	const key = `${String(email || '')
		.trim()
		.toLowerCase()}|${password || ''}`;
	const hit = sessionCache.get(key);
	if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.session;

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
	if (res.status === 401) {
		sessionCache.delete(key);
		throw new Error('Mailbox password rejected by Stalwart');
	}
	if (!res.ok) throw new Error(`JMAP session HTTP ${res.status}`);
	const session = /** @type {any} */ (await res.json());
	session.apiUrl = `${jmapBase()}/`;
	sessionCache.set(key, { session, at: Date.now() });
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
		messageId: normalizeMessageId(email.messageId),
		read_by: email.keywords?.$seen ? [fromNorm] : [],
		_jmap: email,
		_unread: !email.keywords?.$seen,
		_flagged: Boolean(email.keywords?.$flagged)
	};
}

/**
 * JMAP messageId may be string or string[].
 * @param {unknown} raw
 */
function normalizeMessageId(raw) {
	if (Array.isArray(raw)) {
		for (const item of raw) {
			const s = String(item || '').trim();
			if (s) return s.includes('<') ? s : `<${s}>`;
		}
		return '';
	}
	const s = String(raw || '').trim();
	if (!s) return '';
	return s.includes('<') ? s : `<${s}>`;
}

/**
 * Only real RFC Message-IDs belong in In-Reply-To (never raw JMAP Email ids).
 * @param {string} value
 */
function asReplyMessageId(value) {
	const s = String(value || '').trim();
	if (!s || s.startsWith('pending:')) return '';
	if (/^<[^>]+>$/.test(s)) return s;
	/* Bare ids that look like message-ids (contain @) */
	if (s.includes('@') && !s.includes(' ')) return `<${s.replace(/^<|>$/g, '')}>`;
	return '';
}

/**
 * Resolve Identity id for the From address (Stalwart usually requires it).
 * @param {string} apiUrl
 * @param {string} email
 * @param {string} password
 * @param {string} accountId
 * @param {string} fromEmail
 */
/** @type {Map<string, { id: string, at: number }>} */
const identityCache = new Map();

async function identityIdFor(apiUrl, email, password, accountId, fromEmail) {
	const want = String(fromEmail || '')
		.trim()
		.toLowerCase();
	const cacheKey = `${accountId}|${want}`;
	const cached = identityCache.get(cacheKey);
	if (cached && Date.now() - cached.at < MAILBOX_TTL_MS) return cached.id;
	try {
		const res = await jmapCall(
			apiUrl,
			email,
			password,
			[['Identity/get', { accountId, ids: null }, '0']],
			['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']
		);
		const list = firstResult(res.methodResponses, 'Identity/get')?.list || [];
		const hit =
			list.find((i) => String(i?.email || '').toLowerCase() === want) ||
			list.find((i) =>
				(Array.isArray(i?.replyTo) ? i.replyTo : []).some(
					(a) => String(a?.email || '').toLowerCase() === want
				)
			) ||
			list[0];
		const id = hit?.id ? String(hit.id) : '';
		if (id) identityCache.set(cacheKey, { id, at: Date.now() });
		return id;
	} catch {
		return '';
	}
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
	'bodyValues',
	'messageId'
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

/** @type {Map<string, { draftsId: string, sentId: string, at: number }>} */
const mailboxRoleCache = new Map();
const MAILBOX_TTL_MS = 10 * 60_000;

/**
 * Resolve Drafts + Sent mailbox ids in one Mailbox/get (cached).
 * @param {string} apiUrl
 * @param {string} email
 * @param {string} password
 * @param {string} accountId
 */
async function draftsAndSentIds(apiUrl, email, password, accountId) {
	const key = `${accountId}`;
	const hit = mailboxRoleCache.get(key);
	if (hit && Date.now() - hit.at < MAILBOX_TTL_MS) {
		return { draftsId: hit.draftsId, sentId: hit.sentId };
	}
	const boxes = await jmapCall(apiUrl, email, password, [
		[
			'Mailbox/get',
			{ accountId, ids: null, properties: ['id', 'name', 'role'] },
			'0'
		]
	]);
	const list = firstResult(boxes.methodResponses, 'Mailbox/get')?.list || [];
	const drafts = list.find((m) => m.role === 'drafts');
	const sent = list.find((m) => m.role === 'sent');
	const draftsId = drafts?.id ? String(drafts.id) : '';
	const sentId = sent?.id ? String(sent.id) : '';
	mailboxRoleCache.set(key, { draftsId, sentId, at: Date.now() });
	return { draftsId, sentId };
}

/**
 * Rough HTML → plain for multipart/alternative (deliverability).
 * @param {string} html
 */
function htmlToPlain(html) {
	return String(html || '')
		.replace(/<\s*br\s*\/?>/gi, '\n')
		.replace(/<\/\s*p\s*>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Send via Stalwart JMAP (Email/set draft + EmailSubmission/set).
 * Exactly one EmailSubmission per call. Caller must dedupe.
 * @param {string} email
 * @param {string} password
 * @param {{
 *   to: string[],
 *   subject: string,
 *   body: string,
 *   fromName?: string,
 *   inReplyTo?: string,
 *   references?: string,
 *   messageId?: string,
 *   threadId?: string,
 *   scheduleAt?: string | null
 * }} input
 */
export async function sendJmapMail(email, password, input) {
	const session = await jmapSession(email, password);
	const accountId = primaryMailAccountId(session);
	const apiUrl = session.apiUrl || `${jmapBase()}/`;
	const to = [...new Set((input.to || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
	if (!to.length) throw new Error('Add at least one recipient');
	const subject = String(input.subject || '').trim() || '(no subject)';
	const body = String(input.body || '');
	const fromEmail = String(email || '')
		.trim()
		.toLowerCase();
	const fromName = String(input.fromName || '').trim();
	const looksHtml = /<[a-z][\s\S]*>/i.test(body);
	const fromDomain = fromEmail.includes('@') ? fromEmail.slice(fromEmail.indexOf('@') + 1) : 'localhost';
	const ourMessageId =
		asReplyMessageId(input.messageId || '') ||
		`<alpha.${crypto.randomUUID().replace(/-/g, '')}@${fromDomain}>`;

	const [{ draftsId, sentId }, identityId] = await Promise.all([
		draftsAndSentIds(apiUrl, email, password, accountId),
		identityIdFor(apiUrl, email, password, accountId, fromEmail)
	]);
	const mailboxIds = {};
	if (draftsId) mailboxIds[draftsId] = true;
	else if (sentId) mailboxIds[sentId] = true;
	else throw new Error('No Drafts/Sent mailbox on this account');

	/** @type {Record<string, any>} */
	const draft = {
		mailboxIds,
		keywords: { $draft: true, $seen: true },
		from: [{ email: fromEmail, ...(fromName ? { name: fromName } : {}) }],
		to: to.map((e) => ({ email: e })),
		subject,
		'header:Message-ID:asText': ourMessageId
	};

	if (looksHtml) {
		const plain = htmlToPlain(body) || ' ';
		draft.bodyValues = {
			text: { value: plain, charset: 'utf-8' },
			html: { value: body, charset: 'utf-8' }
		};
		draft.textBody = [{ partId: 'text', type: 'text/plain' }];
		draft.htmlBody = [{ partId: 'html', type: 'text/html' }];
	} else {
		draft.bodyValues = { text: { value: body || ' ', charset: 'utf-8' } };
		draft.textBody = [{ partId: 'text', type: 'text/plain' }];
	}

	const replyMid = asReplyMessageId(input.inReplyTo || '');
	if (replyMid) {
		draft['header:In-Reply-To:asText'] = replyMid;
		const refs = asReplyMessageId(input.references || '') || replyMid;
		draft['header:References:asText'] = refs.includes(replyMid) ? refs : `${refs} ${replyMid}`.trim();
	}

	const scheduleAt = input.scheduleAt ? String(input.scheduleAt) : '';
	const scheduleMs = scheduleAt ? Date.parse(scheduleAt) : NaN;
	const scheduleFuture = Number.isFinite(scheduleMs) && scheduleMs > Date.now() + 5_000;

	if (scheduleFuture) {
		/* Save as draft only — server-side snooze varies by provider. */
		const res = await jmapCall(
			apiUrl,
			email,
			password,
			[['Email/set', { accountId, create: { draft } }, '0']],
			['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail']
		);
		const created = firstResult(res.methodResponses, 'Email/set')?.created?.draft;
		if (!created?.id) {
			const not = firstResult(res.methodResponses, 'Email/set')?.notCreated?.draft;
			throw new Error(not?.description || not?.type || 'JMAP could not create scheduled draft');
		}
		const ui = toUiMessage({
			...draft,
			id: created.id,
			threadId: input.threadId || created.threadId || created.id,
			messageId: ourMessageId,
			receivedAt: new Date(scheduleMs).toISOString(),
			sentAt: new Date(scheduleMs).toISOString(),
			keywords: { $draft: true, $seen: true }
		});
		return { ...ui, messageId: ourMessageId, _scheduled: true, _scheduledAt: new Date(scheduleMs).toISOString() };
	}

	/** @type {Record<string, any>} */
	const submissionCreate = {
		emailId: '#draft',
		envelope: {
			mailFrom: { email: fromEmail },
			rcptTo: to.map((e) => ({ email: e }))
		}
	};
	if (identityId) submissionCreate.identityId = identityId;

	/** @type {Record<string, any> | undefined} */
	let onSuccessUpdateEmail;
	if (sentId || draftsId) {
		onSuccessUpdateEmail = {
			'#send': {
				...(draftsId ? { [`mailboxIds/${draftsId}`]: null } : {}),
				...(sentId ? { [`mailboxIds/${sentId}`]: true } : {}),
				'keywords/$draft': null,
				'keywords/$seen': true
			}
		};
	}

	/* Exactly one create + one submit — never a second EmailSubmission. */
	const res = await jmapCall(
		apiUrl,
		email,
		password,
		[
			['Email/set', { accountId, create: { draft } }, '0'],
			[
				'EmailSubmission/set',
				{
					accountId,
					create: { send: submissionCreate },
					...(onSuccessUpdateEmail ? { onSuccessUpdateEmail } : {})
				},
				'1'
			]
		],
		['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']
	);

	const emailSet = firstResult(res.methodResponses, 'Email/set');
	const created = emailSet?.created?.draft;
	if (!created?.id) {
		const not = emailSet?.notCreated?.draft;
		throw new Error(not?.description || not?.type || 'JMAP could not create message');
	}
	const sub = firstResult(res.methodResponses, 'EmailSubmission/set');
	if (sub?.notCreated?.send) {
		const fail = sub.notCreated.send;
		throw new Error(fail?.description || fail?.type || 'JMAP submission failed');
	}
	if (!sub?.created?.send) {
		throw new Error('JMAP submission returned no result');
	}

	const ui = toUiMessage({
		...draft,
		id: created.id,
		threadId: created.threadId || input.threadId || created.id,
		messageId: ourMessageId,
		receivedAt: new Date().toISOString(),
		sentAt: new Date().toISOString(),
		keywords: { $seen: true }
	});
	return { ...ui, messageId: ourMessageId };
}

/**
 * Persist $seen on one or more JMAP Email ids (Stalwart).
 * @param {string} email
 * @param {string} password
 * @param {string[]} emailIds
 * @param {boolean} seen
 */
export async function setJmapEmailsSeen(email, password, emailIds, seen) {
	const ids = [...new Set((emailIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
	if (!ids.length) return;
	const session = await jmapSession(email, password);
	const accountId = primaryMailAccountId(session);
	const apiUrl = session.apiUrl || `${jmapBase()}/`;
	/** @type {Record<string, { 'keywords/$seen': boolean }>} */
	const update = {};
	for (const id of ids) update[id] = { 'keywords/$seen': seen };
	const res = await jmapCall(apiUrl, email, password, [
		['Email/set', { accountId, update }, '0']
	]);
	const set = firstResult(res.methodResponses, 'Email/set');
	if (set?.notUpdated && Object.keys(set.notUpdated).length) {
		const first = Object.values(set.notUpdated)[0];
		const detail =
			first && typeof first === 'object'
				? /** @type {any} */ (first).description || /** @type {any} */ (first).type
				: '';
		throw new Error(detail || 'JMAP could not update $seen');
	}
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
