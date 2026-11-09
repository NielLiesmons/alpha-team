/**
 * Approved mail contacts — Primary only shows senders you've accepted.
 * localStorage for instant paint; Space Drive mirror so every device shares the same Primary.
 * Space members count as approved.
 */

import { actor } from './actor.svelte.js';
import { getPath, putPath } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';
import { members } from './members.svelte.js';

const LOCAL_KEY = 'alpha.mail.approved.v1';
const DRIVE_PATH = 'mail/approved-contacts.json';

/** @type {Set<string>} */
let approved = $state(new Set());

/** @type {string} */
let loadedFor = '';

/** Approvals queued before actor email is known. */
/** @type {Set<string>} */
let pending = new Set();

/** Mailbox email we last successfully synced from Drive (empty = not yet). */
let driveSyncedFor = '';

/** In-flight Drive hydrate so we don't stampede. */
/** @type {Promise<void> | null} */
let driveHydratePromise = null;

function norm(email) {
	return String(email || '')
		.trim()
		.toLowerCase();
}

/**
 * @returns {Record<string, string[]>}
 */
function readAllLocal() {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(LOCAL_KEY);
		const doc = raw ? JSON.parse(raw) : null;
		if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
			/** @type {Record<string, string[]>} */
			const out = {};
			for (const [k, v] of Object.entries(doc)) {
				if (Array.isArray(v)) out[norm(k)] = v.map(norm).filter(Boolean);
			}
			return out;
		}
		return {};
	} catch {
		return {};
	}
}

/**
 * Migrate old `alpha.mail.approved.${email}` keys into v1 map.
 * @param {Record<string, string[]>} map
 * @param {string} me
 */
function migrateLegacy(map, me) {
	if (typeof localStorage === 'undefined' || !me) return map;
	try {
		const legacyKey = `alpha.mail.approved.${me}`;
		const raw = localStorage.getItem(legacyKey);
		if (!raw) return map;
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return map;
		const merged = new Set([...(map[me] || []), ...list.map(norm).filter(Boolean)]);
		map[me] = [...merged];
		localStorage.removeItem(legacyKey);
		writeAllLocal(map);
	} catch {
		/* ignore */
	}
	return map;
}

/**
 * @param {Record<string, string[]>} map
 */
function writeAllLocal(map) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
	} catch {
		/* quota / private mode */
	}
}

function ensureLoaded() {
	const me = norm(actor.email);
	const key = me || '__pending__';
	if (loadedFor === key) {
		scheduleDriveHydrate(me);
		return;
	}

	const map = migrateLegacy(readAllLocal(), me);
	/** @type {Set<string>} */
	const next = new Set(pending);
	if (me && Array.isArray(map[me])) {
		for (const e of map[me]) next.add(e);
	}
	approved = next;
	loadedFor = key;

	if (me && pending.size) {
		pending = new Set();
		persistLocal();
	}

	scheduleDriveHydrate(me);
}

/**
 * Only mark Drive synced after a real session hydrate attempt.
 * @param {string} me
 */
function scheduleDriveHydrate(me) {
	if (!me) return;
	if (driveSyncedFor === me) return;
	const session = activeSession();
	if (!session) return;
	if (driveHydratePromise) return;
	driveHydratePromise = hydrateFromDrive(me)
		.catch(() => {})
		.finally(() => {
			driveHydratePromise = null;
		});
}

function persistLocal() {
	const me = norm(actor.email);
	if (!me) {
		pending = new Set([...approved]);
		return;
	}
	const map = readAllLocal();
	map[me] = [...approved];
	writeAllLocal(map);
	void persistDrive(me);
}

/**
 * @param {any} doc
 * @param {string} me
 * @returns {string[]}
 */
function emailsFromDriveDoc(doc, me) {
	if (!doc || typeof doc !== 'object') return [];
	const byMailbox = doc.mailboxes;
	if (byMailbox && typeof byMailbox === 'object' && Array.isArray(byMailbox[me])) {
		return byMailbox[me].map(norm).filter(Boolean);
	}
	if (Array.isArray(doc.emails)) return doc.emails.map(norm).filter(Boolean);
	if (Array.isArray(doc)) return doc.map(norm).filter(Boolean);
	return [];
}

/**
 * @param {string} me
 */
async function hydrateFromDrive(me) {
	const session = activeSession();
	if (!session || !me) return;
	try {
		const bytes = await getPath(session, DRIVE_PATH);
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		const list = emailsFromDriveDoc(doc, me);
		ensureLoadedLocalOnly(me);
		const merged = new Set([...approved, ...list]);
		driveSyncedFor = me;
		if (merged.size === approved.size && [...merged].every((e) => approved.has(e))) {
			/* Still rewrite Drive in mailbox shape if we only had a flat legacy file. */
			if (!doc?.mailboxes?.[me] && list.length) void persistDrive(me);
			return;
		}
		approved = merged;
		const map = readAllLocal();
		map[me] = [...approved];
		writeAllLocal(map);
		/* Push merge back so other devices see local-only approvals too. */
		void persistDrive(me);
	} catch {
		/* missing leaf — still mark synced so we can create on first approve */
		driveSyncedFor = me;
	}
}

/** Load local without re-entering Drive scheduling. */
function ensureLoadedLocalOnly(me) {
	const key = me || '__pending__';
	if (loadedFor === key) return;
	const map = migrateLegacy(readAllLocal(), me);
	/** @type {Set<string>} */
	const next = new Set(pending);
	if (me && Array.isArray(map[me])) {
		for (const e of map[me]) next.add(e);
	}
	approved = next;
	loadedFor = key;
}

/**
 * @param {string} me
 */
async function persistDrive(me) {
	const session = activeSession();
	if (!session || !me) return;
	try {
		/** @type {Record<string, string[]>} */
		let mailboxes = {};
		try {
			const bytes = await getPath(session, DRIVE_PATH);
			const doc = JSON.parse(new TextDecoder().decode(bytes));
			if (doc?.mailboxes && typeof doc.mailboxes === 'object') {
				mailboxes = { ...doc.mailboxes };
			} else if (Array.isArray(doc?.emails) && doc.emails.length) {
				/* Legacy flat list — keep under this mailbox */
				mailboxes[me] = doc.emails.map(norm).filter(Boolean);
			}
		} catch {
			/* create fresh */
		}
		mailboxes[me] = [...approved];
		await putPath(
			session,
			DRIVE_PATH,
			'blob',
			JSON.stringify({
				schema: 'alpha.mail_approved/1',
				mailboxes,
				/* Legacy flat field for older clients — same as this mailbox */
				emails: [...approved],
				updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
			})
		);
	} catch (e) {
		console.warn('mail approved persist', e);
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
	return members.some((m) => norm(m.email) === e);
}

/**
 * @param {string} email
 */
export function approveContact(email) {
	ensureLoaded();
	const e = norm(email);
	if (!e) return;
	if (approved.has(e)) {
		persistLocal(); /* ensure durable even if earlier persist no-oped */
		return;
	}
	approved = new Set([...approved, e]);
	persistLocal();
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
	persistLocal();
}

/** Re-read local + Drive after actor/session is ready. */
export function refreshApprovedContacts() {
	loadedFor = '';
	driveSyncedFor = '';
	driveHydratePromise = null;
	ensureLoaded();
}

/**
 * Call once the Drive session is alive so Primary approvals hydrate across devices.
 */
export async function syncApprovedContactsFromDrive() {
	const me = norm(actor.email);
	if (!me) return;
	driveSyncedFor = '';
	driveHydratePromise = null;
	ensureLoaded();
	if (driveHydratePromise) await driveHydratePromise;
}
