/**
 * Approved mail contacts — Primary only shows senders you've accepted
 * after a first contact. Stored per mailbox in localStorage for now.
 * Space members count as approved (they're already in the circle).
 */

import { actor } from './actor.svelte.js';
import { members } from './members.svelte.js';

/** @type {Set<string>} */
let approved = $state(new Set());

/** @type {string} */
let loadedFor = '';

function storageKey(email) {
	return `alpha.mail.approved.${String(email || '')
		.trim()
		.toLowerCase()}`;
}

function norm(email) {
	return String(email || '')
		.trim()
		.toLowerCase();
}

function ensureLoaded() {
	const me = norm(actor.email);
	if (!me || loadedFor === me) return;
	loadedFor = me;
	approved = new Set();
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(storageKey(me));
		const list = raw ? JSON.parse(raw) : [];
		if (Array.isArray(list)) {
			approved = new Set(list.map(norm).filter(Boolean));
		}
	} catch {
		approved = new Set();
	}
}

function persist() {
	const me = norm(actor.email);
	if (!me || typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(storageKey(me), JSON.stringify([...approved]));
	} catch {
		/* quota / private mode */
	}
}

/** Reactive snapshot for derived filters. */
export function approvedContacts() {
	ensureLoaded();
	actor.email;
	members.length;
	return approved;
}

/**
 * @param {string} email
 */
export function isApprovedContact(email) {
	ensureLoaded();
	actor.email;
	members.length;
	const e = norm(email);
	if (!e) return false;
	if (approved.has(e)) return true;
	/* Space members are already trusted */
	return members.some((m) => norm(m.email) === e);
}

/**
 * @param {string} email
 */
export function approveContact(email) {
	ensureLoaded();
	const e = norm(email);
	if (!e) return;
	if (approved.has(e)) return;
	approved = new Set([...approved, e]);
	persist();
}

/**
 * @param {string} email
 */
export function revokeContact(email) {
	ensureLoaded();
	const e = norm(email);
	if (!e || !approved.has(e)) return;
	const next = new Set(approved);
	next.delete(e);
	approved = next;
	persist();
}
