/**
 * Fast chat wake: realtime tip bus first, tip poll as fallback while chat is open.
 * Also refreshes members/avatars when tip moves (cross-device profile pics).
 */

import { refreshMembersAndAvatars } from './avatar.svelte.js';
import {
	hydrateChatFeedFromCache,
	refreshChatFeed,
	chatFeed,
	chatUi,
	markIncomingMessagesRead
} from './chat.svelte.js';
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
/**
 * Keep read-receipt tip writes off the message tip critical path.
 * markIncomingMessagesRead also skips `_hint` rows so peer paint from WS
 * cannot CAS-fight the sender’s still-in-flight message tip.
 */
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

/**
 * Stamp the tip we already applied so quiet receipt writes / local appends do
 * not look like a peer tip-change and stampede refreshChatFeed + title wave.
 * @param {string} tip
 */
export function noteAppliedChatTip(tip) {
	const t = String(tip || '').trim();
	if (t) lastTip = t;
}

function scheduleReadReceipts() {
	if (readReceiptTimer != null) clearTimeout(readReceiptTimer);
	readReceiptTimer = setTimeout(() => {
		readReceiptTimer = null;
		if (chatUi.posting) {
			scheduleReadReceipts();
			return;
		}
		void markIncomingMessagesRead().then((tip) => {
			if (tip) noteAppliedChatTip(tip);
		});
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
			/*
			 * Warm local feed → quiet background catch-up (no title wave).
			 * Wave only when there is nothing to paint yet.
			 * Force open always walks even when lastTip already matches — phone
			 * may have stamped tip without merging leaves while closed.
			 */
			const warm = chatFeed.length > 0 || Boolean(chatUi.settled);
			await refreshChatFeed({ quiet: warm, catchUp: !warm });
			/*
			 * Only advance lastTip when the mailbox walk remembered this tip.
			 * Stamping bare getNamedTip after a timeout left tipChanged=false forever
			 * while chatFeed still missed cross-device self rows.
			 */
			const cached = peekCachedChatTip(session) || '';
			if (tip && cached === tip) lastTip = tip;
			else if (cached) lastTip = cached;
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
		await refreshChatFeed({
			tip: t,
			quiet: chatFeed.length > 0 || Boolean(chatUi.settled)
		});
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
 * Deep-link target from a notification tap. ChatChannelPanel scrolls here ASAP
 * (cache first; tip delta second) — mid must survive boot / warm focus races.
 * @type {{ tip: string, messageId: string, gen: number, until: number }}
 */
export const pushOpenUi = $state({
	tip: '',
	messageId: '',
	gen: 0,
	until: 0
});

/**
 * @param {{ tip?: string, messageId?: string }} opts
 */
function stashPushOpenTarget(opts = {}) {
	const tip = String(opts.tip || '').trim();
	const messageId = String(opts.messageId || '').trim();
	if (!tip && !messageId) return;
	if (tip) pushOpenUi.tip = tip;
	if (messageId) pushOpenUi.messageId = messageId;
	pushOpenUi.gen += 1;
	pushOpenUi.until = Date.now() + 20_000;
}

/** Clear after the panel lands on the notif message (or deadline). */
export function clearPushScrollTarget() {
	pushOpenUi.messageId = '';
	pushOpenUi.tip = '';
	pushOpenUi.until = 0;
}

/** @returns {string} */
export function peekPushScrollTarget() {
	const mid = String(pushOpenUi.messageId || '').trim();
	if (!mid) return '';
	if (pushOpenUi.until && Date.now() > pushOpenUi.until) {
		clearPushScrollTarget();
		return '';
	}
	return mid;
}

/**
 * Notification tap / push deep-link: paint cache, open Chat, scroll to mid,
 * then tip-wake / pull only the delta (not a fat crawl).
 * Queues until Drive session exists (cold start from killed PWA).
 * @param {{ tip?: string, messageId?: string }} [opts]
 */
export function openChatFromPush(opts = {}) {
	const tip = String(opts.tip || '').trim();
	const messageId = String(opts.messageId || '').trim();
	/* Stash mid before any await/goto so the panel can scroll on first paint. */
	stashPushOpenTarget({ tip, messageId });
	/* Local cache / IDB-backed feed snapshot — scroll without waiting on network. */
	try {
		hydrateChatFeedFromCache();
	} catch {
		/* ignore */
	}
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
	/* Prefer tip delta when known — same fast path as in-app tip-wake. */
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

/* Stash tip/mid before layout onMount / panel anchor — cold PWA starts here. */
if (typeof window !== 'undefined') {
	consumePushOpenQuery();
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
	/*
	 * Always force-pull on Chat focus — poll may already be armed from the
	 * shell visibility listener, and a prior timeout can leave lastTip ahead
	 * of chatFeed (own messages from another device missing until force).
	 */
	if (pollTimer != null) {
		void pullChatIfNeeded(true);
		return;
	}
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
	const onOnline = () => {
		/* Drop a hung catch-up wave, then force tip pull after airplane mode. */
		chatUi.syncing = false;
		chatUi.loading = false;
		chatUi.settled = true;
		void pullChatIfNeeded(true);
	};
	const onOffline = () => {
		chatUi.syncing = false;
		chatUi.loading = false;
		chatUi.settled = true;
	};
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('focus', onFocus);
	window.addEventListener('pageshow', onPageShow);
	window.addEventListener('online', onOnline);
	window.addEventListener('offline', onOffline);
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
		window.removeEventListener('online', onOnline);
		window.removeEventListener('offline', onOffline);
		navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
		stopChatTipPoll();
	};
}
