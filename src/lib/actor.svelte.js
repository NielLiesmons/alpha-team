/**
 * Device “signed in as” — mailbox email (not Drive session, not pubkey).
 * Shared with Player via cookie Domain=.{apex} (see cross-domain-storage.js).
 * See ADR-identity-chat-drive-comments.
 */

import {
	ACTOR_KEY,
	ACTOR_LEGACY_KEYS,
	clearShared,
	readShared,
	writeShared
} from './cross-domain-storage.js';
import { memberFor, members } from './members.svelte.js';

/** @type {{ email: string }} */
export const actor = $state({ email: '' });

/** Re-export directory for assignee pickers (Drive-backed when connected). */
export { members };

export function loadActor() {
	try {
		const raw = readShared(ACTOR_KEY, ACTOR_LEGACY_KEYS);
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
	writeShared(ACTOR_KEY, JSON.stringify({ email: actor.email }));
}

export function clearActor() {
	actor.email = '';
	clearShared(ACTOR_KEY, ACTOR_LEGACY_KEYS);
}

/**
 * @param {string} [email]
 */
export function displayNameFromEmail(email = actor.email) {
	const e = (email || '').trim().toLowerCase();
	const isAnon = !e || e === 'you@local' || e === 'local' || e === 'you';
	if (isAnon) {
		const signedIn = (actor.email || '').trim().toLowerCase();
		if (signedIn && signedIn !== e && !['you@local', 'local', 'you'].includes(signedIn)) {
			const known = memberFor(signedIn);
			if (known) return known.name;
			const local = signedIn.split('@')[0] || signedIn;
			return local.charAt(0).toUpperCase() + local.slice(1);
		}
		return 'You';
	}
	const known = memberFor(e);
	if (known) return known.name;
	const local = e.split('@')[0] || e;
	return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Person object for UI stacks — always keyed by email. */
export function activePerson() {
	const email = (actor.email || '').trim().toLowerCase();
	if (!email) return { email: '', name: 'You', picture: undefined };
	const known = memberFor(email);
	return {
		email,
		name: displayNameFromEmail(email),
		...(known?.picture ? { picture: known.picture } : {})
	};
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
