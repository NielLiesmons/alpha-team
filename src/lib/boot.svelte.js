/**
 * App boot + signed-in gate.
 * Signed in = Drive session on this device + mailbox email (“I am”).
 * Local-first: hydrate IDB/LS caches before listsReady; skip network when offline.
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

function isOffline() {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Restore localStorage + cache, unlock UI, then refresh Drive in background when online.
 * Call once from the root layout.
 */
export async function bootApp() {
	absorbReturnToFromLocation();
	loadActor();
	loadDeviceProfiles();
	loadSessionFromStorage();
	try {
		const { refreshApprovedContacts } = await import('./mail-contacts.svelte.js');
		refreshApprovedContacts();
	} catch {
		/* ignore */
	}
	try {
		const { hydrateMailTipCache } = await import('./mail.svelte.js');
		hydrateMailTipCache();
	} catch {
		/* ignore */
	}
	try {
		const { refreshCustomEmojis } = await import('./custom-emoji.svelte.js');
		void refreshCustomEmojis().catch(() => {});
	} catch {
		/* ignore */
	}

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

	// Shell chrome first; lists wait on hydrate so we never flash empty offline.
	ui.source = 'drive';
	hydrateChatFeedFromCache();
	appBoot.ready = true;
	driveSession.loading = false;
	void ensurePersistentStorage();

	try {
		await hydrateWorkspaceFromCache();
	} catch {
		/* ignore */
	}
	appBoot.listsReady = true;

	if (isOffline()) {
		driveSession.syncing = false;
		return;
	}

	void (async () => {
		try {
			/* Session is up — pull Primary approvals from Drive so phone/desktop match. */
			try {
				const { syncApprovedContactsFromDrive } = await import('./mail-contacts.svelte.js');
				await syncApprovedContactsFromDrive();
			} catch (e) {
				console.warn('mail approved sync', e);
			}
			await refreshChatFeed();
			void refreshMembersAndAvatars().catch((e) => console.warn('members/avatars', e));
			void refreshBackgroundDrive().then(() => {
				void ensureEggsExample().catch((e) => console.warn('ensureEggsExample', e));
			});
		} catch {
			/* errors land on driveSession / chatUi — local data stays */
		}
	})();
}
