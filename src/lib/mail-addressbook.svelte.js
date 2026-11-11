/**
 * Recipient suggestions for compose.
 * Stalwart ContactCard (the mailbox address book) is the list.
 * People already on loaded messages fill addresses that are not cards yet.
 */

import { actor } from './actor.svelte.js';
import { getMailboxPassword, listJmapContacts } from './jmap-mail.js';
import { mailMessages } from './mail.svelte.js';

/** @type {{ email: string, name: string }[]} */
export const mailAddressBook = $state([]);

function norm(email) {
	return String(email || '')
		.trim()
		.toLowerCase();
}

/**
 * @param {{ email: string, name?: string }[]} rows
 */
function remember(rows) {
	/** @type {Map<string, string>} */
	const map = new Map();
	const me = norm(actor.email);
	for (const row of rows) {
		const email = norm(row.email);
		if (!email.includes('@') || email === me) continue;
		const name = String(row.name || '').trim();
		if (!map.has(email)) map.set(email, name);
		else if (!map.get(email) && name) map.set(email, name);
	}
	return [...map.entries()].map(([email, name]) => ({ email, name }));
}

/** Addresses already sitting in the loaded mailbox. */
function correspondents() {
	/** @type {{ email: string, name: string }[]} */
	const rows = [];
	for (const thread of mailMessages) {
		const msgs = Array.isArray(thread?.messages) ? thread.messages : [thread];
		for (const msg of msgs) {
			const from = norm(msg?.from);
			if (from) rows.push({ email: from, name: String(msg?.from_name || '').trim() });
			const tos = Array.isArray(msg?.to) ? msg.to : [];
			for (const to of tos) rows.push({ email: norm(to), name: '' });
		}
	}
	return rows;
}

/** @type {Promise<void> | null} */
let inflight = null;

/** Load the Stalwart address book, then paint it. */
export function refreshMailAddressBook() {
	if (inflight) return inflight;
	const email = norm(actor.email);
	const password = email ? getMailboxPassword(email) : '';
	inflight = (async () => {
		/** @type {{ email: string, name: string }[]} */
		let cards = [];
		if (email && password) {
			try {
				cards = await listJmapContacts(email, password);
			} catch {
				cards = [];
			}
		}
		const next = remember([...cards, ...correspondents()]);
		mailAddressBook.splice(0, mailAddressBook.length, ...next);
	})().finally(() => {
		inflight = null;
	});
	return inflight;
}
