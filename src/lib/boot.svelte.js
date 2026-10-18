/**
 * App boot + signed-in gate.
 * Signed in = Drive session on this device + mailbox email (“I am”).
 * PWA: hydrate local cache first so reopen never flashes empty/disconnected.
 */

import { actor, loadActor } from './actor.svelte.js';
import { driveSession, loadSessionFromStorage } from './drive/session.svelte.js';
import { hydrateTracksFromCache, refreshTracks } from './player.svelte.js';
import { hydrateWorkspaceFromCache, refreshFromDrive, ui } from './workspace.svelte.js';

/** @type {{ ready: boolean, listsReady: boolean }} */
export const appBoot = $state({ ready: false, listsReady: false });

/** Drive connected and identity chosen — show the operator shell. */
export function isSignedIn() {
	return Boolean(driveSession.connected && actor.email);
}

function activeSessionSafe() {
	return Boolean(driveSession.connected && driveSession.token && driveSession.rootKey);
}

/**
 * Restore localStorage + cache, unlock UI, then refresh Drive in background.
 * Call once from the root layout.
 */
export async function bootApp() {
	loadActor();
	loadSessionFromStorage();

	if (!activeSessionSafe()) {
		appBoot.listsReady = true;
		appBoot.ready = true;
		return;
	}

	// Connected — never show “Connect Drive” / empty feeds while we hydrate.
	ui.source = 'drive';
	driveSession.loading = true;
	appBoot.listsReady = false;

	try {
		const [ws, tr] = await Promise.all([hydrateWorkspaceFromCache(), hydrateTracksFromCache()]);
		if (ws || tr) {
			driveSession.loading = false;
			appBoot.listsReady = true;
		}
	} catch {
		/* ignore */
	}

	appBoot.ready = true;

	try {
		await Promise.all([refreshFromDrive(), refreshTracks()]);
	} catch {
		/* errors land on driveSession / playerUi */
	} finally {
		driveSession.loading = false;
		appBoot.listsReady = true;
	}
}
