/**
 * Coordinated Drive refresh with tip short-circuit + shared progress.
 * Chat-first: feed always before workspace / media / mail.
 */
import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { refreshChatFeed } from './chat.svelte.js';
import { getTip } from './drive/client.js';
import { activeSession, driveSession } from './drive/session.svelte.js';
import { getLastAppliedTip, setLastAppliedTip } from './drive/tip-gate.js';
import { refreshMail } from './mail.svelte.js';
import { refreshTracks } from './player.svelte.js';
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
 * Heavy domains after chat — counters, notes, player, mail.
 * Safe to fire-and-forget once chat has settled.
 */
export async function refreshBackgroundDrive() {
	const session = activeSession();
	if (!session) return;

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

		void refreshMembersAndAvatars().catch(() => {});

		const last = getLastAppliedTip(session);
		if (tip && tip === last && hasLocalWorkspace()) {
			setSyncRatio(1, 1);
			return;
		}

		await refreshFromDrive({ skipTipGate: true, outerProgress: true });
		setSyncRatio(0.72, 1);
		await refreshTracks();
		setSyncRatio(0.88, 1);
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

		await refreshFromDrive({ skipTipGate: true, outerProgress: true });
		setSyncRatio(0.72, 1);
		await refreshTracks();
		setSyncRatio(0.84, 1);
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
