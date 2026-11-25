/**
 * Stalwart mailbox provisioning — called from Admin invite mint, never from the Stalwart UI.
 *
 * Creates/resets the IMAP/JMAP account via alpha-api → Stalwart JMAP management
 * (`POST /v1/projects/{project}/mailboxes`). Invitee never types mail fields —
 * the invite carries the password and redeem hydrates localStorage + space-secrets.
 */

import { adminApi } from './mail-api.js';
import { projectSlug } from './space-host.js';

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
 *   error?: string,
 *   created?: boolean
 * }} ProvisionResult
 */

/**
 * Create or update a mailbox principal on Stalwart for this Space.
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

	const project = projectSlug();
	try {
		const data = await adminApi(`/v1/projects/${encodeURIComponent(project)}/mailboxes`, {
			method: 'POST',
			body: JSON.stringify({
				email,
				password: String(input.password).trim(),
				display_name: input.displayName?.trim() || undefined
			})
		});
		if (data?.deferred) {
			console.info('[stalwart-provision] deferred (API missing STALWART_ADMIN_SECRET)', email);
			return { ok: false, deferred: true };
		}
		if (data?.ok) {
			console.info(
				'[stalwart-provision] ok',
				email,
				data.created === false ? 'updated' : 'created'
			);
			return { ok: true, created: data.created !== false };
		}
		return { ok: false, error: data?.error || data?.message || 'Mailbox provision failed' };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.warn('[stalwart-provision] failed', email, msg);
		return { ok: false, error: msg };
	}
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
