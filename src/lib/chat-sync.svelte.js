/**
 * Fast chat wake loop: tip poll while chat is open + focus/push refresh.
 */

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

export async function pullChatIfNeeded(force = false) {
	const session = activeSession();
	if (!session || inFlight) return;
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
		}
	} finally {
		inFlight = false;
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
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('focus', () => void pullChatIfNeeded(true));
	window.addEventListener('pageshow', () => void pullChatIfNeeded(true));
	navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('focus', () => void pullChatIfNeeded(true));
		navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
		stopChatTipPoll();
	};
}
