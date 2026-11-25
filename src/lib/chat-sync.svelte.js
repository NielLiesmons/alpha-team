/**
 * Fast chat wake: realtime tip bus first, tip poll as fallback while chat is open.
 * Also refreshes members/avatars when tip moves (cross-device profile pics).
 */

import { refreshMembersAndAvatars } from './avatar.svelte.js';
import { refreshChatFeed, chatUi, markIncomingMessagesRead } from './chat.svelte.js';
import {
	CHAT_TIP_NAME,
	getNamedTip,
	peekCachedChatTip
} from './drive/client.js';
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
			tip = await getNamedTip(session, CHAT_TIP_NAME);
		} catch {
			tip = '';
		}
		const tipChanged = Boolean(tip && tip !== lastTip);
		/*
		 * Only reload the feed when the chat named tip moved (or first/forced pull).
		 * Space tip changes (cursors, tasks) must not stampede chat leaf fetches.
		 */
		if (force || tipChanged || lastChatPull === 0) {
			await refreshChatFeed();
			/* Stamp after refresh so a failed/empty apply cannot skip later wakes. */
			if (tip) lastTip = tip;
			else lastTip = peekCachedChatTip(session) || lastTip;
			lastChatPull = Date.now();
			/* Receipt tip writes compete with message tip CAS — defer. */
			scheduleReadReceipts();
			/* Members/avatars live on Space tip — refresh on force only, not every chat tip. */
			if (force) void refreshMembersAndAvatars().catch(() => {});
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
		/* Tip-check only — force:true here stampeded full feed reloads every poll. */
		else if (repull) void pullChatIfNeeded(false);
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
 * Pass the bus tip into the mailbox walk so we never reuse a stale in-flight
 * getNamedTip from the 500ms poll (that raced wakes and skipped new messages).
 * Only stamp lastTip after the walk remembers that tip — never the bare bus
 * hash alone (that skipped later polls when the pull missed the leaf).
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
		await refreshChatFeed({ tip: t });
		const cached = peekCachedChatTip(session) || '';
		/*
		 * Only advance lastTip when the mailbox walk actually landed on this tip.
		 * Falling back to bare bus `t` marked the tip "seen" without the leaf and
		 * made the 500ms poll skip tipChanged forever.
		 */
		if (cached === t) lastTip = t;
		else if (cached) lastTip = cached;
		lastChatPull = Date.now();
		scheduleReadReceipts();
		if (typeof console !== 'undefined' && console.debug) {
			console.debug('[chat-latency] tipWake', {
				ms: Math.round(
					(typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
				),
				tip: t.slice(0, 12),
				cached: cached.slice(0, 12)
			});
		}
	} finally {
		inFlight = false;
		const queued = pendingBusTip;
		pendingBusTip = null;
		const repull = pendingRepull;
		pendingRepull = false;
		if (queued && queued !== lastTip) void wakeChatFromTip(queued);
		else if (repull) void pullChatIfNeeded(false);
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

/** @type {{ tip: string, messageId: string } | null} */
let pendingPushOpen = null;

/**
 * Notification tap / push deep-link: force chat pull (and tip wake when known).
 * Queues until Drive session exists (cold start from killed PWA).
 * @param {{ tip?: string, messageId?: string }} [opts]
 */
export function openChatFromPush(opts = {}) {
	const tip = String(opts.tip || '').trim();
	const messageId = String(opts.messageId || '').trim();
	if (typeof window !== 'undefined') {
		try {
			const path = window.location?.pathname || '';
			if (!path.startsWith('/chat')) {
				void import('$app/navigation')
					.then(({ goto }) => {
						void goto('/chat', { replaceState: false, keepFocus: true, noScroll: true });
					})
					.catch(() => {
						try {
							window.history.pushState({}, '', '/chat');
							window.dispatchEvent(new PopStateEvent('popstate'));
						} catch {
							/* ignore */
						}
					});
			}
		} catch {
			/* ignore */
		}
	}
	if (!activeSession()) {
		pendingPushOpen = { tip, messageId };
		return;
	}
	pendingPushOpen = null;
	startChatTipPoll();
	if (tip) void wakeChatFromTip(tip);
	else void pullChatIfNeeded(true);
}

/** Call after Drive session is up (boot) so notification taps aren't lost. */
export function flushPendingPushOpen() {
	if (!pendingPushOpen) return;
	if (!activeSession()) return;
	const pending = pendingPushOpen;
	pendingPushOpen = null;
	openChatFromPush(pending);
}

/** Consume ?push=1&tip=&mid= from a notification cold-start URL. */
function consumePushOpenQuery() {
	if (typeof window === 'undefined') return;
	try {
		const u = new URL(window.location.href);
		if (u.searchParams.get('push') !== '1') return;
		const tip = String(u.searchParams.get('tip') || '').trim();
		const messageId = String(u.searchParams.get('mid') || '').trim();
		u.searchParams.delete('push');
		u.searchParams.delete('tip');
		u.searchParams.delete('mid');
		const next = `${u.pathname}${u.search}${u.hash}`;
		window.history.replaceState(window.history.state, '', next || '/chat');
		openChatFromPush({ tip, messageId });
	} catch {
		/* ignore */
	}
}

function onSwMessage(/** @type {MessageEvent} */ ev) {
	const data = ev?.data;
	if (!data || typeof data !== 'object') return;
	if (data.type === 'push-open') {
		openChatFromPush({
			tip: typeof data.tip === 'string' ? data.tip : '',
			messageId: typeof data.messageId === 'string' ? data.messageId : ''
		});
		return;
	}
	if (data.type === 'chat-wake' || data.type === 'PUSH_RECEIVED') {
		const tip = typeof data.tip === 'string' ? data.tip.trim() : '';
		if (tip) void wakeChatFromTip(tip);
		else void pullChatIfNeeded(true);
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
	const onPageShow = () => {
		consumePushOpenQuery();
		void pullChatIfNeeded(true);
	};
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('focus', onFocus);
	window.addEventListener('pageshow', onPageShow);
	navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
	/*
	 * Always poll while visible — reactions do not get push wakes, and chat
	 * panel mount is not required for peer reaction visibility.
	 */
	consumePushOpenQuery();
	if (typeof document === 'undefined' || document.visibilityState === 'visible') {
		startChatTipPoll();
	}
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('focus', onFocus);
		window.removeEventListener('pageshow', onPageShow);
		navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
		stopChatTipPoll();
	};
}
