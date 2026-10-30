/**
 * Profile picture URLs from Drive paths on meta/members.json.
 * Drive session stays shared; only the picture blob path is per-member.
 */

import { getPath } from './drive/client.js';
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
 */
export function hydrateAvatarUrls() {
	for (const m of members) {
		if (m.picture) void ensureAvatarUrl(m.picture);
	}
}

/**
 * @param {string} path
 */
export async function ensureAvatarUrl(path) {
	const p = String(path || '').trim();
	if (!p) return null;
	if (urlByPath[p]) return urlByPath[p];
	if (loading.has(p)) return null;
	const session = activeSession();
	if (!session) return null;
	loading.add(p);
	try {
		const bytes = await getPath(session, p);
		const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
		const blob = new Blob([copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)], {
			type: 'image/jpeg'
		});
		const prev = urlByPath[p];
		if (prev) URL.revokeObjectURL(prev);
		urlByPath[p] = URL.createObjectURL(blob);
		return urlByPath[p];
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
