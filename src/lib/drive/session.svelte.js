/**
 * Device-only Drive credentials. Shared across Admin + Player on the Space apex
 * via cookie Domain=.{apex} (see cross-domain-storage.js).
 */

import {
	DRIVE_SESSION_KEY,
	clearShared,
	readShared,
	writeShared
} from '../cross-domain-storage.js';

/** @type {{ url: string, token: string, rootKey: string, connected: boolean, error: string | null, loading: boolean, syncing: boolean }} */
export const driveSession = $state({
	url: '',
	token: '',
	rootKey: '',
	connected: false,
	error: null,
	loading: false,
	/** True while a background Drive refresh is in flight (cache may already be shown). */
	syncing: false
});

function readStored() {
	try {
		const raw = readShared(DRIVE_SESSION_KEY);
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
	writeShared(
		DRIVE_SESSION_KEY,
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
	clearShared(DRIVE_SESSION_KEY);
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
