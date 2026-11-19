/**
 * Profile picture URLs from Drive paths on meta/members.json.
 * Drive session stays shared; only the picture blob path is per-member.
 *
 * Local-first: members cache supplies paths sync; media-cache IDB supplies
 * decrypted JPEG bytes across hard refresh (small team → few PFPs, always warm).
 */

import { getAttachmentObjectUrl } from './drive/media-cache.js';
import { putAvatarImage } from './drive/entities.js';
import { activeSession } from './drive/session.svelte.js';
import { memberFor, members, upsertMember } from './members.svelte.js';

/** @type {Record<string, string>} path → object URL */
const urlByPath = $state(/** @type {Record<string, string>} */ ({}));

/** @type {Set<string>} */
const loading = new Set();

/**
 * Resolve a cached object URL for a member email (reactive via members + urlByPath).
 * @param {string} [email]
 */
export function pictureUrlFor(email) {
	const m = memberFor(email || '');
	const path = m?.picture;
	if (!path) return null;
	const cached = urlByPath[path];
	if (cached) return cached;
	void ensureAvatarUrl(path);
	return null;
}

/**
 * Prefetch object URLs for every member that has a picture path.
 * Safe to call after ensureMembers / tip wake so pics set on another device appear.
 */
export function hydrateAvatarUrls() {
	for (const m of members) {
		if (m.picture) void ensureAvatarUrl(m.picture);
	}
}

/**
 * Await IndexedDB hits for every known member picture (no network).
 * Call after session + members hydrate so first paint already has blob URLs.
 */
export async function warmAvatarUrlsFromCache() {
	const session = activeSession();
	if (!session) return;
	const paths = [...new Set(members.map((m) => m.picture).filter(Boolean))];
	await Promise.all(
		paths.map((p) => ensureAvatarUrl(/** @type {string} */ (p), { localOnly: true }))
	);
	/* Network fill-in for misses — don't block boot. */
	hydrateAvatarUrls();
}

/**
 * Reload members.json from Drive and hydrate picture blobs.
 * Call on boot (after chat) and whenever the tip moves.
 */
export async function refreshMembersAndAvatars() {
	const session = activeSession();
	if (!session) return;
	const { ensureMembers } = await import('./members.svelte.js');
	await ensureMembers(session);
	await warmAvatarUrlsFromCache();
}

/**
 * @param {string} path
 * @param {{ localOnly?: boolean }} [opts]
 */
export async function ensureAvatarUrl(path, opts = {}) {
	const p = String(path || '').trim();
	if (!p) return null;
	if (urlByPath[p]) return urlByPath[p];
	if (loading.has(p)) return null;
	const session = activeSession();
	if (!session) return null;
	loading.add(p);
	try {
		/* media-cache: memory → IndexedDB → getPath. PFPs stay fast across refresh. */
		const res = await getAttachmentObjectUrl(
			session,
			{
				path: p,
				kind: 'image',
				content_type: 'image/jpeg',
				name: 'avatar.jpg'
			},
			{ localOnly: Boolean(opts.localOnly) }
		);
		if (!res?.url) return null;
		urlByPath[p] = res.url;
		return res.url;
	} catch {
		return null;
	} finally {
		loading.delete(p);
	}
}

/**
 * Upload a new avatar for a member and persist picture path on members.json.
 * @param {string} email
 * @param {File | Blob} file
 */
export async function setMemberPicture(email, file) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive before setting a profile picture.');
	const m = memberFor(email);
	if (!m) throw new Error('Unknown member — pick a profile first.');
	const path = await putAvatarImage(session, file);
	await upsertMember({ ...m, picture: path });
	await ensureAvatarUrl(path);
	return path;
}

/**
 * Clear picture path on the member (blob may remain as orphan ciphertext).
 * @param {string} email
 */
export async function clearMemberPicture(email) {
	const m = memberFor(email);
	if (!m) throw new Error('Unknown member');
	await upsertMember({ ...m, clearPicture: true });
}
