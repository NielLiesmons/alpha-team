/**
 * Coordinated Drive refresh with tip short-circuit + shared progress.
 */
import { chatFeed, refreshChatFeed } from './chat.svelte.js';
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
 * Pull-to-refresh / boot: one tip check, then parallel domain refreshes.
 * Skips heavy work when tip is unchanged and cache is warm.
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

		const last = getLastAppliedTip(session);
		if (tip && tip === last && hasLocalWorkspace()) {
			/* Tip unchanged — still pull chat if the feed cache is cold. */
			if (chatFeed.length === 0) await refreshChatFeed();
			setSyncRatio(1, 1);
			return;
		}

		/* Workspace reports fine-grained leaf progress; then media / chat / mail. */
		await refreshFromDrive({ skipTipGate: true, outerProgress: true });
		setSyncRatio(0.72, 1);
		await refreshTracks();
		setSyncRatio(0.84, 1);
		await refreshChatFeed();
		setSyncRatio(0.92, 1);
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
