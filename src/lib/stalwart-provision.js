/**
 * Stalwart mailbox provisioning — called from Admin, never from the Stalwart UI.
 *
 * v0: stub. Wire to Stalwart management / principals API next so Invite creates
 * the IMAP/JMAP account automatically.
 */

/**
 * @typedef {{
 *   email: string,
 *   password: string,
 *   displayName?: string
 * }} ProvisionInput
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   deferred?: boolean,
 *   error?: string
 * }} ProvisionResult
 */

/**
 * Create or update a mailbox principal.
 * @param {ProvisionInput} input
 * @returns {Promise<ProvisionResult>}
 */
export async function provisionMailbox(input) {
	const email = String(input.email || '')
		.trim()
		.toLowerCase();
	if (!email.includes('@')) {
		return { ok: false, error: 'Invalid email' };
	}
	if (!String(input.password || '').trim()) {
		return { ok: false, error: 'Password required' };
	}

	/*
	 * TODO: POST to Stalwart management API (or local alpha-api proxy) to:
	 *   - create principal for `email`
	 *   - set password
	 *   - ensure domain tenant exists
	 * Until then, owner creates the box once in Stalwart (or we seed) and the
	 * invite still carries the password so the invitee never types mail fields.
	 */
	console.info('[stalwart-provision] deferred', email, input.displayName || '');
	return { ok: false, deferred: true };
}

/**
 * Disable a mailbox (revoke login) without deleting mail store.
 * @param {string} email
 * @returns {Promise<ProvisionResult>}
 */
export async function disableMailbox(email) {
	console.info('[stalwart-provision] disable deferred', email);
	return { ok: false, deferred: true };
}

/** Random mailbox password for invites (invitee never chooses until reset). */
export function generateMailboxPassword(bytes = 12) {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
	const buf = crypto.getRandomValues(new Uint8Array(bytes));
	let out = '';
	for (const b of buf) out += alphabet[b % alphabet.length];
	return out;
}
