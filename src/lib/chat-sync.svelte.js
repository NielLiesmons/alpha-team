/**
 * Fast chat wake: realtime tip bus first, tip poll as fallback while chat is open.
 * Also refreshes members/avatars when tip moves (cross-device profile pics).
 */

import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { refreshChatFeed, chatUi, markIncomingMessagesRead } from './chat.svelte.js';
import { getTip, peekCachedTip } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';

/*
 * Focused chat: tip-only poll. Interval starts after the previous getTip finishes
 * so a ~500ms tip RTT does not stampede /v1/tip (setInterval would overlap).
 */
const POLL_MS = 500;
/** Coalesce bursts without delaying tip-change detection by a full poll. */
const PULL_COALESCE_MS = 80;
/** Keep read-receipt tip writes off the message tip critical path. */
const READ_RECEIPT_DELAY_MS = 2_500;

let pollTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
let lastTip = '';
let lastChatPull = 0;
let watching = false;
let inFlight = false;
/** Tip hash from the bus while a pull was already running — run again after. */
let pendingBusTip = /** @type {string | null} */ (null);
/** Poll/force arrived while inFlight — run another tip check after. */
let pendingRepull = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let readReceiptTimer = null;

function scheduleReadReceipts() {
	if (readReceiptTimer != null) clearTimeout(readReceiptTimer);
	readReceiptTimer = setTimeout(() => {
		readReceiptTimer = null;
		if (chatUi.posting) {
			scheduleReadReceipts();
			return;
		}
		void markIncomingMessagesRead();
	}, READ_RECEIPT_DELAY_MS);
}

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
	if (!force && now - lastChatPull < PULL_COALESCE_MS) return;
	inFlight = true;
	const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
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
			/* Receipt tip writes compete with message tip CAS — defer. */
			scheduleReadReceipts();
			if (tipChanged || force) void refreshMembersAndAvatars().catch(() => {});
			if (typeof console !== 'undefined' && console.debug) {
				console.debug('[chat-latency] pullChat', {
					ms: Math.round(
						(typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
					),
					tipChanged,
					force
				});
			}
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
	const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
	try {
		await refreshChatFeed();
		/*
		 * Prefer Drive tip after load so poll self-heals if the bus tip raced ahead
		 * of a visible putTip. Fall back to the bus hash when cache is empty.
		 */
		lastTip = peekCachedTip(session) || t;
		lastChatPull = Date.now();
		scheduleReadReceipts();
		void refreshMembersAndAvatars().catch(() => {});
		if (typeof console !== 'undefined' && console.debug) {
			console.debug('[chat-latency] tipWake', {
				ms: Math.round(
					(typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
				),
				tip: t.slice(0, 12)
			});
		}
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

function armChatTipPoll() {
	if (!watching) return;
	if (pollTimer != null) clearTimeout(pollTimer);
	pollTimer = setTimeout(async () => {
		pollTimer = null;
		if (!watching) return;
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
			/* Tip poll only — full feed reload happens when tip hash moves. */
			await pullChatIfNeeded(false);
		}
		armChatTipPoll();
	}, POLL_MS);
}

/** Call when ChatChannelPanel mounts / chat route focused. */
export function startChatTipPoll() {
	watching = true;
	if (pollTimer != null) return;
	void pullChatIfNeeded(true).finally(() => armChatTipPoll());
}

export function stopChatTipPoll() {
	watching = false;
	if (pollTimer != null) {
		clearTimeout(pollTimer);
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
