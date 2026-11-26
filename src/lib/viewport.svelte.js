/**
 * Keep layout height in sync with the visible viewport (keyboard / iOS chrome).
 * Sets --app-height and --vv-top on :root for shells and fixed overlays.
 *
 * interactive-widget:
 * - Default (app.html) = `resizes-content` — Android Chrome/PWA needs the layout
 *   viewport to shrink or the keyboard covers the chat composer.
 * - iOS / iPadOS → `overlays-content` via syncInteractiveWidget(). Safari 27.3+
 *   otherwise applies resize + this bridge and double-insets the composer up.
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

/** iPhone / iPad / iPadOS-desktop-UA — not Android. */
export function isAppleTouchDevice() {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent || '';
	if (/iPad|iPhone|iPod/.test(ua)) return true;
	/* iPadOS 13+ reports as MacIntel with touch. */
	if (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1) {
		return true;
	}
	return false;
}

/**
 * Android: resizes-content (composer stays above kb).
 * iOS: overlays-content (avoid double-inset with --app-height).
 */
function syncInteractiveWidget() {
	if (typeof document === 'undefined') return;
	const meta = document.querySelector('meta[name="viewport"]');
	if (!meta) return;
	const widget = isAppleTouchDevice() ? 'overlays-content' : 'resizes-content';
	let content = String(meta.getAttribute('content') || '');
	content = content
		.replace(/,?\s*interactive-widget=(?:overlays|resizes)-content/gi, '')
		.replace(/,\s*,/g, ',')
		.replace(/^\s*,\s*|\s*,\s*$/g, '')
		.trim();
	meta.setAttribute(
		'content',
		content ? `${content}, interactive-widget=${widget}` : `interactive-widget=${widget}`
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

	syncInteractiveWidget();

	const apply = () => {
		if (!isMobileViewport()) {
			clearAppHeight();
			return;
		}
		const vv = window.visualViewport;
		const h = Math.round(vv?.height ?? window.innerHeight);
		const top = Math.round(vv?.offsetTop ?? 0);
		/* Pin chrome to the visual viewport (height + iOS pan offset) — once. */
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
