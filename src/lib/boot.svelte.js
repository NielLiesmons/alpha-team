/**
 * App boot + signed-in gate.
 * Signed in = Drive session on this device + mailbox email (“I am”).
 * PWA: hydrate local cache first so reopen never flashes empty/disconnected.
 */

import { actor, loadActor } from './actor.svelte.js';
import { hydrateChatFeedFromCache } from './chat.svelte.js';
import { loadDeviceProfiles } from './device-profiles.svelte.js';
import { refreshAllDrive } from './drive-refresh.js';
import { driveSession, loadSessionFromStorage } from './drive/session.svelte.js';
import { ensurePersistentStorage } from './offline-store.js';
import { hydrateTracksFromCache } from './player.svelte.js';
import { ensureEggsExample } from './seed-eggs-forecast.js';
import { hydrateWorkspaceFromCache, ui } from './workspace.svelte.js';

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
	loadDeviceProfiles();
	loadSessionFromStorage();

	if (!activeSessionSafe()) {
		appBoot.listsReady = true;
		appBoot.ready = true;
		return;
	}

	// Connected — unlock shell immediately; never block Chat on Drive crawl.
	ui.source = 'drive';
	hydrateChatFeedFromCache();
	appBoot.ready = true;
	appBoot.listsReady = true;
	driveSession.loading = false;
	void ensurePersistentStorage();

	void (async () => {
		try {
			await Promise.all([hydrateWorkspaceFromCache(), hydrateTracksFromCache()]);
		} catch {
			/* ignore */
		}
		try {
			await refreshAllDrive();
			void ensureEggsExample().catch((e) => console.warn('ensureEggsExample', e));
		} catch {
			/* errors land on driveSession / playerUi */
		}
	})();
}
