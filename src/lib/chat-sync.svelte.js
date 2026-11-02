/**
 * Fast chat wake: realtime tip bus first, tip poll as fallback while chat is open.
 * Also refreshes members/avatars when tip moves (cross-device profile pics).
 */

import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { refreshChatFeed, chatUi, markIncomingMessagesRead } from './chat.svelte.js';
import { getTip } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';

const POLL_MS = 2000;
const STALE_CHAT_MS = 15_000;

let pollTimer = /** @type {ReturnType<typeof setInterval> | null} */ (null);
let lastTip = '';
let lastChatPull = 0;
let watching = false;
let inFlight = false;
/** Tip hash from the bus while a pull was already running — run again after. */
let pendingBusTip = /** @type {string | null} */ (null);

export async function pullChatIfNeeded(force = false) {
	const session = activeSession();
	if (!session || inFlight) return;
	/* Don't clobber an in-flight send with a mid-write tip snapshot. */
	if (chatUi.posting) return;
	const now = Date.now();
	if (!force && now - lastChatPull < 800) return;
	inFlight = true;
	try {
		let tip = '';
		try {
			tip = await getTip(session);
		} catch {
			tip = '';
		}
		const tipChanged = Boolean(tip && tip !== lastTip);
		const stale = now - lastChatPull > STALE_CHAT_MS;
		if (force || tipChanged || lastChatPull === 0 || (stale && chatUi.activeChannelId)) {
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
		if (queued) void wakeChatFromTip(queued);
	}
}

/**
 * Realtime bus tip-wake: skip getTip RTT, refresh feed ASAP.
 * @param {string} tip
 */
export async function wakeChatFromTip(tip) {
	const t = String(tip || '').trim();
	if (!t) {
		void pullChatIfNeeded(true);
		return;
	}
	if (t === lastTip) return;
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
	lastTip = t;
	inFlight = true;
	try {
		await refreshChatFeed();
		lastChatPull = Date.now();
		void markIncomingMessagesRead();
		void refreshMembersAndAvatars().catch(() => {});
	} finally {
		inFlight = false;
		const queued = pendingBusTip;
		pendingBusTip = null;
		if (queued && queued !== lastTip) void wakeChatFromTip(queued);
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
