/**
 * Mobile detail layers use history.pushState so system/back closes one layer
 * instead of leaving the current section (e.g. Songs → Player, not → Tasks).
 *
 * Overlay stacks (comments) may push on top of a detail layer. After that
 * overlay pops, `alphaLayer` is still present — do not clear the detail.
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
 * Suppress detail popstate handlers (e.g. while comments intentionally
 * history.back() so selection/player stay put).
 * @param {boolean} next
 */
export function setDetailPopIgnore(next) {
	ignorePop = Boolean(next);
}

/** True when a comments overlay owns the top history entry. */
export function commentsHistoryActive() {
	return typeof history !== 'undefined' && Boolean(history.state?.alphaComments);
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
		/*
		 * After back(), state is the previous entry. If a detail layer flag
		 * remains, we only closed an overlay (comments, etc.) — leave the
		 * publication / selection / player open underneath.
		 */
		if (layer === 'selection' || layer === 'player') return;
		handlers.onPlayer?.();
		handlers.onSelection?.();
	}
	window.addEventListener('popstate', onPop);
	return () => window.removeEventListener('popstate', onPop);
}

export function isMobileNav() {
	return isMobile();
}
