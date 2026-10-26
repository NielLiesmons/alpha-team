/**
 * Stalwart JMAP client for personal mailboxes (mail.bley.farm).
 * Auth: HTTP Basic with mailbox email + password (or app password).
 */

export const JMAP_ORIGIN = 'https://mail.bley.farm';

const PW_KEY = 'alpha-admin-mailbox-pw.v1';

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
	const res = await fetch(`${JMAP_ORIGIN}/jmap/session`, {
		headers: {
			Accept: 'application/json',
			Authorization: basicAuth(email, password)
		}
	});
	if (res.status === 401) throw new Error('Mailbox password rejected by Stalwart');
	if (!res.ok) throw new Error(`JMAP session HTTP ${res.status}`);
	return /** @type {any} */ (await res.json());
}

/**
 * @param {string} apiUrl
 * @param {string} email
 * @param {string} password
 * @param {any[]} methodCalls
 */
async function jmapCall(apiUrl, email, password, methodCalls) {
	const res = await fetch(apiUrl, {
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
	if (row[0] === 'error') throw new Error(row[1]?.description || 'JMAP error');
	return row[1];
}

/**
 * Map JMAP Email → Admin mail row shape.
 * @param {any} email
 */
function toUiMessage(email) {
	const from =
		email?.from?.[0]?.email ||
		email?.sender?.[0]?.email ||
		'';
	const to = (email?.to || []).map((a) => a.email).filter(Boolean);
	const created =
		email?.receivedAt || email?.sentAt || new Date().toISOString();
	return {
		schema: 'alpha.mail_message/1',
		id: email.id,
		from: String(from).toLowerCase(),
		to: to.map((e) => String(e).toLowerCase()),
		subject: email.subject || '(no subject)',
		body: email.preview || email.textBody?.[0] || '',
		created_at: created,
		transport: 'jmap',
		read_by: email.keywords?.$seen ? [String(from).toLowerCase()] : [],
		_jmap: email,
		_unread: !email.keywords?.$seen
	};
}

/**
 * List recent messages from Inbox + Sent via Stalwart JMAP.
 * @param {string} email
 * @param {string} password
 * @param {number} [limit]
 */
export async function listJmapMailbox(email, password, limit = 100) {
	const session = await jmapSession(email, password);
	const accountId = primaryMailAccountId(session);
	const apiUrl = session.apiUrl || `${JMAP_ORIGIN}/jmap/`;

	const boxes = await jmapCall(apiUrl, email, password, [
		[
			'Mailbox/get',
			{ accountId, ids: null, properties: ['id', 'name', 'role', 'sortOrder'] },
			'0'
		]
	]);
	const mailboxList = firstResult(boxes.methodResponses, 'Mailbox/get')?.list || [];
	const inbox = mailboxList.find((m) => m.role === 'inbox');
	const sent = mailboxList.find((m) => m.role === 'sent');
	const mailboxIds = [inbox?.id, sent?.id].filter(Boolean);
	if (!mailboxIds.length) return [];

	const calls = [];
	if (inbox?.id) {
		calls.push([
			'Email/query',
			{
				accountId,
				filter: { inMailbox: inbox.id },
				sort: [{ property: 'receivedAt', isAscending: false }],
				limit
			},
			'inbox'
		]);
	}
	if (sent?.id) {
		calls.push([
			'Email/query',
			{
				accountId,
				filter: { inMailbox: sent.id },
				sort: [{ property: 'receivedAt', isAscending: false }],
				limit
			},
			'sent'
		]);
	}
	if (!calls.length) return [];
	const scoped = await jmapCall(apiUrl, email, password, calls);
	/** @type {string[]} */
	const ids = [];
	for (const row of scoped.methodResponses || []) {
		if (row[0] === 'Email/query' && Array.isArray(row[1]?.ids)) {
			for (const id of row[1].ids) {
				if (!ids.includes(id)) ids.push(id);
			}
		}
	}
	if (!ids.length) return [];

	const got = await jmapCall(apiUrl, email, password, [
		[
			'Email/get',
			{
				accountId,
				ids,
				properties: [
					'id',
					'subject',
					'from',
					'to',
					'sender',
					'receivedAt',
					'sentAt',
					'preview',
					'keywords',
					'mailboxIds'
				]
			},
			'0'
		]
	]);
	const list = firstResult(got.methodResponses, 'Email/get')?.list || [];
	return list.map(toUiMessage);
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
