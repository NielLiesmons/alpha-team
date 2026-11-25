/**
 * Drive --chrome-scroll-fade (0→1 over the first CHROME_SCROLL_FADE_PX of scroll)
 * on a column root (list-top / detail-top / ChromeMobileBar ::after).
 *
 * At scrollTop 0 the fade is invisible. Opacity ramps linearly over the first
 * `fadePx` pixels scrolled — never paint a top fade onto first content at rest.
 *
 * Prefers nested `.feed` / `.fill` / `.ptr-scroll` over wrapping `.body`
 * (often overflow:hidden). Skips keep-alive / inert / visibility:hidden panes
 * so a warm Chat feed scrolled to the tip cannot pin list fade at 1 on Tasks.
 *
 * @param {ParentNode | null | undefined} root
 * @param {(v: number) => void} setFade
 * @param {number} [fadePx=CHROME_SCROLL_FADE_PX]
 * @returns {() => void}
 */

/** Pixels of scroll over which top chrome fade opacity goes 0 → 1. */
export const CHROME_SCROLL_FADE_PX = 32;

/**
 * @param {Element} node
 * @param {ParentNode | null | undefined} root
 */
function isVisibleInRoot(node, root) {
	let el = node instanceof Element ? node : null;
	while (el) {
		if (el instanceof HTMLElement) {
			if (el.hasAttribute('inert') || el.hidden) return false;
			const ariaHidden = el.getAttribute('aria-hidden');
			/* Keepalive panes set aria-hidden while off; treat as non-scrollers. */
			if (ariaHidden === 'true') return false;
			const style = getComputedStyle(el);
			if (style.display === 'none' || style.visibility === 'hidden') return false;
		}
		if (root && el === root) break;
		el = el.parentElement;
	}
	return true;
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {(v: number) => void} setFade
 * @param {number} [fadePx]
 * @returns {() => void}
 */
export function attachChromeScrollFade(root, setFade, fadePx = CHROME_SCROLL_FADE_PX) {
	if (!root || typeof document === 'undefined') {
		setFade(0);
		return () => {};
	}

	const ramp = fadePx > 0 ? fadePx : CHROME_SCROLL_FADE_PX;

	/** @type {HTMLElement | null} */
	let scroller = null;

	/** @param {Element} node */
	function isScrollableY(node) {
		const style = getComputedStyle(node);
		const oy = style.overflowY;
		return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
	}

	/** @param {ParentNode | null | undefined} el */
	function findScroller(el) {
		if (!el || !(el instanceof Element)) return null;

		/* Prefer real feed scrollports — never bind a non-scrolling .body wrapper first. */
		const preferred = el.querySelectorAll('.feed, .fill, .ptr-scroll');
		for (const node of preferred) {
			if (!isVisibleInRoot(node, el)) continue;
			if (isScrollableY(node) && node.scrollHeight > node.clientHeight + 1) {
				return /** @type {HTMLElement} */ (node);
			}
		}
		for (const node of preferred) {
			if (!isVisibleInRoot(node, el)) continue;
			if (isScrollableY(node)) return /** @type {HTMLElement} */ (node);
		}

		const bodies = el.querySelectorAll('.body');
		for (const node of bodies) {
			if (!isVisibleInRoot(node, el)) continue;
			if (isScrollableY(node) && node.scrollHeight > node.clientHeight + 1) {
				return /** @type {HTMLElement} */ (node);
			}
		}
		for (const node of bodies) {
			if (!isVisibleInRoot(node, el)) continue;
			if (isScrollableY(node)) return /** @type {HTMLElement} */ (node);
		}

		for (const node of preferred) {
			if (isVisibleInRoot(node, el)) return /** @type {HTMLElement} */ (node);
		}
		for (const node of bodies) {
			if (isVisibleInRoot(node, el)) return /** @type {HTMLElement} */ (node);
		}
		return null;
	}

	function onScroll() {
		const t = scroller?.scrollTop ?? 0;
		/* Exact 0 (and rubber-band negatives) → invisible; ramp over first fadePx. */
		if (t <= 0) {
			setFade(0);
			return;
		}
		setFade(Math.min(1, t / ramp));
	}

	function bind() {
		const next = findScroller(root);
		if (next === scroller) {
			onScroll();
			return;
		}
		scroller?.removeEventListener('scroll', onScroll);
		scroller = next;
		scroller?.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
	}

	setFade(0);
	bind();
	const raf = requestAnimationFrame(bind);
	const mo = new MutationObserver(bind);
	mo.observe(/** @type {Node} */ (root), {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden']
	});

	return () => {
		cancelAnimationFrame(raf);
		mo.disconnect();
		scroller?.removeEventListener('scroll', onScroll);
		scroller = null;
	};
}
