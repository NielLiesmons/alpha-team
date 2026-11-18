/**
 * Per-person “seen” cursors on Drive — cross-device new / targeted-unread badges.
 * Leaf: meta/cursors/{emailSlug}.json (alpha.person_cursors/1).
 *
 * Counts are derived client-side from lists already in memory; only the cursor
 * leaf is written (one tip update, debounced).
 */
import { activePerson } from './actor.svelte.js';
import { chatFeed } from './chat.svelte.js';
import { getPath, putPath } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';
import { notes, tasks } from './workspace.svelte.js';

const LOCAL_ACTIVITY_KEY = 'alpha.chatActivity.seenAt';
const LOCAL_CURSORS_KEY = 'alpha.personCursors.v1';

/** @typedef {'activity' | 'chat' | 'notes' | 'tasks'} CursorKey */

/** @type {Record<string, number>} */
const EMPTY = {
	activity_seen_at: 0,
	chat_seen_at: 0,
	notes_seen_at: 0,
	tasks_seen_at: 0
};

/** @type {{ ready: boolean, email: string, values: Record<string, number> }} */
export const personCursors = $state({
	ready: false,
	email: '',
	values: { ...EMPTY }
});

/** Bumps when cursors change so derived counts re-run. */
export const cursorsTick = $state({ value: 0 });

/** @type {ReturnType<typeof setTimeout> | null} */
let persistTimer = null;
let persistInFlight = false;
let persistQueued = false;

/** @param {string} email */
export function emailSlug(email) {
	return String(email || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '') || 'unknown';
}

/** @param {string} email */
function cursorsPath(email) {
	return `meta/cursors/${emailSlug(email)}.json`;
}

/** @param {unknown} raw */
function parseMs(raw) {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	if (typeof raw === 'string' && raw.trim()) {
		const asNum = Number(raw);
		if (Number.isFinite(asNum) && asNum > 0) return asNum;
		const parsed = Date.parse(raw);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 0;
}

/** @returns {string} */
function meEmail() {
	return String(activePerson().email || '')
		.trim()
		.toLowerCase();
}

/** @param {string} key */
function localCacheKey(email) {
	return `${LOCAL_CURSORS_KEY}:${emailSlug(email)}`;
}

/** @param {string} email @param {Record<string, number>} values */
function writeLocalCache(email, values) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(localCacheKey(email), JSON.stringify(values));
	} catch {
		/* ignore */
	}
}

/** @param {string} email */
function readLocalCache(email) {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(localCacheKey(email));
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		return {
			activity_seen_at: parseMs(parsed.activity_seen_at),
			chat_seen_at: parseMs(parsed.chat_seen_at),
			notes_seen_at: parseMs(parsed.notes_seen_at),
			tasks_seen_at: parseMs(parsed.tasks_seen_at)
		};
	} catch {
		return null;
	}
}

/** Legacy activity-only localStorage from chat-activity.svelte.js */
function readLegacyActivitySeen() {
	if (typeof localStorage === 'undefined') return 0;
	try {
		return parseMs(localStorage.getItem(LOCAL_ACTIVITY_KEY));
	} catch {
		return 0;
	}
}

/**
 * @param {Record<string, number>} next
 * @param {string} email
 */
function applyLocal(next, email) {
	personCursors.email = email;
	personCursors.values = { ...EMPTY, ...next };
	personCursors.ready = true;
	cursorsTick.value += 1;
	writeLocalCache(email, personCursors.values);
	if (typeof localStorage !== 'undefined' && next.activity_seen_at > 0) {
		try {
			localStorage.setItem(LOCAL_ACTIVITY_KEY, String(next.activity_seen_at));
		} catch {
			/* ignore */
		}
	}
}

/** @param {CursorKey} key */
function fieldFor(key) {
	if (key === 'activity') return 'activity_seen_at';
	if (key === 'chat') return 'chat_seen_at';
	if (key === 'notes') return 'notes_seen_at';
	return 'tasks_seen_at';
}

/** @param {CursorKey} key */
export function readCursor(key) {
	cursorsTick.value;
	const email = meEmail();
	if (!email || personCursors.email !== email) return 0;
	return Number(personCursors.values[fieldFor(key)] || 0) || 0;
}

/**
 * Load cursors for the signed-in person (Drive + local cache).
 * Seeds “now” on first use so historical inventory does not flood badges.
 * @param {import('./drive/client.js').DriveSession} [session]
 */
export async function loadPersonCursors(session = activeSession()) {
	const email = meEmail();
	if (!email) {
		personCursors.ready = false;
		personCursors.email = '';
		personCursors.values = { ...EMPTY };
		cursorsTick.value += 1;
		return;
	}

	const cached = readLocalCache(email);
	const legacyActivity = readLegacyActivitySeen();
	if (cached) {
		if (legacyActivity > (cached.activity_seen_at || 0)) {
			cached.activity_seen_at = legacyActivity;
		}
		applyLocal(cached, email);
	}

	if (!session) return;

	try {
		const bytes = await getPath(session, cursorsPath(email));
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		const fromDrive = {
			activity_seen_at: parseMs(doc.activity_seen_at),
			chat_seen_at: parseMs(doc.chat_seen_at),
			notes_seen_at: parseMs(doc.notes_seen_at),
			tasks_seen_at: parseMs(doc.tasks_seen_at)
		};
		/* Prefer the newer of Drive vs local (multi-device race). */
		const merged = {
			activity_seen_at: Math.max(
				fromDrive.activity_seen_at,
				cached?.activity_seen_at || 0,
				legacyActivity
			),
			chat_seen_at: Math.max(fromDrive.chat_seen_at, cached?.chat_seen_at || 0),
			notes_seen_at: Math.max(fromDrive.notes_seen_at, cached?.notes_seen_at || 0),
			tasks_seen_at: Math.max(fromDrive.tasks_seen_at, cached?.tasks_seen_at || 0)
		};
		applyLocal(merged, email);
		if (
			merged.activity_seen_at !== fromDrive.activity_seen_at ||
			merged.chat_seen_at !== fromDrive.chat_seen_at ||
			merged.notes_seen_at !== fromDrive.notes_seen_at ||
			merged.tasks_seen_at !== fromDrive.tasks_seen_at
		) {
			schedulePersistCursors();
		}
	} catch {
		/* Missing leaf — seed so historical inventory does not flood badges. */
		const now = Date.now();
		const seeded = {
			activity_seen_at: Math.max(cached?.activity_seen_at || 0, legacyActivity) || now,
			chat_seen_at: cached?.chat_seen_at || now,
			notes_seen_at: cached?.notes_seen_at || now,
			tasks_seen_at: cached?.tasks_seen_at || now
		};
		applyLocal(seeded, email);
		schedulePersistCursors();
	}
}

async function flushPersist() {
	const session = activeSession();
	const email = meEmail();
	if (!session || !email || personCursors.email !== email) return;
	if (persistInFlight) {
		persistQueued = true;
		return;
	}
	persistInFlight = true;
	const values = { ...personCursors.values };
	const doc = {
		schema: 'alpha.person_cursors/1',
		email,
		activity_seen_at: new Date(values.activity_seen_at || 0).toISOString().replace(/\.\d{3}Z$/, 'Z'),
		chat_seen_at: new Date(values.chat_seen_at || 0).toISOString().replace(/\.\d{3}Z$/, 'Z'),
		notes_seen_at: new Date(values.notes_seen_at || 0).toISOString().replace(/\.\d{3}Z$/, 'Z'),
		tasks_seen_at: new Date(values.tasks_seen_at || 0).toISOString().replace(/\.\d{3}Z$/, 'Z'),
		updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
	};
	try {
		await putPath(session, cursorsPath(email), 'blob', JSON.stringify(doc, null, 2));
	} catch {
		/* Offline — local cache still holds the cursor. */
	} finally {
		persistInFlight = false;
		if (persistQueued) {
			persistQueued = false;
			schedulePersistCursors(0);
		}
	}
}

/** @param {number} [delayMs] */
export function schedulePersistCursors(delayMs = 400) {
	if (persistTimer) clearTimeout(persistTimer);
	persistTimer = setTimeout(() => {
		persistTimer = null;
		void flushPersist();
	}, delayMs);
}

/**
 * Advance one or more cursors to `at` (default now). No-ops if already newer.
 * @param {CursorKey | CursorKey[]} keys
 * @param {number} [at]
 */
export function markCursorsSeen(keys, at = Date.now()) {
	const email = meEmail();
	if (!email) return;
	if (personCursors.email && personCursors.email !== email) return;
	if (!personCursors.email) personCursors.email = email;

	const list = Array.isArray(keys) ? keys : [keys];
	let changed = false;
	const next = { ...personCursors.values };
	for (const key of list) {
		const field = fieldFor(key);
		const prev = Number(next[field] || 0) || 0;
		if (at > prev) {
			next[field] = at;
			changed = true;
		}
	}
	if (!changed) return;
	applyLocal(next, email);
	schedulePersistCursors();
}

export function markActivitySeen() {
	markCursorsSeen('activity');
}

/** Messages from others that are not targeted replies/reactions on my tips. */
export function newChatCount() {
	cursorsTick.value;
	chatFeed.length;
	const me = meEmail();
	if (!me || !personCursors.ready) return 0;
	const seen = readCursor('chat');

	/** @type {Set<string>} */
	const myMsgIds = new Set();
	for (const m of chatFeed) {
		if (!m?.id) continue;
		if (m.kind === 'reaction' || m.kind === 'event') continue;
		if (String(m.author || '').trim().toLowerCase() !== me) continue;
		myMsgIds.add(String(m.id));
	}

	let n = 0;
	for (const m of chatFeed) {
		if (!m?.id || String(m.id).startsWith('local-')) continue;
		const author = String(m.author || '')
			.trim()
			.toLowerCase();
		if (!author || author === me) continue;
		const at = Date.parse(String(m.created_at || '')) || 0;
		if (!at || at <= seen) continue;

		const replyTo = String(m.reply_to || '');
		if (m.kind === 'reaction' && replyTo && myMsgIds.has(replyTo)) continue;
		if (
			(m.kind === 'comment' || m.kind === 'chat' || !m.kind) &&
			replyTo &&
			myMsgIds.has(replyTo)
		) {
			continue;
		}
		/* Count chat / comment / event tips; skip reactions on others. */
		if (m.kind === 'reaction') continue;
		n += 1;
	}
	return n;
}

export function newNotesCount() {
	cursorsTick.value;
	notes.length;
	const me = meEmail();
	if (!me || !personCursors.ready) return 0;
	const seen = readCursor('notes');
	let n = 0;
	for (const note of notes) {
		const author = String(note.author || '')
			.trim()
			.toLowerCase();
		if (author && author === me) continue;
		const at = Number(note.createdAt || 0) || 0;
		if (at > seen) n += 1;
	}
	return n;
}

export function newTasksCount() {
	cursorsTick.value;
	tasks.length;
	const me = meEmail();
	if (!me || !personCursors.ready) return 0;
	const seen = readCursor('tasks');
	let n = 0;
	for (const task of tasks) {
		const author = String(task.author || '')
			.trim()
			.toLowerCase();
		if (author && author === me) continue;
		const at = Number(task.createdAt || 0) || 0;
		if (at > seen) n += 1;
	}
	return n;
}
