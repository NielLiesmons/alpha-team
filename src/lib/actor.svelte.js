/**
 * Device “signed in as” — mailbox email (not Drive session, not pubkey).
 * See ADR-identity-chat-drive-comments.
 */

const KEY = 'alpha-admin-actor.v1';

/** @type {{ email: string }} */
export const actor = $state({ email: '' });

/** Local member directory for assignees / pickers (email = account id). */
export const members = [
	{ email: 'niel@bley.farm', name: 'Niel' },
	{ email: 'sarah@bley.farm', name: 'Sarah' }
];

export function loadActor() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (typeof parsed.email === 'string') actor.email = parsed.email.trim().toLowerCase();
	} catch {
		/* ignore */
	}
}

/**
 * @param {string} email
 */
export function setActiveEmail(email) {
	actor.email = email.trim().toLowerCase();
	localStorage.setItem(KEY, JSON.stringify({ email: actor.email }));
}

/**
 * @param {string} [email]
 */
export function displayNameFromEmail(email = actor.email) {
	const e = (email || '').trim().toLowerCase();
	if (!e) return 'You';
	const known = members.find((m) => m.email === e);
	if (known) return known.name;
	const local = e.split('@')[0] || e;
	return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Person object for UI stacks — always keyed by email. */
export function activePerson() {
	const email = actor.email || 'you@local';
	return { email, name: displayNameFromEmail(email) };
}

/**
 * Normalize legacy pubkey-shaped authors and email strings.
 * @param {unknown} value
 * @returns {{ email: string, name: string } | null}
 */
export function asPerson(value) {
	if (!value) return null;
	if (typeof value === 'string') {
		const email = value.trim().toLowerCase();
		if (!email) return null;
		return { email, name: displayNameFromEmail(email) };
	}
	if (typeof value === 'object') {
		const o = /** @type {{ email?: string, name?: string, pubkey?: string }} */ (value);
		const email = (o.email || o.pubkey || '').trim().toLowerCase();
		if (!email && o.name) return { email: o.name.toLowerCase(), name: o.name };
		if (!email) return null;
		return { email, name: o.name || displayNameFromEmail(email) };
	}
	return null;
}
