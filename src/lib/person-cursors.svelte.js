/**
 * Per-person “seen” cursors — local-first, Drive eventually.
 * Leaf: meta/cursors/{emailSlug}.json (alpha.person_cursors/1).
 *
 * Critical path never awaits Drive. Seeded values stay local until the user
 * actually marks a section; that avoids tip rewrites on every hard refresh.
 */
import { activePerson } from './actor.svelte.js';
import { chatFeed } from './chat.svelte.js';
import { getPath, putPath } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';
import { notes, tasks } from './workspace.svelte.js';

const LOCAL_ACTIVITY_KEY = 'alpha.chatActivity.seenAt';
const LOCAL_CURSORS_KEY = 'alpha.personCursors.v1';
/* Was 8s — each flush rewrites the full cryptree tip and CAS-fights chat sends. */
const PERSIST_MS = 20_000;

/** @typedef {'activity' | 'chat' | 'notes' | 'tasks'} CursorKey */

/** @type {Record<string, number>} */
const EMPTY = {
	activity_seen_at: 0,
	chat_seen_at: 0,
	notes_seen_at: 0,
	tasks_seen_at: 0
};

/** @type {{ ready: boolean, email: string, values: Record<string, number>, dirty: boolean }} */
export const personCursors = $state({
	ready: false,
	email: '',
	values: { ...EMPTY },
	dirty: false
});

export const cursorsTick = $state({ value: 0 });

/** @type {ReturnType<typeof setTimeout> | null} */
let persistTimer = null;
let persistInFlight = false;
let persistQueued = false;
/** @type {Record<string, number> | null} */
let lastPersisted = null;
let driveFetchEmail = '';
let driveFetchGen = 0;

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

function meEmail() {
	return String(activePerson().email || '')
		.trim()
		.toLowerCase();
}

/** @param {string} email */
function localCacheKey(email) {
	return `${LOCAL_CURSORS_KEY}:${emailSlug(email)}`;
}

/** @param {Record<string, number>} a @param {Record<string, number>} b */
function sameValues(a, b) {
	return (
		(a.activity_seen_at || 0) === (b.activity_seen_at || 0) &&
		(a.chat_seen_at || 0) === (b.chat_seen_at || 0) &&
		(a.notes_seen_at || 0) === (b.notes_seen_at || 0) &&
		(a.tasks_seen_at || 0) === (b.tasks_seen_at || 0)
	);
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
 * @param {{ dirty?: boolean }} [opts]
 * @returns {boolean}
 */
function applyLocal(next, email, opts = {}) {
	const values = {
		activity_seen_at: Number(next.activity_seen_at) || 0,
		chat_seen_at: Number(next.chat_seen_at) || 0,
		notes_seen_at: Number(next.notes_seen_at) || 0,
		tasks_seen_at: Number(next.tasks_seen_at) || 0
	};
	if (
		personCursors.ready &&
		personCursors.email === email &&
		sameValues(personCursors.values, values)
	) {
		return false;
	}
	personCursors.email = email;
	personCursors.values = values;
	personCursors.ready = true;
	if (opts.dirty) personCursors.dirty = true;
	cursorsTick.value += 1;
	writeLocalCache(email, values);
	if (typeof localStorage !== 'undefined' && values.activity_seen_at > 0) {
		try {
			localStorage.setItem(LOCAL_ACTIVITY_KEY, String(values.activity_seen_at));
		} catch {
			/* ignore */
		}
	}
	return true;
}

/** @param {CursorKey} key */
function fieldFor(key) {
	if (key === 'activity') return 'activity_seen_at';
	if (key === 'chat') return 'chat_seen_at';
	if (key === 'notes') return 'notes_seen_at';
	return 'tasks_seen_at';
}

/** Hydrate from localStorage only — sync, never touches Drive. */
export function hydratePersonCursorsLocal() {
	const email = meEmail();
	if (!email) {
		if (personCursors.ready || personCursors.email) {
			personCursors.ready = false;
			personCursors.email = '';
			personCursors.values = { ...EMPTY };
			personCursors.dirty = false;
			cursorsTick.value += 1;
		}
		return;
	}
	if (personCursors.ready && personCursors.email === email) return;

	const cached = readLocalCache(email);
	const legacyActivity = readLegacyActivitySeen();
	const now = Date.now();
	const seeded = {
		activity_seen_at: Math.max(cached?.activity_seen_at || 0, legacyActivity) || now,
		chat_seen_at: cached?.chat_seen_at || now,
		notes_seen_at: cached?.notes_seen_at || now,
		tasks_seen_at: cached?.tasks_seen_at || now
	};
	applyLocal(seeded, email);
	/* First visit seed stays local — do not tip-write on hard refresh. */
}

/**
 * Background Drive pull. Never blocks boot. Does not create the leaf.
 * @param {import('./drive/client.js').DriveSession} [session]
 */
export async function pullPersonCursorsFromDrive(session = activeSession()) {
	const email = meEmail();
	if (!email || !session) return;
	if (driveFetchEmail === email) return;
	const gen = ++driveFetchGen;
	driveFetchEmail = email;
	try {
		const bytes = await getPath(session, cursorsPath(email));
		if (gen !== driveFetchGen) return;
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		const fromDrive = {
			activity_seen_at: parseMs(doc.activity_seen_at),
			chat_seen_at: parseMs(doc.chat_seen_at),
			notes_seen_at: parseMs(doc.notes_seen_at),
			tasks_seen_at: parseMs(doc.tasks_seen_at)
		};
		const local = personCursors.email === email ? personCursors.values : EMPTY;
		const merged = {
			activity_seen_at: Math.max(fromDrive.activity_seen_at, local.activity_seen_at || 0),
			chat_seen_at: Math.max(fromDrive.chat_seen_at, local.chat_seen_at || 0),
			notes_seen_at: Math.max(fromDrive.notes_seen_at, local.notes_seen_at || 0),
			tasks_seen_at: Math.max(fromDrive.tasks_seen_at, local.tasks_seen_at || 0)
		};
		applyLocal(merged, email);
		lastPersisted = fromDrive;
		/* Only push up if local was ahead of Drive (user marked on this device). */
		if (personCursors.dirty && !sameValues(merged, fromDrive)) {
			schedulePersistCursors();
		}
	} catch {
		/* Missing leaf is fine — local seed already covers badges. */
	} finally {
		if (driveFetchEmail === email) driveFetchEmail = '';
	}
}

/**
 * Boot / refresh entry: local sync hydrate, Drive in background.
 * @param {import('./drive/client.js').DriveSession} [session]
 */
export function loadPersonCursors(session = activeSession()) {
	hydratePersonCursorsLocal();
	if (session) void pullPersonCursorsFromDrive(session);
}

async function flushPersist() {
	if (!personCursors.dirty) return;
	const session = activeSession();
	const email = meEmail();
	if (!session || !email || personCursors.email !== email) return;
	/* Never tip-write cursors mid-chat-send — that CAS-retries the message tip. */
	try {
		const { chatUi } = await import('./chat.svelte.js');
		if (chatUi?.posting) {
			schedulePersistCursors(2_500);
			return;
		}
	} catch {
		/* ignore */
	}
	const values = { ...personCursors.values };
	if (lastPersisted && sameValues(lastPersisted, values)) {
		personCursors.dirty = false;
		return;
	}
	if (persistInFlight) {
		persistQueued = true;
		return;
	}
	persistInFlight = true;
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
		lastPersisted = values;
		personCursors.dirty = false;
	} catch {
		/* Offline — keep dirty for a later attempt. */
	} finally {
		persistInFlight = false;
		if (persistQueued) {
			persistQueued = false;
			schedulePersistCursors(0);
		}
	}
}

/** @param {number} [delayMs] */
export function schedulePersistCursors(delayMs = PERSIST_MS) {
	if (persistTimer) clearTimeout(persistTimer);
	persistTimer = setTimeout(() => {
		persistTimer = null;
		void flushPersist();
	}, delayMs);
}

/**
 * @param {CursorKey | CursorKey[]} keys
 * @param {number} [at]
 */
export function markCursorsSeen(keys, at = Date.now()) {
	const email = meEmail();
	if (!email) return;
	if (!personCursors.ready || personCursors.email !== email) {
		hydratePersonCursorsLocal();
	}
	if (personCursors.email && personCursors.email !== email) return;

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
	if (!applyLocal(next, email, { dirty: true })) return;
	schedulePersistCursors();
}

export function markActivitySeen() {
	markCursorsSeen('activity');
}

/** @param {CursorKey} key */
export function readCursor(key) {
	cursorsTick.value;
	const email = meEmail();
	if (!email || personCursors.email !== email) return 0;
	return Number(personCursors.values[fieldFor(key)] || 0) || 0;
}

export function newChatCount() {
	cursorsTick.value;
	const len = chatFeed.length;
	const me = meEmail();
	if (!me || !personCursors.ready || len === 0) return 0;
	const seen = Number(personCursors.values.chat_seen_at || 0) || 0;

	/** @type {Set<string>} */
	const myMsgIds = new Set();
	for (let i = 0; i < len; i++) {
		const m = chatFeed[i];
		if (!m?.id) continue;
		if (m.kind === 'reaction' || m.kind === 'event') continue;
		if (String(m.author || '').trim().toLowerCase() !== me) continue;
		myMsgIds.add(String(m.id));
	}

	let n = 0;
	for (let i = 0; i < len; i++) {
		const m = chatFeed[i];
		if (!m?.id || String(m.id).startsWith('local-')) continue;
		if (m.kind === 'reaction') continue;
		const author = String(m.author || '')
			.trim()
			.toLowerCase();
		if (!author || author === me) continue;
		const at = Date.parse(String(m.created_at || '')) || 0;
		if (!at || at <= seen) continue;
		const replyTo = String(m.reply_to || '');
		if (
			replyTo &&
			myMsgIds.has(replyTo) &&
			(m.kind === 'comment' || m.kind === 'chat' || !m.kind)
		) {
			continue;
		}
		n += 1;
	}
	return n;
}

export function newNotesCount() {
	cursorsTick.value;
	const len = notes.length;
	const me = meEmail();
	if (!me || !personCursors.ready || len === 0) return 0;
	const seen = Number(personCursors.values.notes_seen_at || 0) || 0;
	let n = 0;
	for (let i = 0; i < len; i++) {
		const note = notes[i];
		const author = String(note.author || '')
			.trim()
			.toLowerCase();
		if (author && author === me) continue;
		if ((Number(note.createdAt || 0) || 0) > seen) n += 1;
	}
	return n;
}

export function newTasksCount() {
	cursorsTick.value;
	const len = tasks.length;
	const me = meEmail();
	if (!me || !personCursors.ready || len === 0) return 0;
	const seen = Number(personCursors.values.tasks_seen_at || 0) || 0;
	let n = 0;
	for (let i = 0; i < len; i++) {
		const task = tasks[i];
		const author = String(task.author || '')
			.trim()
			.toLowerCase();
		if (author && author === me) continue;
		if ((Number(task.createdAt || 0) || 0) > seen) n += 1;
	}
	return n;
}
