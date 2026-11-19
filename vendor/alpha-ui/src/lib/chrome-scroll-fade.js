/**
 * Drive --chrome-scroll-fade (0→1 over the first `fadePx` of scroll) on a column root.
 * Prefers nested `.feed` / `.fill` / `.ptr-scroll` over wrapping `.body` (often overflow:hidden).
 *
 * @param {ParentNode | null | undefined} root
 * @param {(v: number) => void} setFade
 * @param {number} [fadePx=16]
 * @returns {() => void}
 */
export function attachChromeScrollFade(root, setFade, fadePx = 16) {
	if (!root || typeof document === 'undefined') {
		setFade(0);
		return () => {};
	}

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
			if (isScrollableY(node) && node.scrollHeight > node.clientHeight + 1) {
				return /** @type {HTMLElement} */ (node);
			}
		}
		for (const node of preferred) {
			if (isScrollableY(node)) return /** @type {HTMLElement} */ (node);
		}

		const bodies = el.querySelectorAll('.body');
		for (const node of bodies) {
			if (isScrollableY(node) && node.scrollHeight > node.clientHeight + 1) {
				return /** @type {HTMLElement} */ (node);
			}
		}
		for (const node of bodies) {
			if (isScrollableY(node)) return /** @type {HTMLElement} */ (node);
		}

		if (preferred[0]) return /** @type {HTMLElement} */ (preferred[0]);
		if (bodies[0]) return /** @type {HTMLElement} */ (bodies[0]);
		return null;
	}

	function onScroll() {
		const t = scroller?.scrollTop ?? 0;
		setFade(Math.min(1, Math.max(0, t / fadePx)));
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
	mo.observe(/** @type {Node} */ (root), { childList: true, subtree: true });

	return () => {
		cancelAnimationFrame(raf);
		mo.disconnect();
		scroller?.removeEventListener('scroll', onScroll);
		scroller = null;
	};
}
