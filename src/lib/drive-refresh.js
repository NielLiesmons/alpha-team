/**
 * Coordinated Drive refresh with tip short-circuit + shared progress.
 * Chat-first: feed always before workspace / mail.
 * Media library refresh lives in alpha-player.
 */
import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { refreshChatFeed } from './chat.svelte.js';
import { getTip } from './drive/client.js';
import { activeSession, driveSession } from './drive/session.svelte.js';
import { getLastAppliedTip, setLastAppliedTip } from './drive/tip-gate.js';
import { refreshMail } from './mail.svelte.js';
import { beginSync, endSync, setSyncRatio } from './sync-progress.svelte.js';
import {
	enterprises,
	notes,
	projects,
	refreshFromDrive,
	tasks
} from './workspace.svelte.js';

function hasLocalWorkspace() {
	return (
		tasks.length > 0 ||
		projects.length > 0 ||
		notes.length > 0 ||
		enterprises.length > 0
	);
}

/**
 * Urgent path — paint / refresh chat feed only.
 */
export async function refreshChatUrgent() {
	const session = activeSession();
	if (!session) return;
	await refreshChatFeed();
}

/**
 * Heavy domains after chat — counters, notes, mail.
 * Safe to fire-and-forget once chat has settled.
 */
function isOffline() {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function refreshBackgroundDrive() {
	const session = activeSession();
	if (!session) return;

	if (isOffline() && hasLocalWorkspace()) {
		driveSession.loading = false;
		driveSession.syncing = false;
		return;
	}

	beginSync('Updating');
	driveSession.syncing = true;
	driveSession.error = null;

	try {
		const { chatUi } = await import('./chat.svelte.js');
		/* Yield while a send is in flight — don't steal bandwidth from tip commit / ✓. */
		for (let i = 0; i < 40 && chatUi.posting; i++) {
			await new Promise((r) => setTimeout(r, 50));
		}

		let tip = '';
		try {
			tip = await getTip(session);
		} catch {
			tip = '';
		}

		void refreshMembersAndAvatars().catch(() => {});

		const last = getLastAppliedTip(session);
		if (tip && tip === last && hasLocalWorkspace()) {
			setSyncRatio(1, 1);
			return;
		}
		/* No tip (offline) but we have local data — keep it. */
		if (!tip && hasLocalWorkspace()) {
			setSyncRatio(1, 1);
			return;
		}

		await refreshFromDrive({ skipTipGate: true, outerProgress: true });
		setSyncRatio(0.8, 1);
		await refreshMail();
		setSyncRatio(1, 1);

		if (tip) setLastAppliedTip(session, tip);
	} catch (e) {
		driveSession.error = e instanceof Error ? e.message : String(e);
	} finally {
		driveSession.syncing = false;
		driveSession.loading = false;
		endSync();
	}
}

/**
 * Pull-to-refresh / boot: chat first, then background domains.
 * Tip-unchanged still refreshes chat (peer messages).
 */
export async function refreshAllDrive() {
	const session = activeSession();
	if (!session) return;

	if (isOffline() && hasLocalWorkspace()) {
		/* Still refresh chat from local cache path if any — skip network crawl. */
		try {
			await refreshChatFeed();
		} catch {
			/* ignore */
		}
		driveSession.loading = false;
		driveSession.syncing = false;
		return;
	}

	beginSync('Updating');
	driveSession.syncing = true;
	driveSession.error = null;

	try {
		let tip = '';
		try {
			tip = await getTip(session);
		} catch {
			tip = '';
		}

		/* Chat always first — never wait on workspace crawl. */
		await refreshChatFeed();
		setSyncRatio(0.18, 1);
		void refreshMembersAndAvatars().catch(() => {});
		setSyncRatio(0.24, 1);

		const last = getLastAppliedTip(session);
		if (tip && tip === last && hasLocalWorkspace()) {
			setSyncRatio(1, 1);
			return;
		}
		if (!tip && hasLocalWorkspace()) {
			setSyncRatio(1, 1);
			return;
		}

		await refreshFromDrive({ skipTipGate: true, outerProgress: true });
		setSyncRatio(0.8, 1);
		await refreshMail();
		setSyncRatio(1, 1);

		if (tip) setLastAppliedTip(session, tip);
	} catch (e) {
		driveSession.error = e instanceof Error ? e.message : String(e);
	} finally {
		driveSession.syncing = false;
		driveSession.loading = false;
		endSync();
	}
}
