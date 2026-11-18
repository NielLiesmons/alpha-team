/**
 * Mail contact triage — Primary / News / Other buckets.
 * localStorage for instant paint; Space Drive mirror so every device shares buckets.
 * Space members count as Primary.
 */

import { actor } from './actor.svelte.js';
import { getPath, putPath } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';
import { members } from './members.svelte.js';

const LOCAL_KEY = 'alpha.mail.contacts.v2';
const LEGACY_LOCAL_KEY = 'alpha.mail.approved.v1';
const DRIVE_PATH = 'mail/approved-contacts.json';

/** @typedef {'primary' | 'updates' | 'other'} ContactBucket */

/** @type {Record<string, ContactBucket>} */
let buckets = $state({});

/** @type {string} */
let loadedFor = '';

/** Approvals queued before actor email is known. */
/** @type {Record<string, ContactBucket>} */
let pending = {};

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

/** @returns {Record<string, Record<string, ContactBucket>>} */
function readAllLocal() {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(LOCAL_KEY);
		const doc = raw ? JSON.parse(raw) : null;
		if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
			/** @type {Record<string, Record<string, ContactBucket>>} */
			const out = {};
			for (const [k, v] of Object.entries(doc)) {
				if (v && typeof v === 'object' && !Array.isArray(v)) {
					/** @type {Record<string, ContactBucket>} */
					const map = {};
					for (const [email, bucket] of Object.entries(v)) {
						if (bucket === 'primary' || bucket === 'updates' || bucket === 'other') {
							map[norm(email)] = bucket;
						}
					}
					out[norm(k)] = map;
				}
			}
			return out;
		}
		return {};
	} catch {
		return {};
	}
}

/**
 * Migrate v1 approved arrays + legacy per-mailbox keys into v2 bucket maps.
 * @param {Record<string, Record<string, ContactBucket>>} map
 * @param {string} me
 */
function migrateLegacy(map, me) {
	if (typeof localStorage === 'undefined') return map;
	try {
		const v1raw = localStorage.getItem(LEGACY_LOCAL_KEY);
		if (v1raw) {
			const doc = JSON.parse(v1raw);
			if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
				for (const [k, list] of Object.entries(doc)) {
					if (!Array.isArray(list)) continue;
					const mk = norm(k);
					const dest = { ...(map[mk] || {}) };
					for (const e of list) {
						const email = norm(e);
						if (email && !dest[email]) dest[email] = 'primary';
					}
					map[mk] = dest;
				}
			}
			localStorage.removeItem(LEGACY_LOCAL_KEY);
		}
		if (me) {
			const legacyKey = `alpha.mail.approved.${me}`;
			const raw = localStorage.getItem(legacyKey);
			if (raw) {
				const list = JSON.parse(raw);
				if (Array.isArray(list)) {
					const dest = { ...(map[me] || {}) };
					for (const e of list) {
						const email = norm(e);
						if (email && !dest[email]) dest[email] = 'primary';
					}
					map[me] = dest;
				}
				localStorage.removeItem(legacyKey);
			}
		}
		writeAllLocal(map);
	} catch {
		/* ignore */
	}
	return map;
}

/**
 * @param {Record<string, Record<string, ContactBucket>>} map
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
	/** @type {Record<string, ContactBucket>} */
	const next = { ...pending };
	if (me && map[me]) Object.assign(next, map[me]);
	buckets = next;
	loadedFor = key;

	if (me && Object.keys(pending).length) {
		pending = {};
		persistLocal();
	}

	scheduleDriveHydrate(me);
}

/**
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
		pending = { ...buckets };
		return;
	}
	const map = readAllLocal();
	map[me] = { ...buckets };
	writeAllLocal(map);
	void persistDrive(me);
}

/**
 * @param {any} doc
 * @param {string} me
 * @returns {Record<string, ContactBucket>}
 */
function bucketsFromDriveDoc(doc, me) {
	/** @type {Record<string, ContactBucket>} */
	const out = {};
	if (!doc || typeof doc !== 'object') return out;

	const byMailbox = doc.mailboxes;
	if (byMailbox && typeof byMailbox === 'object') {
		const entry = byMailbox[me];
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			for (const [email, bucket] of Object.entries(entry)) {
				if (bucket === 'primary' || bucket === 'updates' || bucket === 'other') {
					out[norm(email)] = bucket;
				}
			}
			return out;
		}
		if (Array.isArray(entry)) {
			for (const e of entry) {
				const email = norm(e);
				if (email) out[email] = 'primary';
			}
			return out;
		}
	}

	if (Array.isArray(doc.emails)) {
		for (const e of doc.emails) {
			const email = norm(e);
			if (email) out[email] = 'primary';
		}
	} else if (Array.isArray(doc)) {
		for (const e of doc) {
			const email = norm(e);
			if (email) out[email] = 'primary';
		}
	}
	return out;
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
		const list = bucketsFromDriveDoc(doc, me);
		ensureLoadedLocalOnly(me);
		const merged = { ...buckets, ...list };
		/* Local wins on conflict — already in buckets first. */
		for (const [email, bucket] of Object.entries(list)) {
			if (!buckets[email]) merged[email] = bucket;
			else merged[email] = buckets[email];
		}
		driveSyncedFor = me;
		const same =
			Object.keys(merged).length === Object.keys(buckets).length &&
			Object.entries(merged).every(([e, b]) => buckets[e] === b);
		if (same) {
			if (!doc?.mailboxes?.[me] || Array.isArray(doc?.mailboxes?.[me])) void persistDrive(me);
			return;
		}
		buckets = merged;
		const map = readAllLocal();
		map[me] = { ...buckets };
		writeAllLocal(map);
		void persistDrive(me);
	} catch {
		driveSyncedFor = me;
	}
}

/** Load local without re-entering Drive scheduling. */
function ensureLoadedLocalOnly(me) {
	const key = me || '__pending__';
	if (loadedFor === key) return;
	const map = migrateLegacy(readAllLocal(), me);
	/** @type {Record<string, ContactBucket>} */
	const next = { ...pending };
	if (me && map[me]) Object.assign(next, map[me]);
	buckets = next;
	loadedFor = key;
}

/**
 * @param {string} me
 */
async function persistDrive(me) {
	const session = activeSession();
	if (!session || !me) return;
	try {
		/** @type {Record<string, any>} */
		let mailboxes = {};
		try {
			const bytes = await getPath(session, DRIVE_PATH);
			const doc = JSON.parse(new TextDecoder().decode(bytes));
			if (doc?.mailboxes && typeof doc.mailboxes === 'object') {
				mailboxes = { ...doc.mailboxes };
			} else if (Array.isArray(doc?.emails) && doc.emails.length) {
				/** @type {Record<string, ContactBucket>} */
				const legacy = {};
				for (const e of doc.emails) {
					const email = norm(e);
					if (email) legacy[email] = 'primary';
				}
				mailboxes[me] = legacy;
			}
		} catch {
			/* create fresh */
		}
		mailboxes[me] = { ...buckets };
		const primaryEmails = Object.entries(buckets)
			.filter(([, b]) => b === 'primary')
			.map(([e]) => e);
		await putPath(
			session,
			DRIVE_PATH,
			'blob',
			JSON.stringify({
				schema: 'alpha.mail_contacts/2',
				mailboxes,
				/* Legacy flat field — Primary only, for older clients */
				emails: primaryEmails,
				updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
			})
		);
	} catch (e) {
		console.warn('mail contacts persist', e);
	}
}

/** Reactive snapshot size for derived filters. */
export function approvedContacts() {
	ensureLoaded();
	actor.email;
	members.length;
	return new Set(
		Object.entries(buckets)
			.filter(([, b]) => b === 'primary')
			.map(([e]) => e)
	);
}

/** Reactive revision so category filters re-run when any bucket changes. */
export function contactBucketsVersion() {
	ensureLoaded();
	actor.email;
	members.length;
	return `${Object.keys(buckets).length}:${Object.values(buckets).join(',')}`;
}

/**
 * @param {string} email
 * @returns {ContactBucket | null}
 */
export function contactBucket(email) {
	ensureLoaded();
	actor.email;
	members.length;
	const e = norm(email);
	if (!e) return null;
	if (members.some((m) => norm(m.email) === e)) return 'primary';
	return buckets[e] || null;
}

/**
 * @param {string} email
 */
export function isApprovedContact(email) {
	return contactBucket(email) === 'primary';
}

/**
 * @param {string} email
 */
export function isCategorizedContact(email) {
	return contactBucket(email) != null;
}

/**
 * @param {string} email
 * @param {ContactBucket} bucket
 */
export function categorizeContact(email, bucket) {
	ensureLoaded();
	const e = norm(email);
	if (!e) return;
	if (bucket !== 'primary' && bucket !== 'updates' && bucket !== 'other') return;
	if (buckets[e] === bucket) {
		persistLocal();
		return;
	}
	buckets = { ...buckets, [e]: bucket };
	persistLocal();
}

/**
 * @param {string} email
 */
export function approveContact(email) {
	categorizeContact(email, 'primary');
}

/**
 * @param {string} email
 */
export function revokeContact(email) {
	ensureLoaded();
	const e = norm(email);
	if (!e || !buckets[e]) return;
	const next = { ...buckets };
	delete next[e];
	buckets = next;
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
