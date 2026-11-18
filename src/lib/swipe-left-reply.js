/**
 * Svelte action: swipe left to trigger reply. Rightward swipes are left alone
 * for shell back / nav-menu gestures.
 *
 * Shows a round reply chip behind the sliding node (scale + opacity from progress).
 *
 * @param {HTMLElement} node
 * @param {{ onReply?: () => void, threshold?: number, maxPx?: number }} params
 */
export function swipeLeftReply(node, params = {}) {
	let onReply = params.onReply;
	let threshold = params.threshold ?? 0.28;
	let maxPx = params.maxPx ?? 96;

	const CLAIM = 10;
	let startX = 0;
	let startY = 0;
	let tracking = false;
	let claimed = false;
	/** @type {number} */
	let dx = 0;

	/** @type {HTMLElement | null} */
	let reveal = null;

	const REPLY_PATH =
		'M6.49762 0.739219C3.31788 0.739219 0.740195 3.31691 0.740195 6.49665C0.740195 9.67639 3.31788 12.2541 6.49762 12.2541H16.6719L12.0144 7.59655C12.0066 7.58874 12.0066 7.57608 12.0144 7.56826C12.0222 7.56045 12.0349 7.56045 12.0427 7.56826L16.7343 12.2599C16.7382 12.2638 16.7403 12.2689 16.7402 12.2743C16.7401 12.2797 16.7379 12.2849 16.734 12.2886L12.0423 16.7337C12.0343 16.7413 12.0216 16.741 12.014 16.733C12.0064 16.725 12.0068 16.7123 12.0148 16.7047L16.67 12.2941H6.49762C3.29579 12.2941 0.700195 9.69848 0.700195 6.49665C0.700195 3.29482 3.29579 0.699219 6.49762 0.699219H6.94242C6.95346 0.699219 6.96242 0.708173 6.96242 0.719219C6.96242 0.730264 6.95346 0.739219 6.94242 0.739219H6.49762Z';

	function ensureReveal() {
		if (reveal?.isConnected) return reveal;
		const parent = node.parentElement;
		if (!parent) return null;
		const el = document.createElement('div');
		el.className = 'swipe-reply-reveal';
		el.setAttribute('aria-hidden', 'true');
		el.innerHTML = `<span class="swipe-reply-chip"><svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="${REPLY_PATH}" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
		parent.insertBefore(el, node);
		if (getComputedStyle(parent).position === 'static') {
			parent.dataset.swipeReplyParent = '1';
			parent.style.position = 'relative';
		}
		reveal = el;
		layoutReveal();
		setProgress(0);
		return el;
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
	}

	/** @param {number} p 0..1 */
	function setProgress(p) {
		const el = reveal;
		if (!el) return;
		const clamped = Math.max(0, Math.min(1, p));
		el.style.setProperty('--swipe-p', String(clamped));
		el.classList.toggle('on', clamped > 0.02);
	}

	function resetVisual() {
		node.style.transform = '';
		node.style.transition = '';
		node.classList.remove('swipe-replying');
		setProgress(0);
	}

	/** @param {TouchEvent} e */
	function onStart(e) {
		if (e.touches.length !== 1) return;
		const t = e.target;
		if (
			t instanceof Element &&
			t.closest(
				'button, a, input, textarea, select, [contenteditable="true"], [data-no-swipe-reply]'
			)
		) {
			return;
		}
		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		tracking = true;
		claimed = false;
		dx = 0;
		node.style.transition = 'none';
		ensureReveal();
		layoutReveal();
		setProgress(0);
	}

	/** @param {TouchEvent} e */
	function onMove(e) {
		if (!tracking || e.touches.length !== 1) return;
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
			node.classList.add('swipe-replying');
			ensureReveal();
			layoutReveal();
		}
		e.preventDefault();
		dx = Math.max(-maxPx, Math.min(0, rawDx));
		node.style.transform = `translate3d(${dx}px,0,0)`;
		setProgress(Math.abs(dx) / maxPx);
	}

	function onEnd() {
		if (!tracking) return;
		const wasClaimed = claimed;
		const progress = wasClaimed ? Math.abs(dx) / maxPx : 0;
		tracking = false;
		claimed = false;
		node.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
		node.style.transform = '';
		if (reveal) reveal.style.transition = 'opacity 0.18s ease';
		setProgress(0);
		const fire = wasClaimed && progress >= threshold && typeof onReply === 'function';
		window.setTimeout(() => {
			node.classList.remove('swipe-replying');
			node.style.transition = '';
			if (reveal) reveal.style.transition = '';
		}, 240);
		dx = 0;
		if (fire) onReply();
	}

	node.addEventListener('touchstart', onStart, { passive: true });
	node.addEventListener('touchmove', onMove, { passive: false });
	node.addEventListener('touchend', onEnd);
	node.addEventListener('touchcancel', onEnd);

	return {
		/** @param {{ onReply?: () => void, threshold?: number, maxPx?: number }} next */
		update(next = {}) {
			onReply = next.onReply;
			if (typeof next.threshold === 'number') threshold = next.threshold;
			if (typeof next.maxPx === 'number') maxPx = next.maxPx;
		},
		destroy() {
			node.removeEventListener('touchstart', onStart);
			node.removeEventListener('touchmove', onMove);
			node.removeEventListener('touchend', onEnd);
			node.removeEventListener('touchcancel', onEnd);
			resetVisual();
			const parent = reveal?.parentElement;
			reveal?.remove();
			reveal = null;
			if (parent?.dataset.swipeReplyParent === '1') {
				parent.style.position = '';
				delete parent.dataset.swipeReplyParent;
			}
		}
	};
}
