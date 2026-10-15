/**
 * Passphrase-wrapped Drive session invite (QR / paste).
 * Schema: alpha.drive.invite/1 — see ADR-identity-chat-drive-comments.
 */

const PREFIX = 'alpha-drive-invite:v1:';
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
 * @param {{ url: string, token: string, rootKey: string }} session
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

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(pass, salt);
	const plain = new TextEncoder().encode(
		JSON.stringify({
			schema: 'alpha.drive.invite/1',
			url,
			token,
			rootKey
		})
	);
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
	const packed = new Uint8Array(salt.length + iv.length + ct.length);
	packed.set(salt, 0);
	packed.set(iv, salt.length);
	packed.set(ct, salt.length + iv.length);
	return PREFIX + b64url(packed);
}

/**
 * @param {string} payload
 * @param {string} passphrase
 * @returns {Promise<{ url: string, token: string, rootKey: string }>}
 */
export async function decodeInvite(payload, passphrase) {
	const raw = payload.trim().replace(/\s+/g, '');
	if (!raw.startsWith(PREFIX)) throw new Error('Not an Alpha Drive invite');
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
	return {
		url: String(doc.url).replace(/\/$/, ''),
		token: String(doc.token).trim(),
		rootKey: String(doc.rootKey).trim()
	};
}

export function isInvitePayload(text) {
	return String(text ?? '')
		.trim()
		.replace(/\s+/g, '')
		.startsWith(PREFIX);
}
