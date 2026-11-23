/**
 * App boot + signed-in gate.
 * Signed in = Drive session on this device + mailbox email (“I am”).
 * Local-first: hydrate IDB/LS caches before listsReady; skip network when offline.
 */

import { actor, loadActor } from './actor.svelte.js';
import { refreshMembersAndAvatars, warmAvatarUrlsFromCache } from './avatar.svelte.js';
import { hydrateChatFeedFromCache, refreshChatFeed } from './chat.svelte.js';
import { loadDeviceProfiles } from './device-profiles.svelte.js';
import { ensurePendingFlushListeners, refreshBackgroundDrive } from './drive-refresh.js';
import { driveSession, loadSessionFromStorage, activeSession } from './drive/session.svelte.js';
import { hydrateMembersFromCache } from './members.svelte.js';
import { hydratePersonCursorsLocal, loadPersonCursors } from './person-cursors.svelte.js';
import { ensurePersistentStorage } from './offline-store.js';
import {
	absorbReturnToFromLocation,
	redirectToReturnToIfAny
} from './return-to.js';
import { ensureEggsExample } from './seed-eggs-forecast.js';
import { syncSpaceFromHost } from './sections.js';
import { hydrateWorkspaceFromCache, ui } from './workspace.svelte.js';

/**
 * @typedef {{ active: boolean, spaceName: string }} BootOnboarding
 * @type {{
 *   ready: boolean,
 *   listsReady: boolean,
 *   error: string,
 *   stuck: boolean,
 *   onboarding: BootOnboarding
 * }}
 */
export const appBoot = $state({
	ready: false,
	listsReady: false,
	error: '',
	stuck: false,
	onboarding: { active: false, spaceName: '' }
});

/**
 * Show Space-named loading gate after invite redeem until chat+mail are warm.
 * @param {string} [spaceName]
 */
export function beginInviteOnboarding(spaceName = '') {
	appBoot.onboarding = {
		active: true,
		spaceName: String(spaceName || '').trim()
	};
}

export function endInviteOnboarding() {
	appBoot.onboarding = { active: false, spaceName: appBoot.onboarding.spaceName || '' };
}

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
	appBoot.error = '';
	appBoot.stuck = false;
	/** Never leave BootSplash forever — blank dark/gray shell after crash. */
	const stuckTimer =
		typeof window !== 'undefined'
			? window.setTimeout(() => {
					if (!appBoot.ready) {
						appBoot.stuck = true;
						appBoot.error =
							appBoot.error ||
							'Startup is taking too long. Reload or reset the local shell.';
					}
				}, 6_000)
			: null;

	try {
		absorbReturnToFromLocation();
		syncSpaceFromHost();
		try {
			const { syncSpaceBrandDefaults } = await import('./space-brand.svelte.js');
			syncSpaceBrandDefaults();
		} catch {
			/* ignore */
		}
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
			const { hydrateMailTipCache, hydrateMailFromCache } = await import('./mail.svelte.js');
			hydrateMailTipCache();
			hydrateMailFromCache();
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
			appBoot.stuck = false;
			appBoot.ready = true;
			return;
		}

		// Player handoff: cookies already written — bounce back same-tab.
		if (isSignedIn() && redirectToReturnToIfAny()) {
			appBoot.listsReady = true;
			appBoot.stuck = false;
			appBoot.ready = true;
			return;
		}

		// Shell chrome first; lists wait on hydrate so we never flash empty offline.
		ui.source = 'drive';
		try {
			hydrateChatFeedFromCache();
		} catch (e) {
			console.warn('chat cache hydrate', e);
		}
		try {
			/* Sync before any notifications UI — hard refresh must not see seenAt=0. */
			hydratePersonCursorsLocal();
			void loadPersonCursors(activeSession());
		} catch (e) {
			console.warn('person cursors hydrate', e);
		}
		try {
			hydrateMembersFromCache(activeSession());
		} catch (e) {
			console.warn('members cache hydrate', e);
		}
		appBoot.stuck = false;
		appBoot.ready = true;
		driveSession.loading = false;
		void ensurePersistentStorage();

		try {
			const { loadSpaceBrand } = await import('./space-brand.svelte.js');
			void loadSpaceBrand().catch((e) => console.warn('space brand', e));
		} catch {
			/* ignore */
		}

		try {
			await hydrateWorkspaceFromCache();
		} catch {
			/* ignore */
		}
		/* Warm PFPs from IndexedDB before unlocking lists — small team, few blobs. */
		try {
			await warmAvatarUrlsFromCache();
		} catch {
			/* ignore */
		}
		appBoot.listsReady = true;
		ensurePendingFlushListeners();

		/* After Drive is up, sync space secrets so Mail/pubs work without Settings. */
		try {
			const email = String(actor.email || '')
				.trim()
				.toLowerCase();
			if (email.includes('@')) {
				const { hydrateDeviceFromSpaceSecrets, upsertAdminTokenSecret, upsertMailboxSecret } =
					await import('./drive/space-secrets.js');
				const { getMailboxPassword, setMailboxPassword } = await import('./jmap-mail.js');
				const { getAdminToken, setAdminToken } = await import('./mail-api.js');
				const session = activeSession();
				const localPw = getMailboxPassword(email);
				const localTok = getAdminToken();
				/* Push this device’s secrets up so invites/reinstall stay complete. */
				if (localPw) void upsertMailboxSecret(email, localPw, session).catch(() => {});
				if (localTok) void upsertAdminTokenSecret(localTok, session).catch(() => {});
				await hydrateDeviceFromSpaceSecrets(session, email, {
					setMailboxPassword,
					setAdminToken,
					getAdminToken
				});
			}
		} catch (e) {
			console.warn('space secrets hydrate', e);
		}

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
				try {
					const { flushPendingPushOpen } = await import('./chat-sync.svelte.js');
					flushPendingPushOpen();
				} catch {
					/* ignore */
				}
				void refreshMembersAndAvatars().catch((e) => console.warn('members/avatars', e));
				void refreshBackgroundDrive().then(() => {
					/* Opt-in demo seed only — never auto-seed customer Spaces. */
					const seedEggs =
						typeof import.meta !== 'undefined' &&
						String(import.meta.env?.PUBLIC_SEED_EGGS_EXAMPLE || '').trim() === '1';
					if (seedEggs) {
						void ensureEggsExample().catch((e) => console.warn('ensureEggsExample', e));
					}
				});
			} catch {
				/* errors land on driveSession / chatUi — local data stays */
			}
		})();
	} catch (e) {
		console.error('bootApp', e);
		appBoot.error = e instanceof Error ? e.message : String(e);
		appBoot.ready = true;
		appBoot.listsReady = true;
	} finally {
		if (stuckTimer != null) clearTimeout(stuckTimer);
	}
}
