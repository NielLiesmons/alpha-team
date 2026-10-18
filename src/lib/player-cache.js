/**
 * Local-first Player library cache (localStorage).
 * Hydrate instantly on open; tip check + decrypt runs in the background.
 */

import { getTip } from './drive/client.js';

const LIB_PREFIX = 'alpha-admin-player-lib.v1:';
const RECENT_PREFIX = 'alpha-admin-recently-played.v1:';
const MAX_RECENT = 80;

/**
 * @param {import('./drive/client.js').DriveSession} session
 */
function libKey(session) {
	return `${LIB_PREFIX}${session.url}`;
}

/**
 * @param {string} email
 * @param {import('./drive/client.js').DriveSession} session
 */
function recentKey(email, session) {
	const who = (email || 'anon').trim().toLowerCase() || 'anon';
	return `${RECENT_PREFIX}${session.url}:${who}`;
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @returns {{ tip: string, tracks: any[], playlists: any[], savedAt: number } | null}
 */
export function readLibraryCache(session) {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(libKey(session));
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || !Array.isArray(parsed.tracks)) return null;
		return {
			tip: String(parsed.tip || ''),
			tracks: parsed.tracks,
			playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
			savedAt: Number(parsed.savedAt) || 0
		};
	} catch {
		return null;
	}
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @param {{ tip: string, tracks: any[], playlists: any[] }} data
 */
export function writeLibraryCache(session, data) {
	if (typeof localStorage === 'undefined') return;
	try {
		// Strip runtime-only cover_url blobs before persisting.
		const tracks = data.tracks.map((t) => {
			const { cover_url: _u, ...rest } = t;
			return rest;
		});
		localStorage.setItem(
			libKey(session),
			JSON.stringify({
				tip: data.tip,
				tracks,
				playlists: data.playlists,
				savedAt: Date.now()
			})
		);
	} catch {
		/* quota */
	}
}

/**
 * @param {import('./drive/client.js').DriveSession} session
 * @param {AbortSignal} [signal]
 */
export async function fetchRemoteTip(session, signal) {
	try {
		return await getTip(session, signal);
	} catch {
		return '';
	}
}

/**
 * @param {string} email
 * @param {import('./drive/client.js').DriveSession} session
 * @returns {{ id: string, at: number }[]}
 */
export function readRecentlyPlayed(email, session) {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(recentKey(email, session));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((x) => x && typeof x.id === 'string')
			.map((x) => ({ id: x.id, at: Number(x.at) || 0 }));
	} catch {
		return [];
	}
}

/**
 * @param {string} email
 * @param {import('./drive/client.js').DriveSession} session
 * @param {string} trackId
 */
export function pushRecentlyPlayed(email, session, trackId) {
	if (!trackId || typeof localStorage === 'undefined') return;
	const prev = readRecentlyPlayed(email, session).filter((x) => x.id !== trackId);
	const next = [{ id: trackId, at: Date.now() }, ...prev].slice(0, MAX_RECENT);
	try {
		localStorage.setItem(recentKey(email, session), JSON.stringify(next));
	} catch {
		/* quota */
	}
}
