/**
 * Fast chat wake: realtime tip bus first, tip poll as fallback while chat is open.
 * Also refreshes members/avatars when tip moves (cross-device profile pics).
 */

import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { refreshChatFeed, chatUi, markIncomingMessagesRead } from './chat.svelte.js';
import { getTip, peekCachedTip } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';

const POLL_MS = 1500;

let pollTimer = /** @type {ReturnType<typeof setInterval> | null} */ (null);
let lastTip = '';
let lastChatPull = 0;
let watching = false;
let inFlight = false;
/** Tip hash from the bus while a pull was already running — run again after. */
let pendingBusTip = /** @type {string | null} */ (null);
/** Poll/force arrived while inFlight — run another tip check after. */
let pendingRepull = false;

export async function pullChatIfNeeded(force = false) {
	const session = activeSession();
	if (!session) return;
	/* Don't clobber an in-flight send with a mid-write tip snapshot. */
	if (chatUi.posting) {
		pendingRepull = true;
		return;
	}
	if (inFlight) {
		pendingRepull = true;
		return;
	}
	const now = Date.now();
	if (!force && now - lastChatPull < 400) return;
	inFlight = true;
	try {
		let tip = '';
		try {
			tip = await getTip(session);
		} catch {
			tip = '';
		}
		const tipChanged = Boolean(tip && tip !== lastTip);
		/*
		 * Only reload the feed when tip moved (or first/forced pull).
		 * A tip-unchanged “stale” full refresh stampeded /v1/blocks, starved tip
		 * PUT/GET, and made peer delivery take minutes.
		 */
		if (force || tipChanged || lastChatPull === 0) {
			if (tip) lastTip = tip;
			await refreshChatFeed();
			lastChatPull = Date.now();
			void markIncomingMessagesRead();
			if (tipChanged || force) void refreshMembersAndAvatars().catch(() => {});
		}
	} finally {
		inFlight = false;
		const queued = pendingBusTip;
		pendingBusTip = null;
		const repull = pendingRepull;
		pendingRepull = false;
		if (queued) void wakeChatFromTip(queued);
		else if (repull) void pullChatIfNeeded(true);
	}
}

/**
 * Drain a tip-wake that arrived while we were posting (sender echo / peer tip).
 * Call after chatUi.posting clears.
 */
export function flushChatWake() {
	const queued = pendingBusTip;
	pendingBusTip = null;
	pendingRepull = false;
	if (queued) {
		void wakeChatFromTip(queued);
		return;
	}
	void pullChatIfNeeded(true);
}

/**
 * Realtime bus tip-wake: refresh feed ASAP (Drive remains SoT).
 * Do not stamp lastTip before refresh — a premature stamp skipped later polls
 * when Drive was briefly behind the bus tip.
 * @param {string} tip
 */
export async function wakeChatFromTip(tip) {
	const t = String(tip || '').trim();
	if (!t) {
		void pullChatIfNeeded(true);
		return;
	}
	/* Same tip again within a short window is a no-op; later re-wakes still refresh. */
	const now = Date.now();
	if (t === lastTip && now - lastChatPull < 1_500) return;
	const session = activeSession();
	if (!session) return;
	/* Sender may still be posting — receivers never have posting set. */
	if (chatUi.posting) {
		pendingBusTip = t;
		return;
	}
	if (inFlight) {
		pendingBusTip = t;
		return;
	}
	inFlight = true;
	try {
		await refreshChatFeed();
		/*
		 * Prefer Drive tip after load so poll self-heals if the bus tip raced ahead
		 * of a visible putTip. Fall back to the bus hash when cache is empty.
		 */
		lastTip = peekCachedTip(session) || t;
		lastChatPull = Date.now();
		void markIncomingMessagesRead();
		void refreshMembersAndAvatars().catch(() => {});
	} finally {
		inFlight = false;
		const queued = pendingBusTip;
		pendingBusTip = null;
		const repull = pendingRepull;
		pendingRepull = false;
		if (queued && queued !== lastTip) void wakeChatFromTip(queued);
		else if (repull) void pullChatIfNeeded(true);
	}
}

function onVisibility() {
	if (typeof document === 'undefined') return;
	if (document.visibilityState === 'visible') {
		void pullChatIfNeeded(true);
		startChatTipPoll();
	} else {
		stopChatTipPoll();
	}
}

function onSwMessage(/** @type {MessageEvent} */ ev) {
	const data = ev?.data;
	if (!data || typeof data !== 'object') return;
	if (data.type === 'chat-wake' || data.type === 'PUSH_RECEIVED') {
		void pullChatIfNeeded(true);
	}
}

/** Call when ChatChannelPanel mounts / chat route focused. */
export function startChatTipPoll() {
	watching = true;
	if (pollTimer != null) return;
	void pullChatIfNeeded(true);
	pollTimer = setInterval(() => {
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
		if (!watching) return;
		/* Tip poll only — full feed reload happens when tip hash moves. */
		void pullChatIfNeeded(false);
	}, POLL_MS);
}

export function stopChatTipPoll() {
	watching = false;
	if (pollTimer != null) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

/** Once from root layout — focus/push wake without requiring chat mount. */
export function initChatWakeListeners() {
	if (typeof window === 'undefined') return () => {};
	const onFocus = () => void pullChatIfNeeded(true);
	const onPageShow = () => void pullChatIfNeeded(true);
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('focus', onFocus);
	window.addEventListener('pageshow', onPageShow);
	navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('focus', onFocus);
		window.removeEventListener('pageshow', onPageShow);
		navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
		stopChatTipPoll();
	};
}
