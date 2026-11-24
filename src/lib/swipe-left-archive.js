/**
 * Svelte action: swipe left to archive a feed card/row.
 * Rightward swipes are left alone for shell back / nav-menu gestures.
 * Vertical motion wins over horizontal so list scroll is not fought.
 *
 * Reveals a subtle Archive strip under the row; past threshold commits.
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

	/* Simple archive-box glyph (stroke, matches Reply chip weight). */
	const ARCHIVE_PATH =
		'M3.5 5.25h11M5.25 5.25V4.2A1.2 1.2 0 0 1 6.45 3h5.1a1.2 1.2 0 0 1 1.2 1.2v1.05M6.2 7.5v5.1M9 7.5v5.1M11.8 7.5v5.1M4.35 5.25l.72 8.1A1.35 1.35 0 0 0 6.4 14.55h5.2a1.35 1.35 0 0 0 1.33-1.2l.72-8.1';

	function ensureReveal() {
		if (reveal?.isConnected) {
			paintLabel();
			return reveal;
		}
		const parent = node.parentElement;
		if (!parent) return null;
		const el = document.createElement('div');
		el.className = 'swipe-archive-reveal';
		el.setAttribute('aria-hidden', 'true');
		el.innerHTML = `<span class="swipe-archive-panel"><span class="swipe-archive-chip"><svg width="15" height="15" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${ARCHIVE_PATH}" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="swipe-archive-label"></span></span>`;
		parent.insertBefore(el, node);
		if (getComputedStyle(parent).position === 'static') {
			parent.dataset.swipeArchiveParent = '1';
			parent.style.position = 'relative';
		}
		reveal = el;
		paintLabel();
		layoutReveal();
		setProgress(0);
		return el;
	}

	function paintLabel() {
		const el = reveal?.querySelector('.swipe-archive-label');
		if (el) el.textContent = label;
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
		el.style.width = `${Math.max(maxPx, Math.abs(dx) || maxPx)}px`;
		el.style.borderRadius = getComputedStyle(node).borderRadius || '12px';
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
		node.classList.remove('swipe-archiving');
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
			reveal.style.width = `${Math.max(maxPx, Math.abs(dx))}px`;
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
		if (reveal) reveal.style.transition = 'opacity 0.18s ease, width 0.22s ease';
		if (fire) {
			const off = Math.max(node.offsetWidth + 24, maxPx * 1.4);
			node.style.transform = `translate3d(${-off}px,0,0)`;
			setProgress(1);
			suppressClick = true;
			window.setTimeout(() => {
				try {
					onArchive?.();
				} finally {
					node.classList.remove('swipe-archiving');
					node.style.transition = '';
					node.style.transform = '';
					if (reveal) reveal.style.transition = '';
					setProgress(0);
				}
			}, 200);
		} else {
			node.style.transform = '';
			setProgress(0);
			window.setTimeout(() => {
				node.classList.remove('swipe-archiving');
				node.style.transition = '';
				if (reveal) reveal.style.transition = '';
			}, 240);
		}
		dx = 0;
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
				paintLabel();
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
