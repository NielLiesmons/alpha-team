/**
 * Svelte action: swipe left to trigger reply. Rightward swipes are left alone
 * for shell back / nav-menu gestures.
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

	function resetVisual() {
		node.style.transform = '';
		node.style.transition = '';
		node.classList.remove('swipe-replying');
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
		}
		e.preventDefault();
		dx = Math.max(-maxPx, Math.min(0, rawDx));
		node.style.transform = `translate3d(${dx}px,0,0)`;
	}

	function onEnd() {
		if (!tracking) return;
		const wasClaimed = claimed;
		const progress = wasClaimed ? Math.abs(dx) / maxPx : 0;
		tracking = false;
		claimed = false;
		node.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
		node.style.transform = '';
		const fire = wasClaimed && progress >= threshold && typeof onReply === 'function';
		window.setTimeout(() => {
			node.classList.remove('swipe-replying');
			node.style.transition = '';
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
		}
	};
}
