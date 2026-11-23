/**
 * Coordinated Drive refresh with tip short-circuit + section-scoped progress.
 * Chat-first: feed always before workspace / mail.
 * After tip mismatch: fetch skinny space-meta change-summary for badges /
 * selective title spinners, then defer fat crawl.
 * Media library refresh lives in alpha-player.
 */
import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { refreshChatFeed } from './chat.svelte.js';
import {
	changeSummaryUi,
	dirtySectionsFromSummary,
	fetchChangeSummary,
	hydrateChangeSummaryLocal,
	markChangeSummaryApplied,
	sectionForPath
} from './drive/change-summary.svelte.js';
import { getTip } from './drive/client.js';
import { activeSession, driveSession } from './drive/session.svelte.js';
import { getLastAppliedTip, setLastAppliedTip } from './drive/tip-gate.js';
import { refreshMail } from './mail.svelte.js';
import { beginSync, endSync, setSyncRatio } from './sync-progress.svelte.js';
import {
	enterprises,
	flushPendingWorkspace,
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

function isOffline() {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

let pendingFlushListenersBound = false;

/**
 * Flush deferred offline Notes/Tasks when the device returns online or foregrounds.
 * Call once from boot (idempotent).
 */
export function ensurePendingFlushListeners() {
	if (pendingFlushListenersBound || typeof window === 'undefined') return;
	pendingFlushListenersBound = true;
	window.addEventListener('online', () => {
		void flushPendingWorkspace()
			.then(() => refreshBackgroundDrive())
			.catch((e) => console.warn('online pending flush', e));
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState !== 'visible') return;
		if (isOffline()) return;
		void flushPendingWorkspace().catch((e) => console.warn('visibility pending flush', e));
	});
}

/** @returns {import('./drive/change-summary.svelte.js').SyncSection | null} */
function currentSection() {
	if (typeof location === 'undefined') return null;
	return sectionForPath(location.pathname);
}

/**
 * Title spinner only for the open section, and only when that type is dirty.
 * @param {import('./drive/change-summary.svelte.js').SyncSection[]} dirty
 * @param {boolean} tipMismatch
 */
function beginTitleSpinForRoute(dirty, tipMismatch) {
	const route = currentSection();
	if (!route || route === 'chat') return;
	const legacyNoSummary = tipMismatch && !changeSummaryUi.doc.updated_at;
	const hit =
		dirty.includes(/** @type {any} */ (route)) ||
		(legacyNoSummary && route !== 'mail');
	if (hit) beginSync('', [route]);
	else if (route === 'mail') beginSync('', ['mail']);
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
export async function refreshBackgroundDrive() {
	const session = activeSession();
	if (!session) return;

	if (isOffline() && hasLocalWorkspace()) {
		driveSession.loading = false;
		driveSession.syncing = false;
		return;
	}

	hydrateChangeSummaryLocal(session);
	driveSession.syncing = true;
	driveSession.error = null;

	try {
		const { chatUi } = await import('./chat.svelte.js');
		const { mailUi } = await import('./mail.svelte.js');
		/* Yield while a send is in flight — don't steal bandwidth / thrash mail UI. */
		for (let i = 0; i < 40 && (chatUi.posting || mailUi.sending); i++) {
			await new Promise((r) => setTimeout(r, 50));
		}
		if (mailUi.sending) return;

		/* Offline creates must upload even when tip is unchanged (no peer crawl yet). */
		await flushPendingWorkspace();

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

		const tipMismatch = Boolean(tip && tip !== last);
		if (tipMismatch) await fetchChangeSummary(session);
		const dirty = dirtySectionsFromSummary(tipMismatch);
		beginTitleSpinForRoute(dirty, tipMismatch);

		await refreshFromDrive({ skipTipGate: true, outerProgress: true });
		setSyncRatio(0.8, 1);
		await refreshMail();
		setSyncRatio(1, 1);

		if (tip) setLastAppliedTip(session, tip);
		markChangeSummaryApplied(session);
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

	hydrateChangeSummaryLocal(session);
	driveSession.syncing = true;
	driveSession.error = null;

	try {
		/* Push deferred offline Notes/Tasks before tip short-circuit. */
		await flushPendingWorkspace();

		let tip = '';
		try {
			tip = await getTip(session);
		} catch {
			tip = '';
		}

		/* Title chrome: spin the open section for the whole refresh (PTR / boot). */
		const route = currentSection();
		if (route) beginSync('', [route]);
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

		const tipMismatch = Boolean(tip && tip !== last);
		if (tipMismatch) await fetchChangeSummary(session);
		const dirty = dirtySectionsFromSummary(tipMismatch);
		beginTitleSpinForRoute(dirty, tipMismatch);

		await refreshFromDrive({ skipTipGate: true, outerProgress: true });
		setSyncRatio(0.8, 1);
		await refreshMail();
		setSyncRatio(1, 1);

		if (tip) setLastAppliedTip(session, tip);
		markChangeSummaryApplied(session);
	} catch (e) {
		driveSession.error = e instanceof Error ? e.message : String(e);
	} finally {
		driveSession.syncing = false;
		driveSession.loading = false;
		endSync();
	}
}
