/**
 * Pointer drag-down to dismiss mobile sheets / fullscreen overlays.
 * Ignores the gesture while an inner scrollport still has scrollTop > 0.
 *
 * @param {HTMLElement} node
 * @param {{
 *   onclose?: () => void,
 *   onDismiss?: () => void,
 *   enabled?: boolean,
 *   threshold?: number,
 *   scrollSelector?: string,
 *   wholeSurface?: boolean
 * }} [params]
 */
export function dragDismiss(node, params = {}) {
	let onclose = params.onclose || params.onDismiss || (() => {});
	let enabled = params.enabled !== false;
	let threshold = params.threshold ?? 110;
	let scrollSelector = params.scrollSelector || '';
	let wholeSurface = Boolean(params.wholeSurface);

	/** @type {number} */
	let startY = 0;
	/** @type {number} */
	let dy = 0;
	let dragging = false;
	/** @type {number | null} */
	let pointerId = null;

	function scrollRoot() {
		if (scrollSelector) {
			const el = node.querySelector(scrollSelector);
			if (el instanceof HTMLElement) return el;
		}
		if (wholeSurface) {
			const list = node.querySelector('.queue-list, [data-drag-dismiss-scroll]');
			if (list instanceof HTMLElement) return list;
		}
		return node;
	}

	function applyTransform(y) {
		const t = Math.max(0, y);
		node.style.transform = t > 0 ? `translate3d(0, ${t}px, 0)` : '';
		node.style.opacity = t > 0 ? String(Math.max(0.35, 1 - t / 320)) : '';
		node.style.transition = dragging ? 'none' : '';
	}

	function resetVisual() {
		node.style.transform = '';
		node.style.opacity = '';
		node.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
	}

	/** @param {PointerEvent} e */
	function onDown(e) {
		if (!enabled) return;
		if (e.button != null && e.button !== 0) return;
		if (typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches) {
			return;
		}
		const root = scrollRoot();
		if (root.scrollTop > 2) return;
		const t = e.target;
		if (t instanceof Element) {
			/* Don't steal horizontal scrubbers / explicit no-dismiss zones. */
			if (t.closest('[data-no-drag-dismiss], input, textarea, select, [contenteditable="true"]')) {
				return;
			}
		}
		dragging = true;
		pointerId = e.pointerId;
		startY = e.clientY;
		dy = 0;
		try {
			node.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	/** @param {PointerEvent} e */
	function onMove(e) {
		if (!dragging || e.pointerId !== pointerId) return;
		const root = scrollRoot();
		if (root.scrollTop > 2) {
			dy = 0;
			applyTransform(0);
			return;
		}
		dy = Math.max(0, e.clientY - startY);
		/* Require a bit of downward intent before claiming the gesture. */
		if (dy < 8 && !wholeSurface) return;
		applyTransform(dy);
	}

	/** @param {PointerEvent} e */
	function onUp(e) {
		if (!dragging || (pointerId != null && e.pointerId !== pointerId)) return;
		dragging = false;
		pointerId = null;
		try {
			node.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
		if (dy > threshold) {
			onclose();
		}
		dy = 0;
		resetVisual();
	}

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', onUp);
	node.addEventListener('pointercancel', onUp);
	node.style.touchAction = node.style.touchAction || 'pan-y';

	return {
		/**
		 * @param {{
		 *   onclose?: () => void,
		 *   onDismiss?: () => void,
		 *   enabled?: boolean,
		 *   threshold?: number,
		 *   scrollSelector?: string,
		 *   wholeSurface?: boolean
		 * }} next
		 */
		update(next = {}) {
			onclose = next.onclose || next.onDismiss || onclose;
			enabled = next.enabled !== false;
			threshold = next.threshold ?? threshold;
			scrollSelector = next.scrollSelector ?? scrollSelector;
			wholeSurface = next.wholeSurface != null ? Boolean(next.wholeSurface) : wholeSurface;
		},
		destroy() {
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onUp);
			node.removeEventListener('pointercancel', onUp);
			resetVisual();
		}
	};
}
