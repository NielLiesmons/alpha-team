/**
 * Shared feed bottom-pin for chat, mail, comments.
 * Always targets true max scrollTop (padding included).
 * Instant for open/settle; smooth for FAB / follow-tail.
 */

import { tick } from 'svelte';

/** Distance from true bottom that still counts as “pinned”. */
export const FEED_NEAR_BOTTOM_PX = 64;

/**
 * Fallback when the dock hasn’t been measured yet.
 * Real clear comes from `attachComposerClearPad` (dock height + small gap).
 */
export const FEED_BOTTOM_PAD_CSS = 'calc(120px + env(safe-area-inset-bottom, 0px))';

/** Breathing room above the composer pill — not a huge empty band. */
const COMPOSER_CLEAR_GAP_PX = 12;

/**
 * Keep a floating composer from covering the last feed rows.
 * Sets `--composer-clear` = live dock height + gap (grows with quote / tall draft).
 * @param {HTMLElement} root — chat root that owns `--composer-clear`
 * @param {HTMLElement} dock — `.composer-dock`
 * @param {{
 *   scroller?: HTMLElement | null,
 *   isPinned?: () => boolean,
 *   isLocked?: () => boolean
 * }} [opts]
 */
export function attachComposerClearPad(root, dock, opts = {}) {
	const apply = () => {
		const h = Math.ceil(dock.getBoundingClientRect().height) + COMPOSER_CLEAR_GAP_PX;
		root.style.setProperty('--composer-clear', `${Math.max(0, h)}px`);
		if (opts.isLocked?.()) return;
		if (opts.isPinned?.() && opts.scroller) snapFeedToBottom(opts.scroller);
	};
	const ro = new ResizeObserver(apply);
	ro.observe(dock);
	apply();
	return () => {
		ro.disconnect();
		root.style.removeProperty('--composer-clear');
	};
}

/** @param {HTMLElement} el */
export function feedMaxScrollTop(el) {
	return Math.max(0, el.scrollHeight - el.clientHeight);
}

/** @param {HTMLElement | null | undefined} el @param {number} [px] */
export function isFeedNearBottom(el, px = FEED_NEAR_BOTTOM_PX) {
	if (!el) return true;
	return feedMaxScrollTop(el) - el.scrollTop <= px;
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {ScrollBehavior} [behavior]
 */
export function scrollFeedToBottom(el, behavior = 'auto') {
	if (!el) return;
	el.scrollTo({ top: feedMaxScrollTop(el), behavior });
}

/** Instant snap (alias). @param {HTMLElement | null | undefined} el */
export function snapFeedToBottom(el) {
	scrollFeedToBottom(el, 'auto');
}

/** @param {HTMLElement} el */
function waitForScrollEnd(el) {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			el.removeEventListener('scrollend', finish);
			resolve();
		};
		el.addEventListener('scrollend', finish);
		setTimeout(finish, 700);
	});
}

/**
 * After paint (+ layout frame when instant), scroll to true bottom.
 * @param {() => HTMLElement | null | undefined} getEl
 * @param {{ smooth?: boolean }} [opts]
 */
export async function snapFeedToBottomSoon(getEl, opts = {}) {
	await tick();
	const el = getEl();
	if (!el) return;
	if (opts.smooth) {
		scrollFeedToBottom(el, 'smooth');
		await waitForScrollEnd(el);
		/* Ensure exact bottom after animation / late layout. */
		snapFeedToBottom(getEl());
		return;
	}
	snapFeedToBottom(el);
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	snapFeedToBottom(getEl());
}

/**
 * While pinned, keep the scroller at true bottom whenever the body box resizes.
 * Skips while `isLocked` (smooth jump in flight).
 * @param {HTMLElement} scroller
 * @param {HTMLElement} body
 * @param {() => boolean} isPinned
 * @param {() => boolean} [isLocked]
 */
export function attachFeedPinResize(scroller, body, isPinned, isLocked) {
	const ro = new ResizeObserver(() => {
		if (isLocked?.()) return;
		if (isPinned()) snapFeedToBottom(scroller);
	});
	ro.observe(body);
	return () => ro.disconnect();
}
