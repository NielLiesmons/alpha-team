/**
 * App boot + signed-in gate.
 * Signed in = Drive session on this device + mailbox email (“I am”).
 * PWA: hydrate IndexedDB first so home-screen reopen feels instant.
 */

import { actor, loadActor } from './actor.svelte.js';
import { driveSession, loadSessionFromStorage } from './drive/session.svelte.js';
import { hydrateWorkspaceFromCache, refreshFromDrive } from './workspace.svelte.js';
import { hydrateTracksFromCache, refreshTracks } from './player.svelte.js';

/** @type {{ ready: boolean }} */
export const appBoot = $state({ ready: false });

/** Drive connected and identity chosen — show the operator shell. */
export function isSignedIn() {
	return Boolean(driveSession.connected && actor.email);
}

/**
 * Restore localStorage + IndexedDB, unlock UI, then refresh Drive in background.
 * Call once from the root layout.
 */
export async function bootApp() {
	loadActor();
	loadSessionFromStorage();
	try {
		await Promise.all([hydrateWorkspaceFromCache(), hydrateTracksFromCache()]);
	} catch {
		/* ignore cache failures */
	} finally {
		appBoot.ready = true;
	}

	if (!activeSessionSafe()) return;
	void refreshFromDrive();
	void refreshTracks();
}

function activeSessionSafe() {
	return Boolean(driveSession.connected && driveSession.token && driveSession.rootKey);
}
