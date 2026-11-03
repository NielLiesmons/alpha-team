/**
 * App boot + signed-in gate.
 * Signed in = Drive session on this device + mailbox email (“I am”).
 * PWA: hydrate local cache first so reopen never flashes empty/disconnected.
 * Chat-first: feed refresh before workspace / mail crawl.
 * Media library lives on player.{apex} (shared apex-domain session).
 */

import { actor, loadActor } from './actor.svelte.js';
import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { hydrateChatFeedFromCache, refreshChatFeed } from './chat.svelte.js';
import { loadDeviceProfiles } from './device-profiles.svelte.js';
import { refreshBackgroundDrive } from './drive-refresh.js';
import { driveSession, loadSessionFromStorage } from './drive/session.svelte.js';
import { ensurePersistentStorage } from './offline-store.js';
import {
	absorbReturnToFromLocation,
	redirectToReturnToIfAny
} from './return-to.js';
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
	absorbReturnToFromLocation();
	loadActor();
	loadDeviceProfiles();
	loadSessionFromStorage();

	if (!activeSessionSafe()) {
		appBoot.listsReady = true;
		appBoot.ready = true;
		return;
	}

	// Player handoff: cookies already written — bounce back same-tab.
	if (isSignedIn() && redirectToReturnToIfAny()) {
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
			await hydrateWorkspaceFromCache();
		} catch {
			/* ignore */
		}
		try {
			/* 1) Chat feed — only thing that must feel instant. */
			await refreshChatFeed();
			/* 2) Members + avatars (light) so pics set on another device show up. */
			void refreshMembersAndAvatars().catch((e) => console.warn('members/avatars', e));
			/* 3) Heavy workspace / mail — never blocks chat. Player is a separate app. */
			void refreshBackgroundDrive().then(() => {
				void ensureEggsExample().catch((e) => console.warn('ensureEggsExample', e));
			});
		} catch {
			/* errors land on driveSession / chatUi */
		}
	})();
}
