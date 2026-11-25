/**
 * Svelte action: swipe left to archive a feed card/row.
 * Rightward swipes are left alone for shell back / nav-menu gestures.
 * Vertical motion wins over horizontal so list scroll is not fought.
 *
 * Reveals a rounded Archive strip that expands with swipe progress —
 * width equals the opened gap only (never sits behind the card).
 * Icon-only; opacity fades in over the first ~24px of drag.
 *
 * @param {HTMLElement} node
 * @param {{
 *   onArchive?: () => void,
 *   label?: string,
 *   threshold?: number,
 *   maxPx?: number,
 *   disabled?: boolean
 * }} params
 */
import { ARCHIVE_PATH } from '@alpha/ui/archive-path.js';

const FADE_PX = 24;

export function swipeLeftArchive(node, params = {}) {
	let onArchive = params.onArchive;
	let label = params.label ?? 'Archive';
	let threshold = params.threshold ?? 0.38;
	let maxPx = params.maxPx ?? 112;
	let disabled = Boolean(params.disabled);

	const CLAIM = 10;
	let startX = 0;
	let startY = 0;
	let tracking = false;
	let claimed = false;
	let suppressClick = false;
	/** @type {number} */
	let dx = 0;

	/** @type {HTMLElement | null} */
	let reveal = null;

	function ensureReveal() {
		if (reveal?.isConnected) {
			paintAria();
			return reveal;
		}
		const parent = node.parentElement;
		if (!parent) return null;
		const el = document.createElement('div');
		el.className = 'swipe-archive-reveal';
		el.setAttribute('aria-hidden', 'true');
		el.innerHTML = `<span class="swipe-archive-panel"><span class="swipe-archive-chip"><svg viewBox="0 0 12 11" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${ARCHIVE_PATH}" fill="currentColor"/></svg></span></span>`;
		parent.insertBefore(el, node);
		if (getComputedStyle(parent).position === 'static') {
			parent.dataset.swipeArchiveParent = '1';
			parent.style.position = 'relative';
		}
		reveal = el;
		paintAria();
		layoutReveal();
		setProgress(0);
		return el;
	}

	function paintAria() {
		if (!reveal) return;
		reveal.setAttribute('aria-label', label);
	}

	function layoutReveal() {
		const el = reveal;
		const parent = node.parentElement;
		if (!el || !parent) return;
		const nodeRect = node.getBoundingClientRect();
		const parentRect = parent.getBoundingClientRect();
		const top = nodeRect.top - parentRect.top + parent.scrollTop;
		el.style.top = `${top}px`;
		el.style.height = `${nodeRect.height}px`;
		el.style.right = `${Math.max(0, parentRect.right - nodeRect.right)}px`;
		/* Width tracks swipe only — never pre-size to maxPx (peek-through). */
		el.style.width = `${Math.abs(dx)}px`;
		el.style.borderRadius = getComputedStyle(node).borderRadius || '12px';
	}

	/** @param {number} p 0..1 overall progress toward maxPx */
	function setProgress(p) {
		const el = reveal;
		if (!el) return;
		const clamped = Math.max(0, Math.min(1, p));
		const opened = Math.abs(dx);
		const fade = Math.max(0, Math.min(1, opened / FADE_PX));
		el.style.setProperty('--swipe-p', String(clamped));
		el.style.setProperty('--swipe-fade', String(fade));
		el.classList.toggle('on', opened > 0.5);
	}

	function resetVisual() {
		node.style.transform = '';
		node.style.transition = '';
		node.classList.remove('swipe-archiving');
		dx = 0;
		if (reveal) {
			reveal.style.width = '0px';
			reveal.style.transition = '';
		}
		setProgress(0);
	}

	/** @param {TouchEvent} e */
	function onStart(e) {
		if (disabled || e.touches.length !== 1) return;
		const t = e.target;
		if (t instanceof Element) {
			/* Block nested controls; the feed row itself may be a <button>. */
			const nestedBtn = t.closest('button');
			if (
				t.closest(
					'a, input, textarea, select, [contenteditable="true"], [data-no-swipe-archive]'
				) ||
				(nestedBtn && nestedBtn !== node)
			) {
				return;
			}
		}
		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		tracking = true;
		claimed = false;
		dx = 0;
		node.style.transition = 'none';
		ensureReveal();
		if (reveal) reveal.style.transition = 'none';
		layoutReveal();
		setProgress(0);
	}

	/** @param {TouchEvent} e */
	function onMove(e) {
		if (!tracking || disabled || e.touches.length !== 1) return;
		const touch = e.touches[0];
		const rawDx = touch.clientX - startX;
		const dy = touch.clientY - startY;
		if (!claimed) {
			if (Math.abs(rawDx) < CLAIM && Math.abs(dy) < CLAIM) return;
			/* Vertical or swipe-right → abandon (nav / scroll). */
			if (Math.abs(dy) >= Math.abs(rawDx) * 0.85 || rawDx > 0) {
				tracking = false;
				resetVisual();
				return;
			}
			claimed = true;
			node.classList.add('swipe-archiving');
			ensureReveal();
			layoutReveal();
		}
		e.preventDefault();
		dx = Math.max(-maxPx, Math.min(0, rawDx));
		node.style.transform = `translate3d(${dx}px,0,0)`;
		if (reveal) {
			reveal.style.width = `${Math.abs(dx)}px`;
		}
		setProgress(Math.abs(dx) / maxPx);
	}

	function onEnd() {
		if (!tracking) return;
		const wasClaimed = claimed;
		const progress = wasClaimed ? Math.abs(dx) / maxPx : 0;
		tracking = false;
		claimed = false;
		const fire = wasClaimed && progress >= threshold && typeof onArchive === 'function';
		node.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
		if (reveal) {
			reveal.style.transition =
				'width 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease';
		}
		if (fire) {
			const off = Math.max(node.offsetWidth + 24, maxPx * 1.4);
			node.style.transform = `translate3d(${-off}px,0,0)`;
			dx = -Math.min(off, node.offsetWidth);
			if (reveal) reveal.style.width = `${Math.abs(dx)}px`;
			setProgress(1);
			suppressClick = true;
			window.setTimeout(() => {
				try {
					onArchive?.();
				} finally {
					node.classList.remove('swipe-archiving');
					node.style.transition = '';
					node.style.transform = '';
					dx = 0;
					if (reveal) {
						reveal.style.transition = '';
						reveal.style.width = '0px';
					}
					setProgress(0);
				}
			}, 200);
		} else {
			node.style.transform = '';
			if (reveal) reveal.style.width = '0px';
			dx = 0;
			setProgress(0);
			window.setTimeout(() => {
				node.classList.remove('swipe-archiving');
				node.style.transition = '';
				if (reveal) reveal.style.transition = '';
			}, 240);
		}
	}

	/** @param {MouseEvent} e */
	function onClickCapture(e) {
		if (!suppressClick) return;
		e.preventDefault();
		e.stopPropagation();
		suppressClick = false;
	}

	node.addEventListener('touchstart', onStart, { passive: true });
	node.addEventListener('touchmove', onMove, { passive: false });
	node.addEventListener('touchend', onEnd);
	node.addEventListener('touchcancel', onEnd);
	node.addEventListener('click', onClickCapture, true);

	return {
		/**
		 * @param {{
		 *   onArchive?: () => void,
		 *   label?: string,
		 *   threshold?: number,
		 *   maxPx?: number,
		 *   disabled?: boolean
		 * }} next
		 */
		update(next = {}) {
			onArchive = next.onArchive;
			if (typeof next.label === 'string') {
				label = next.label;
				paintAria();
			}
			if (typeof next.threshold === 'number') threshold = next.threshold;
			if (typeof next.maxPx === 'number') maxPx = next.maxPx;
			disabled = Boolean(next.disabled);
			if (disabled) resetVisual();
		},
		destroy() {
			node.removeEventListener('touchstart', onStart);
			node.removeEventListener('touchmove', onMove);
			node.removeEventListener('touchend', onEnd);
			node.removeEventListener('touchcancel', onEnd);
			node.removeEventListener('click', onClickCapture, true);
			resetVisual();
			const parent = reveal?.parentElement;
			reveal?.remove();
			reveal = null;
			if (parent?.dataset.swipeArchiveParent === '1') {
				parent.style.position = '';
				delete parent.dataset.swipeArchiveParent;
			}
		}
	};
}
