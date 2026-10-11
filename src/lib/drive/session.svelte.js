/**
 * Device-only Drive credentials (localStorage). Never ship root key in the build.
 */

const STORAGE_KEY = 'alpha.drive.session.v1';

/** @type {{ url: string, token: string, rootKey: string, connected: boolean, error: string | null, loading: boolean }} */
export const driveSession = $state({
	url: 'https://drive.bley.farm',
	token: '',
	rootKey: '',
	connected: false,
	error: null,
	loading: false
});

function readStored() {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

export function loadSessionFromStorage() {
	const stored = readStored();
	if (!stored) return;
	driveSession.url = stored.url || driveSession.url;
	driveSession.token = stored.token || '';
	driveSession.rootKey = stored.rootKey || '';
	driveSession.connected = Boolean(stored.token && stored.rootKey);
}

/**
 * @param {{ url: string, token: string, rootKey: string }} creds
 */
export function saveSession(creds) {
	driveSession.url = creds.url.replace(/\/$/, '');
	driveSession.token = creds.token.trim();
	driveSession.rootKey = creds.rootKey.trim();
	driveSession.connected = Boolean(driveSession.token && driveSession.rootKey);
	driveSession.error = null;
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			url: driveSession.url,
			token: driveSession.token,
			rootKey: driveSession.rootKey
		})
	);
}

export function clearSession() {
	driveSession.token = '';
	driveSession.rootKey = '';
	driveSession.connected = false;
	driveSession.error = null;
	localStorage.removeItem(STORAGE_KEY);
}

/** @returns {import('./client.js').DriveSession | null} */
export function activeSession() {
	if (!driveSession.connected) return null;
	return {
		url: driveSession.url,
		token: driveSession.token,
		rootKey: driveSession.rootKey
	};
}
