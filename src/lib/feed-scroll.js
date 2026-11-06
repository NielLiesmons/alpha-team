/**
 * Shared feed bottom-pin — one rule for chat, mail, comments:
 * snap to true max scrollTop (padding included). No smooth, no partial bottoms.
 */

import { tick } from 'svelte';

/** Distance from true bottom that still counts as “pinned”. */
export const FEED_NEAR_BOTTOM_PX = 64;

/**
 * CSS bottom padding feeds should use so the last item clears the composer.
 * Keep chat `.messages` and mail `.mail-feed` in sync with this.
 */
export const FEED_BOTTOM_PAD_CSS = 'calc(72px + env(safe-area-inset-bottom, 0px))';

/** @param {HTMLElement} el */
export function feedMaxScrollTop(el) {
	return Math.max(0, el.scrollHeight - el.clientHeight);
}

/** @param {HTMLElement | null | undefined} el @param {number} [px] */
export function isFeedNearBottom(el, px = FEED_NEAR_BOTTOM_PX) {
	if (!el) return true;
	return feedMaxScrollTop(el) - el.scrollTop <= px;
}

/** Instant snap to the absolute bottom. */
/** @param {HTMLElement | null | undefined} el */
export function snapFeedToBottom(el) {
	if (!el) return;
	el.scrollTop = feedMaxScrollTop(el);
}

/**
 * After paint + one layout frame, snap again (images/fonts/padding settle).
 * @param {() => HTMLElement | null | undefined} getEl
 */
export async function snapFeedToBottomSoon(getEl) {
	await tick();
	snapFeedToBottom(getEl());
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	snapFeedToBottom(getEl());
}

/**
 * While pinned, keep the scroller at true bottom whenever the body box resizes
 * (new messages, quote expand, images). Returns destroy().
 * @param {HTMLElement} scroller
 * @param {HTMLElement} body
 * @param {() => boolean} isPinned
 */
export function attachFeedPinResize(scroller, body, isPinned) {
	const ro = new ResizeObserver(() => {
		if (isPinned()) snapFeedToBottom(scroller);
	});
	ro.observe(body);
	return () => ro.disconnect();
}
