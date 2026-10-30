/**
 * Passphrase-wrapped member invite (QR / share link).
 * Schema: alpha.drive.invite/2 — Drive session + email + role + mailbox password.
 * Legacy /1 (Drive only) still decodes. See ADR-identity-chat-drive-comments.
 *
 * Share as a URL: https://admin…/join?i=<payload>
 * Opener only needs the passphrase when email is embedded.
 */

export const INVITE_PREFIX = 'alpha-drive-invite:v1:';
const PREFIX = INVITE_PREFIX;
const PBKDF2_ITERS = 210_000;

/**
 * @param {Uint8Array} bytes
 */
function b64url(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} s
 */
function b64urlToBytes(s) {
	const pad = '='.repeat((4 - (s.length % 4)) % 4);
	const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * @param {string} passphrase
 * @param {Uint8Array} salt
 */
async function deriveKey(passphrase, salt) {
	const base = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(passphrase),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/**
 * @typedef {{
 *   url: string,
 *   token: string,
 *   rootKey: string,
 *   email?: string,
 *   displayName?: string,
 *   role?: 'owner' | 'admin' | 'member',
 *   mailboxPassword?: string
 * }} InviteSession
 */

/**
 * @param {InviteSession} session
 * @param {string} passphrase
 * @returns {Promise<string>} QR / paste payload
 */
export async function encodeInvite(session, passphrase) {
	const pass = passphrase.trim();
	if (pass.length < 6) throw new Error('Passphrase must be at least 6 characters');
	const url = session.url?.trim().replace(/\/$/, '');
	const token = session.token?.trim();
	const rootKey = session.rootKey?.trim();
	if (!url || !token || !rootKey) throw new Error('Drive session is incomplete');

	const email = String(session.email || '')
		.trim()
		.toLowerCase();
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(pass, salt);
	/** @type {Record<string, unknown>} */
	const body = {
		schema: 'alpha.drive.invite/2',
		url,
		token,
		rootKey
	};
	if (email.includes('@')) {
		body.email = email;
		if (session.displayName?.trim()) body.displayName = session.displayName.trim();
		if (session.role === 'owner' || session.role === 'admin' || session.role === 'member') {
			body.role = session.role;
		}
		if (session.mailboxPassword?.trim()) {
			body.mailboxPassword = session.mailboxPassword.trim();
		}
	}
	const plain = new TextEncoder().encode(JSON.stringify(body));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
	const packed = new Uint8Array(salt.length + iv.length + ct.length);
	packed.set(salt, 0);
	packed.set(iv, salt.length);
	packed.set(ct, salt.length + iv.length);
	return PREFIX + b64url(packed);
}

/**
 * Pull invite payload from a raw token, paste blob, or share URL.
 * @param {string} input
 * @returns {string} canonical `alpha-drive-invite:v1:…` payload
 */
export function extractInvitePayload(input) {
	const text = String(input ?? '').trim();
	if (!text) throw new Error('No invite');

	const compact = text.replace(/\s+/g, '');
	if (compact.startsWith(PREFIX)) return compact;

	/** @param {string} value */
	function fromParam(value) {
		const v = decodeURIComponent(String(value ?? '').trim()).replace(/\s+/g, '');
		if (!v) return null;
		if (v.startsWith(PREFIX)) return v;
		/* bare ciphertext from ?i= */
		if (/^[A-Za-z0-9_-]+$/.test(v) && v.length >= 48) return PREFIX + v;
		return null;
	}

	try {
		const u = new URL(text);
		const q =
			fromParam(u.searchParams.get('i') || '') ||
			fromParam(u.searchParams.get('invite') || '');
		if (q) return q;

		const hash = u.hash.replace(/^#/, '');
		if (hash.startsWith(PREFIX)) return hash.replace(/\s+/g, '');
		if (hash.includes('=')) {
			const hp = new URLSearchParams(hash);
			const h =
				fromParam(hp.get('i') || '') || fromParam(hp.get('invite') || '');
			if (h) return h;
		} else {
			const bare = fromParam(hash);
			if (bare) return bare;
		}
	} catch {
		/* not a URL — try bare token */
	}

	const bare = fromParam(compact);
	if (bare) return bare;
	throw new Error('Not an Alpha Drive invite link or code');
}

/**
 * Build a one-tap share URL (passphrase still required on open).
 * @param {string} payload canonical invite payload
 * @param {string} [origin]
 */
export function inviteShareUrl(payload, origin) {
	const raw = extractInvitePayload(payload);
	const token = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
	const base =
		(origin || (typeof location !== 'undefined' ? location.origin : '') || 'https://admin.bley.farm').replace(
			/\/$/,
			''
		);
	return `${base}/join?i=${encodeURIComponent(token)}`;
}

/**
 * Read invite from the current page URL (query or hash), if any.
 * @param {URL | Location | string} [href]
 * @returns {string | null}
 */
export function invitePayloadFromLocation(href) {
	try {
		const u =
			typeof href === 'string'
				? new URL(href, typeof location !== 'undefined' ? location.origin : 'https://admin.bley.farm')
				: href instanceof URL
					? href
					: new URL(String(href?.href || location.href));
		return extractInvitePayload(u.href);
	} catch {
		return null;
	}
}

/**
 * @param {string} payloadOrUrl
 * @param {string} passphrase
 * @returns {Promise<InviteSession>}
 */
export async function decodeInvite(payloadOrUrl, passphrase) {
	const raw = extractInvitePayload(payloadOrUrl);
	const pass = passphrase.trim();
	if (!pass) throw new Error('Enter the passphrase');

	const packed = b64urlToBytes(raw.slice(PREFIX.length));
	if (packed.length < 16 + 12 + 16) throw new Error('Invite looks truncated');
	const salt = packed.slice(0, 16);
	const iv = packed.slice(16, 28);
	const ct = packed.slice(28);
	const key = await deriveKey(pass, salt);
	let plain;
	try {
		plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
	} catch {
		throw new Error('Wrong passphrase or damaged invite');
	}
	const doc = JSON.parse(new TextDecoder().decode(plain));
	if (!doc?.url || !doc?.token || !doc?.rootKey) throw new Error('Invite missing credentials');
	/** @type {InviteSession} */
	const out = {
		url: String(doc.url).replace(/\/$/, ''),
		token: String(doc.token).trim(),
		rootKey: String(doc.rootKey).trim()
	};
	const email = String(doc.email || '')
		.trim()
		.toLowerCase();
	if (email.includes('@')) out.email = email;
	if (typeof doc.displayName === 'string' && doc.displayName.trim()) {
		out.displayName = doc.displayName.trim();
	}
	if (doc.role === 'owner' || doc.role === 'admin' || doc.role === 'member') {
		out.role = doc.role;
	}
	if (typeof doc.mailboxPassword === 'string' && doc.mailboxPassword.trim()) {
		out.mailboxPassword = doc.mailboxPassword.trim();
	}
	return out;
}

export function isInvitePayload(text) {
	try {
		extractInvitePayload(text);
		return true;
	} catch {
		return false;
	}
}
