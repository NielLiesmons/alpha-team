/**
 * Space-wide bootstrap secrets on Drive (`meta/space-secrets.json`).
 * Shared family root already grants every member the same cryptree — this file
 * lets invites / reinstalls hydrate mailbox + publications tokens without
 * typing them in Settings.
 *
 * Schema: alpha.space_secrets/1
 */

import { getPath, putPath } from './client.js';
import { activeSession } from './session.svelte.js';

export const SPACE_SECRETS_PATH = 'meta/space-secrets.json';

/**
 * @typedef {{
 *   schema: 'alpha.space_secrets/1',
 *   mailboxes: Record<string, string>,
 *   adminToken?: string
 * }} SpaceSecrets
 */

/** @returns {SpaceSecrets} */
function emptyDoc() {
	return { schema: 'alpha.space_secrets/1', mailboxes: {} };
}

/**
 * @param {unknown} raw
 * @returns {SpaceSecrets}
 */
function parseDoc(raw) {
	let doc = raw;
	if (typeof raw === 'string') {
		try {
			doc = JSON.parse(raw);
		} catch {
			return emptyDoc();
		}
	}
	if (!doc || typeof doc !== 'object') return emptyDoc();
	const o = /** @type {Record<string, unknown>} */ (doc);
	/** @type {Record<string, string>} */
	const mailboxes = {};
	const box = o.mailboxes;
	if (box && typeof box === 'object') {
		for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (box))) {
			const email = String(k || '')
				.trim()
				.toLowerCase();
			const pw = String(v || '').trim();
			if (email.includes('@') && pw) mailboxes[email] = pw;
		}
	}
	/** @type {SpaceSecrets} */
	const out = { schema: 'alpha.space_secrets/1', mailboxes };
	const tok = typeof o.adminToken === 'string' ? o.adminToken.trim() : '';
	if (tok) out.adminToken = tok;
	return out;
}

/**
 * @param {import('./client.js').DriveSession | null | undefined} [session]
 * @returns {Promise<SpaceSecrets>}
 */
export async function loadSpaceSecrets(session) {
	const s = session || activeSession();
	if (!s?.url || !s?.token || !s?.rootKey) return emptyDoc();
	try {
		const raw = await getPath(s, SPACE_SECRETS_PATH);
		return parseDoc(raw);
	} catch {
		return emptyDoc();
	}
}

/**
 * @param {import('./client.js').DriveSession | null | undefined} session
 * @param {SpaceSecrets} doc
 */
async function writeDoc(session, doc) {
	const s = session || activeSession();
	if (!s?.url || !s?.token || !s?.rootKey) throw new Error('Drive not connected');
	const body = {
		schema: 'alpha.space_secrets/1',
		mailboxes: { ...doc.mailboxes },
		...(doc.adminToken ? { adminToken: doc.adminToken } : {})
	};
	await putPath(s, SPACE_SECRETS_PATH, 'blob', JSON.stringify(body, null, 2));
}

/**
 * @param {string} email
 * @param {string} password
 * @param {import('./client.js').DriveSession | null | undefined} [session]
 */
export async function upsertMailboxSecret(email, password, session) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	const pw = String(password || '').trim();
	if (!e.includes('@') || !pw) return;
	const s = session || activeSession();
	const doc = await loadSpaceSecrets(s);
	if (doc.mailboxes[e] === pw) return;
	doc.mailboxes[e] = pw;
	await writeDoc(s, doc);
}

/**
 * @param {string} token
 * @param {import('./client.js').DriveSession | null | undefined} [session]
 */
export async function upsertAdminTokenSecret(token, session) {
	const tok = String(token || '').trim();
	if (!tok) return;
	const s = session || activeSession();
	const doc = await loadSpaceSecrets(s);
	if (doc.adminToken === tok) return;
	doc.adminToken = tok;
	await writeDoc(s, doc);
}

/**
 * Resolve mailbox password: local map first, then Drive secrets.
 * @param {string} email
 * @param {import('./client.js').DriveSession | null | undefined} [session]
 * @param {string} [localPassword]
 */
export async function resolveMailboxPassword(email, session, localPassword = '') {
	const local = String(localPassword || '').trim();
	if (local) return local;
	const e = String(email || '')
		.trim()
		.toLowerCase();
	if (!e.includes('@')) return '';
	const doc = await loadSpaceSecrets(session);
	return doc.mailboxes[e] || '';
}

/**
 * Best-effort: seed local mailbox + publications token from Drive after join.
 * @param {import('./client.js').DriveSession} session
 * @param {string} email
 * @param {{ setMailboxPassword: (email: string, password: string) => void, setAdminToken: (token: string) => void, getAdminToken: () => string }} deps
 */
export async function hydrateDeviceFromSpaceSecrets(session, email, deps) {
	const doc = await loadSpaceSecrets(session);
	const e = String(email || '')
		.trim()
		.toLowerCase();
	const pw = e && doc.mailboxes[e] ? doc.mailboxes[e] : '';
	if (pw) deps.setMailboxPassword(e, pw);
	const tok = doc.adminToken || '';
	if (tok && !deps.getAdminToken()) deps.setAdminToken(tok);
	return { mailboxPassword: pw, adminToken: tok };
}
