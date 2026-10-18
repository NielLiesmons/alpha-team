/**
 * Mobile detail layers use history.pushState so system/back closes one layer
 * instead of leaving the current section (e.g. Songs → Player, not → Tasks).
 */

/** @type {boolean} */
let ignorePop = false;

function isMobile() {
	return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/**
 * @param {'player' | 'selection'} layer
 */
export function pushDetailLayer(layer) {
	if (!isMobile() || typeof history === 'undefined') return;
	const cur = history.state?.alphaLayer;
	if (cur === layer) return;
	ignorePop = true;
	history.pushState({ ...(history.state || {}), alphaLayer: layer }, '');
	queueMicrotask(() => {
		ignorePop = false;
	});
}

/**
 * Close via history when we own a layer; otherwise run `fallback`.
 * @param {'player' | 'selection'} layer
 * @param {() => void} fallback
 */
export function popDetailLayer(layer, fallback) {
	if (
		isMobile() &&
		typeof history !== 'undefined' &&
		history.state?.alphaLayer === layer
	) {
		history.back();
		return;
	}
	fallback();
}

/**
 * @param {{ onPlayer?: () => void, onSelection?: () => void }} handlers
 * @returns {() => void} unbind
 */
export function bindDetailPopstate(handlers) {
	if (typeof window === 'undefined') return () => {};
	/** @param {PopStateEvent} _e */
	function onPop(_e) {
		if (ignorePop) return;
		const layer = history.state?.alphaLayer;
		// After back(), state is the *previous* entry — layer is gone.
		// Always try closing whichever overlay is open (handlers no-op if already closed).
		handlers.onPlayer?.();
		handlers.onSelection?.();
		void layer;
	}
	window.addEventListener('popstate', onPop);
	return () => window.removeEventListener('popstate', onPop);
}

export function isMobileNav() {
	return isMobile();
}
