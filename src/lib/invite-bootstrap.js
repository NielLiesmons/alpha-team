/**
 * Pack + apply Team invite bootstrap (Drive + mailbox + publications token).
 */

import { getAdminToken, setAdminToken } from './mail-api.js';
import { getMailboxPassword, setMailboxPassword } from './jmap-mail.js';
import {
	hydrateDeviceFromSpaceSecrets,
	resolveMailboxPassword,
	upsertAdminTokenSecret,
	upsertMailboxSecret
} from './drive/space-secrets.js';
import { driveSession } from './drive/session.svelte.js';

/**
 * Build invite session fields for encodeInvite (resolves mailbox + pubs from Drive).
 * @param {{
 *   email: string,
 *   displayName?: string,
 *   role?: 'owner' | 'admin' | 'member',
 *   mailboxPassword?: string
 * }} profile
 * @returns {Promise<import('./drive/invite.js').InviteSession>}
 */
export async function buildInviteSession(profile) {
	const email = String(profile.email || '')
		.trim()
		.toLowerCase();
	if (!driveSession.connected || !driveSession.url || !driveSession.token || !driveSession.rootKey) {
		throw new Error('Connect Drive first.');
	}
	const localPw = profile.mailboxPassword || getMailboxPassword(email);
	const mailboxPassword = await resolveMailboxPassword(
		email,
		{
			url: driveSession.url,
			token: driveSession.token,
			rootKey: driveSession.rootKey
		},
		localPw
	);
	/** Prefer live local / env token; fall back to Drive-stored space secrets. */
	let token = getAdminToken();
	{
		const { loadSpaceSecrets } = await import('./drive/space-secrets.js');
		const secrets = await loadSpaceSecrets({
			url: driveSession.url,
			token: driveSession.token,
			rootKey: driveSession.rootKey
		});
		if (!token && secrets.adminToken) token = secrets.adminToken;
		/* Keep Drive warm when this device already has the pubs token. */
		if (token && secrets.adminToken !== token) {
			try {
				await upsertAdminTokenSecret(token, {
					url: driveSession.url,
					token: driveSession.token,
					rootKey: driveSession.rootKey
				});
			} catch {
				/* read-only */
			}
		}
	}
	return {
		url: driveSession.url,
		token: driveSession.token,
		rootKey: driveSession.rootKey,
		email,
		...(profile.displayName?.trim() ? { displayName: profile.displayName.trim() } : {}),
		...(profile.role === 'owner' || profile.role === 'admin' || profile.role === 'member'
			? { role: profile.role }
			: {}),
		...(mailboxPassword ? { mailboxPassword } : {}),
		...(token ? { adminToken: token } : {})
	};
}

/**
 * Persist secrets onto Drive so future reshare/reinstall invites stay complete.
 * @param {string} email
 * @param {string} [mailboxPassword]
 * @param {string} [adminToken]
 */
export async function persistInviteSecrets(email, mailboxPassword, adminToken) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	const session = driveSession.connected
		? {
				url: driveSession.url,
				token: driveSession.token,
				rootKey: driveSession.rootKey
			}
		: null;
	if (!session?.url) return;
	try {
		if (mailboxPassword) await upsertMailboxSecret(e, mailboxPassword, session);
		const tok = adminToken || getAdminToken();
		if (tok) await upsertAdminTokenSecret(tok, session);
	} catch (err) {
		console.warn('persist invite secrets', err);
	}
}

/**
 * Apply decoded invite (+ Drive space secrets) onto this device.
 * @param {import('./drive/invite.js').InviteSession} session
 */
export async function applyInviteBootstrap(session) {
	const email = String(session.email || '')
		.trim()
		.toLowerCase();
	if (session.mailboxPassword && email) {
		setMailboxPassword(email, session.mailboxPassword);
	}
	if (session.adminToken) {
		setAdminToken(session.adminToken);
	}
	/* Fill any gaps from Drive after session is saved. */
	try {
		await hydrateDeviceFromSpaceSecrets(session, email, {
			setMailboxPassword,
			setAdminToken,
			getAdminToken
		});
	} catch (e) {
		console.warn('hydrate from space secrets', e);
	}
	/* Keep Drive copy warm for the next device. */
	await persistInviteSecrets(
		email,
		session.mailboxPassword || (email ? getMailboxPassword(email) : ''),
		session.adminToken || getAdminToken()
	);
}
