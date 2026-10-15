/**
 * App boot + signed-in gate.
 * Signed in = Drive session on this device + mailbox email (“I am”).
 */

import { actor, loadActor } from './actor.svelte.js';
import { driveSession, loadSessionFromStorage } from './drive/session.svelte.js';
import { refreshFromDrive } from './workspace.svelte.js';

/** @type {{ ready: boolean }} */
export const appBoot = $state({ ready: false });

/** Drive connected and identity chosen — show the operator shell. */
export function isSignedIn() {
	return Boolean(driveSession.connected && actor.email);
}

/**
 * Restore localStorage, load Drive when possible, then unlock the UI.
 * Call once from the root layout.
 */
export async function bootApp() {
	loadActor();
	loadSessionFromStorage();
	try {
		await refreshFromDrive();
	} finally {
		appBoot.ready = true;
	}
}
