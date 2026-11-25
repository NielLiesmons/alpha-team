/**
 * UI scale (Settings → Appearance) — app-wide coherent scale.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  TWEAK HERE → UI_SCALE_FACTORS_MOBILE / _DESKTOP            │
 * │  Mobile:  small 0.95 · normal 1.07 · large 1.18             │
 * │  Desktop: small 0.95 · normal 1.00 · large 1.18             │
 * │  (Desktop Normal = 100% — same as pre-scale chrome.)        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Pipeline (one source of truth — no CSS `zoom`):
 *   1. This module writes `--ui-scale` (+ data-ui-scale) on <html>
 *   2. app.css: `html { font-size: calc(16px * var(--ui-scale)) }`
 *   3. Rem type + rem chrome (paddings, pills, icons, hit targets) follow
 *
 * Never use CSS `zoom` — it desyncs clientX / FloatPanel / chat overlays.
 */

const KEY = 'alpha-admin-ui-scale';

/** Logical CSS width at/under which we default to Small (iPhone SE 1/2 = 375). */
export const UI_SCALE_TINY_MAX_WIDTH = 375;

/** @typedef {'small' | 'normal' | 'large'} UiScaleChoice */

/**
 * Mobile factors — Normal is ~107% so touch chrome reads a touch larger.
 * @type {Record<UiScaleChoice, number>}
 */
export const UI_SCALE_FACTORS_MOBILE = {
	small: 0.95,
	normal: 1.07,
	large: 1.18
};

/**
 * Desktop factors — Normal is exactly 100% (no scaling vs pre-scale UI).
 * Small / Large still scale via rem-root (coherent; no overlay zoom bugs).
 * @type {Record<UiScaleChoice, number>}
 */
export const UI_SCALE_FACTORS_DESKTOP = {
	small: 0.95,
	normal: 1,
	large: 1.18
};

/**
 * @deprecated Prefer UI_SCALE_FACTORS_MOBILE / _DESKTOP — kept as mobile alias.
 * @type {Record<UiScaleChoice, number>}
 */
export const UI_SCALE_FACTORS = UI_SCALE_FACTORS_MOBILE;

export const uiScaleChoice = $state(/** @type {{ value: UiScaleChoice }} */ ({ value: 'normal' }));

/** @type {(() => void) | null} */
let removeViewportListener = null;

/** @param {string | null | undefined} raw */
export function parseUiScaleChoice(raw) {
	if (raw === 'small' || raw === 'normal' || raw === 'large') return raw;
	return null;
}

export function isMobileViewport() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(max-width: 767px)').matches ||
		window.matchMedia('(pointer: coarse)').matches
	);
}

/** @param {UiScaleChoice} choice */
export function uiScaleFactor(choice) {
	const table = isMobileViewport() ? UI_SCALE_FACTORS_MOBILE : UI_SCALE_FACTORS_DESKTOP;
	const fallback = isMobileViewport() ? 1.07 : 1;
	return table[choice] ?? fallback;
}

/**
 * Detect “tiny phone” for the unset default (old SE-class / narrow CSS width).
 * Uses the smaller of innerWidth and screen.width so landscape SE still qualifies.
 */
export function isTinyPhoneViewport() {
	if (typeof window === 'undefined') return false;
	const w = Math.min(window.innerWidth || 0, window.screen?.width || window.innerWidth || 0);
	return w > 0 && w <= UI_SCALE_TINY_MAX_WIDTH;
}

/** Default choice when localStorage has no preference. */
export function defaultUiScaleChoice() {
	if (typeof window === 'undefined') return 'normal';
	if (isMobileViewport() && isTinyPhoneViewport()) return 'small';
	return 'normal';
}

/** @param {UiScaleChoice} choice */
export function applyUiScale(choice) {
	const factor = uiScaleFactor(choice);
	const root = document.documentElement;
	root.style.setProperty('--ui-scale', String(factor));
	root.dataset.uiScale = choice;
	root.dataset.uiScaleViewport = isMobileViewport() ? 'mobile' : 'desktop';
}

/** @param {UiScaleChoice} choice */
export function setUiScale(choice) {
	uiScaleChoice.value = choice;
	localStorage.setItem(KEY, choice);
	applyUiScale(choice);
}

function bindViewportListener() {
	if (typeof window === 'undefined') return;
	removeViewportListener?.();
	const mqWidth = window.matchMedia('(max-width: 767px)');
	const mqCoarse = window.matchMedia('(pointer: coarse)');
	const onChange = () => applyUiScale(uiScaleChoice.value);
	mqWidth.addEventListener('change', onChange);
	mqCoarse.addEventListener('change', onChange);
	removeViewportListener = () => {
		mqWidth.removeEventListener('change', onChange);
		mqCoarse.removeEventListener('change', onChange);
		removeViewportListener = null;
	};
}

export function initUiScale() {
	const saved = parseUiScaleChoice(localStorage.getItem(KEY));
	const choice = saved ?? defaultUiScaleChoice();
	uiScaleChoice.value = choice;
	applyUiScale(choice);
	bindViewportListener();
}
