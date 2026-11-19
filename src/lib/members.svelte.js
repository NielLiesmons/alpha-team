/**
 * Space members + Admin ACL (not Drive cryptree caps).
 * SoT: meta/members.json on Drive — see alpha-docs/DRIVE-LAYOUT.md.
 */

import { getPath, putPath } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';

const MEMBERS_LS_PREFIX = 'alpha.members.v1:';

/** @typedef {'owner' | 'admin' | 'member'} MemberRole */
/** @typedef {'active' | 'invited' | 'disabled'} MemberStatus */

/**
 * @typedef {{
 *   email: string,
 *   name: string,
 *   role: MemberRole,
 *   status?: MemberStatus,
 *   picture?: string,
 *   invited_at?: string,
 *   joined_at?: string
 * }} Member
 */

/**
 * Empty until Drive `meta/members.json` loads (or first invite).
 * Never ship personal/customer seed rows in the product binary.
 * @type {Member[]}
 */
const DEFAULT_MEMBERS = [];

/** @type {Member[]} */
export const members = $state([]);

const MEMBERS_PATH = 'meta/members.json';

/** @param {string} email */
export function normalizeEmail(email) {
	return String(email || '')
		.trim()
		.toLowerCase();
}

/**
 * @param {unknown} raw
 * @returns {Member[]}
 */
function parseMembersDoc(raw) {
	let doc = raw;
	if (typeof raw === 'string') {
		try {
			doc = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	const list = /** @type {{ members?: unknown }} */ (doc)?.members;
	if (!Array.isArray(list)) return [];
	/** @type {Member[]} */
	const out = [];
	for (const row of list) {
		if (!row || typeof row !== 'object') continue;
		const o = /** @type {Record<string, unknown>} */ (row);
		const email = normalizeEmail(String(o.email || ''));
		if (!email.includes('@')) continue;
		const role = o.role === 'owner' || o.role === 'admin' || o.role === 'member' ? o.role : 'member';
		const status =
			o.status === 'invited' || o.status === 'disabled' || o.status === 'active'
				? o.status
				: 'active';
		out.push({
			email,
			name: String(o.name || email.split('@')[0] || email),
			role,
			status,
			...(typeof o.picture === 'string' && o.picture.trim()
				? { picture: o.picture.trim() }
				: {}),
			...(typeof o.invited_at === 'string' ? { invited_at: o.invited_at } : {}),
			...(typeof o.joined_at === 'string' ? { joined_at: o.joined_at } : {})
		});
	}
	return out;
}

/** @param {Member[]} list */
function replaceMembers(list) {
	members.splice(0, members.length, ...list);
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 */
function membersCacheKey(session) {
	return MEMBERS_LS_PREFIX + String(session?.url || '');
}

/**
 * Persist members (incl. picture paths) for instant hydrate on hard refresh.
 * @param {import('./drive/client.js').DriveSession} session
 * @param {Member[]} list
 */
function persistMembersCache(session, list) {
	if (typeof localStorage === 'undefined' || !session?.url) return;
	try {
		localStorage.setItem(
			membersCacheKey(session),
			JSON.stringify({
				at: Date.now(),
				members: list.map((m) => ({
					email: normalizeEmail(m.email),
					name: m.name,
					role: m.role,
					status: m.status || 'active',
					...(m.picture ? { picture: m.picture } : {}),
					...(m.invited_at ? { invited_at: m.invited_at } : {}),
					...(m.joined_at ? { joined_at: m.joined_at } : {})
				}))
			})
		);
	} catch {
		/* quota */
	}
}

/**
 * Sync hydrate member rows (picture paths) before Drive round-trip.
 * @param {import('./drive/client.js').DriveSession} [session]
 * @returns {boolean}
 */
export function hydrateMembersFromCache(session = activeSession()) {
	if (!session?.url || typeof localStorage === 'undefined') return false;
	if (members.length > 0) return true;
	try {
		const raw = localStorage.getItem(membersCacheKey(session));
		const doc = raw ? JSON.parse(raw) : null;
		const list = parseMembersDoc({ members: doc?.members });
		if (!list.length) return false;
		replaceMembers(list);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @param {Member[]} list
 */
export async function saveMembers(session, list = members) {
	const doc = {
		schema: 'alpha.members/1',
		updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
		members: list.map((m) => ({
			email: normalizeEmail(m.email),
			name: m.name,
			role: m.role,
			status: m.status || 'active',
			...(m.picture ? { picture: m.picture } : {}),
			...(m.invited_at ? { invited_at: m.invited_at } : {}),
			...(m.joined_at ? { joined_at: m.joined_at } : {})
		}))
	};
	await putPath(session, MEMBERS_PATH, 'blob', JSON.stringify(doc, null, 2));
	replaceMembers(doc.members);
	persistMembersCache(session, doc.members);
	return doc;
}

/**
 * Load members from Drive; seed defaults on first visit.
 * @param {import('./drive/client.js').DriveSession} [session]
 */
/**
 * Ensure every default mailbox exists in the loaded list (no overwrites).
 * @param {Member[]} list
 */
function mergeDefaultMembers(list) {
	const by = new Map(list.map((m) => [m.email, m]));
	let changed = false;
	for (const d of DEFAULT_MEMBERS) {
		if (!by.has(d.email)) {
			by.set(d.email, { ...d });
			changed = true;
		}
	}
	return { list: [...by.values()], changed };
}

export async function ensureMembers(session = activeSession()) {
	if (!session) return members;
	hydrateMembersFromCache(session);
	try {
		const bytes = await getPath(session, MEMBERS_PATH);
		const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
		const list = parseMembersDoc(text);
		if (list.length) {
			const { list: merged, changed } = mergeDefaultMembers(list);
			replaceMembers(merged);
			persistMembersCache(session, merged);
			if (changed) {
				try {
					await saveMembers(session, merged);
				} catch {
					/* read-only session — in-memory merge still helps switcher */
				}
			}
			return members;
		}
	} catch {
		/* missing file */
	}
	/* No personal seed rows — first Admin invite / upsert creates the directory. */
	if (DEFAULT_MEMBERS.length) {
		const seed = DEFAULT_MEMBERS.map((m) => ({ ...m }));
		await saveMembers(session, seed);
	} else {
		replaceMembers([]);
	}
	return members;
}

/** @param {string} email */
export function memberFor(email) {
	const e = normalizeEmail(email);
	if (!e) return null;
	return members.find((m) => m.email === e) ?? null;
}

/** @param {string} email */
export function roleFor(email) {
	return memberFor(email)?.role ?? null;
}

/** Operator: invite people, manage roles, Stalwart-facing actions. */
export function canManageMembers(email) {
	const r = roleFor(email);
	return r === 'owner' || r === 'admin';
}

/** Space settings: brand, API tokens, advanced Drive, publications ops. */
export function canManageSpace(email) {
	return canManageMembers(email);
}

/** Share a new Drive invite (same as manage members for v0). */
export function canInvite(email) {
	return canManageMembers(email);
}

/**
 * Upsert a member row and persist when Drive is connected.
 * Pass `picture: ''` or `picture: undefined` with clearPicture to drop the avatar path.
 * @param {Partial<Member> & { email: string, name: string, role: MemberRole, clearPicture?: boolean }} input
 */
export async function upsertMember(input) {
	const email = normalizeEmail(input.email);
	const idx = members.findIndex((m) => m.email === email);
	const prev = idx >= 0 ? members[idx] : null;
	/** @type {Member} */
	const next = {
		email,
		name: (input.name ?? prev?.name ?? '').trim() || email.split('@')[0] || email,
		role: input.role ?? prev?.role ?? 'member',
		status: input.status || prev?.status || 'active',
		...(input.invited_at || prev?.invited_at
			? { invited_at: input.invited_at || prev?.invited_at }
			: {}),
		...(input.joined_at || prev?.joined_at
			? { joined_at: input.joined_at || prev?.joined_at }
			: {})
	};
	if (input.clearPicture) {
		/* drop picture */
	} else if (typeof input.picture === 'string' && input.picture.trim()) {
		next.picture = input.picture.trim();
	} else if (prev?.picture) {
		next.picture = prev.picture;
	}
	const isNew = idx < 0;
	if (idx >= 0) members[idx] = next;
	else members.push(next);

	const session = activeSession();
	if (session) await saveMembers(session, [...members]);
	if (isNew) {
		const { announceMemberStatus } = await import('./chat.svelte.js');
		announceMemberStatus(email, next.status === 'invited' ? 'added' : 'joined', next.name);
	}
	return memberFor(email);
}

/**
 * @param {string} email
 * @param {MemberStatus} status
 */
export async function setMemberStatus(email, status) {
	const m = memberFor(email);
	if (!m) throw new Error('Unknown member');
	m.status = status;
	const session = activeSession();
	if (session) await saveMembers(session, [...members]);
}

/**
 * Mark invited member as joined (on successful /join claim).
 * @param {string} email
 */
export async function markMemberJoined(email) {
	const m = memberFor(email);
	if (!m) return;
	m.status = 'active';
	m.joined_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
	const session = activeSession();
	if (session) {
		try {
			await saveMembers(session, [...members]);
		} catch {
			/* claimer may not have write yet — owner list still has invited row */
		}
	}
	const { announceMemberStatus } = await import('./chat.svelte.js');
	announceMemberStatus(m.email, 'joined', m.name);
}

/**
 * Remove a member from the Space directory (does not revoke Drive root key).
 * @param {string} email
 * @param {{ actorEmail?: string }} [opts]
 */
export async function removeMember(email, opts = {}) {
	const e = normalizeEmail(email);
	const m = memberFor(e);
	if (!m) throw new Error('Unknown member');
	const actorEmail = normalizeEmail(opts.actorEmail || '');
	if (actorEmail && e === actorEmail) {
		throw new Error('You cannot delete the profile you are signed in as.');
	}
	if (m.role === 'owner') {
		const owners = members.filter((x) => x.role === 'owner' && x.status !== 'disabled');
		if (owners.length <= 1) throw new Error('Cannot delete the last owner.');
	}
	const next = members.filter((x) => x.email !== e);
	const session = activeSession();
	if (session) await saveMembers(session, next);
	else replaceMembers(next);
	const { announceMemberStatus } = await import('./chat.svelte.js');
	announceMemberStatus(e, 'removed', m.name);
	return true;
}
