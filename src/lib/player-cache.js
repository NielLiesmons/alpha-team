/**
 * Per-user Recently Played (device-local). No library cache — that path was too heavy.
 */

const RECENT_PREFIX = 'alpha-admin-recently-played.v1:';
const MAX_RECENT = 80;

/**
 * @param {string} email
 * @param {import('./drive/client.js').DriveSession} session
 */
function recentKey(email, session) {
	const who = (email || 'anon').trim().toLowerCase() || 'anon';
	return `${RECENT_PREFIX}${session.url}:${who}`;
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

/** Drop leftover library-cache keys from the short-lived experiment. */
export function clearStaleLibraryCache() {
	try {
		if (typeof localStorage !== 'undefined') {
			const keys = [];
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (k && k.startsWith('alpha-admin-player-lib.')) keys.push(k);
			}
			for (const k of keys) localStorage.removeItem(k);
		}
		if (typeof sessionStorage !== 'undefined') {
			const keys = [];
			for (let i = 0; i < sessionStorage.length; i++) {
				const k = sessionStorage.key(i);
				if (k && k.startsWith('alpha.player.tracks:')) keys.push(k);
			}
			for (const k of keys) sessionStorage.removeItem(k);
		}
	} catch {
		/* ignore */
	}
}
