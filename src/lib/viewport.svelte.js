/**
 * Keep layout height in sync with the visible viewport (keyboard / iOS chrome).
 * Sets --app-height and --vv-top on :root for shells and fixed overlays.
 *
 * Desktop: leave --app-height unset so CSS falls back to 100dvh — visualViewport
 * tracking fights browser / page zoom. Mobile (≤767px or coarse pointer) only.
 */

/** @type {(() => void) | null} */
let stop = null;

function isMobileViewport() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(max-width: 767px)').matches ||
		window.matchMedia('(pointer: coarse)').matches
	);
}

function clearAppHeight() {
	const root = document.documentElement;
	root.style.removeProperty('--app-height');
	root.style.removeProperty('--vv-top');
}

export function startViewportBridge() {
	if (typeof window === 'undefined') return () => {};
	if (stop) return stop;

	const root = document.documentElement;
	/** @type {MediaQueryList[]} */
	const queries = [
		window.matchMedia('(max-width: 767px)'),
		window.matchMedia('(pointer: coarse)')
	];

	const apply = () => {
		if (!isMobileViewport()) {
			clearAppHeight();
			return;
		}
		const vv = window.visualViewport;
		const h = Math.round(vv?.height ?? window.innerHeight);
		const top = Math.round(vv?.offsetTop ?? 0);
		root.style.setProperty('--app-height', `${h}px`);
		root.style.setProperty('--vv-top', `${top}px`);
	};

	const onModeChange = () => {
		apply();
	};

	apply();
	window.visualViewport?.addEventListener('resize', apply);
	window.visualViewport?.addEventListener('scroll', apply);
	window.addEventListener('resize', apply);
	window.addEventListener('orientationchange', apply);
	for (const q of queries) {
		q.addEventListener?.('change', onModeChange);
	}

	stop = () => {
		window.visualViewport?.removeEventListener('resize', apply);
		window.visualViewport?.removeEventListener('scroll', apply);
		window.removeEventListener('resize', apply);
		window.removeEventListener('orientationchange', apply);
		for (const q of queries) {
			q.removeEventListener?.('change', onModeChange);
		}
		clearAppHeight();
		stop = null;
	};
	return stop;
}
