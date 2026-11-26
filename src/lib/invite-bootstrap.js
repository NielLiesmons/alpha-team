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
 * Resolve or mint a mailbox password for invite/reshare (provision Stalwart + space-secrets).
 * Existing Drive/local secrets win; otherwise create a fresh Stalwart password so Mail is OOTB.
 * @param {string} email
 * @param {string} [displayName]
 * @returns {Promise<string>}
 */
export async function ensureInviteMailboxSecret(email, displayName = '') {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	if (!e.includes('@')) throw new Error('Invalid email');
	if (!driveSession.connected || !driveSession.url || !driveSession.token || !driveSession.rootKey) {
		throw new Error('Connect Drive first.');
	}
	const session = {
		url: driveSession.url,
		token: driveSession.token,
		rootKey: driveSession.rootKey
	};
	const existing = await resolveMailboxPassword(e, session, getMailboxPassword(e));
	if (existing) return existing;

	const { generateMailboxPassword, provisionMailbox } = await import('./stalwart-provision.js');
	const mailboxPassword = generateMailboxPassword();
	const provision = await provisionMailbox({
		email: e,
		password: mailboxPassword,
		displayName: displayName || e.split('@')[0] || e
	});
	if (!provision.ok && !provision.deferred) {
		throw new Error(provision.error || 'Mailbox provision failed');
	}
	await persistInviteSecrets(e, mailboxPassword);
	setMailboxPassword(e, mailboxPassword);
	return mailboxPassword;
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
 * Ensure the active profile has a mailbox password locally (invite → space-secrets).
 * Call before JMAP so Mail never strands on Drive-drafts-only when Drive has the secret.
 * @param {string} [email]
 * @param {import('./drive/client.js').DriveSession | null | undefined} [session]
 * @returns {Promise<string>} password or ''
 */
export async function ensureMailboxPassword(email, session) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	if (!e.includes('@')) return '';
	const local = getMailboxPassword(e);
	if (local) return local;
	const s =
		session ||
		(driveSession.connected
			? {
					url: driveSession.url,
					token: driveSession.token,
					rootKey: driveSession.rootKey
				}
			: null);
	if (!s?.url || !s?.token || !s?.rootKey) return '';
	try {
		const hydrated = await hydrateDeviceFromSpaceSecrets(s, e, {
			setMailboxPassword,
			setAdminToken,
			getAdminToken,
			getMailboxPassword
		});
		return hydrated.mailboxPassword || getMailboxPassword(e) || '';
	} catch (err) {
		console.warn('ensure mailbox password', err);
		return getMailboxPassword(e) || '';
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
			getAdminToken,
			getMailboxPassword
		});
	} catch (e) {
		console.warn('hydrate from space secrets', e);
	}
	const pw = email ? getMailboxPassword(email) || session.mailboxPassword || '' : '';
	if (email && !String(pw || '').trim()) {
		throw new Error(
			'This invite has no mailbox password — ask an admin for a fresh invite so Mail works without Settings.'
		);
	}
	/* Keep Drive copy warm for the next device. */
	await persistInviteSecrets(email, pw, session.adminToken || getAdminToken());
}
