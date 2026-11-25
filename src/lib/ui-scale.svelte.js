/**
 * Text size (Settings → Appearance) — app-wide UI scale.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  TWEAK HERE → UI_SCALE_FACTORS                              │
 * │  small 0.95 · normal 1.07 · large 1.18                      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Pipeline (one source of truth):
 *   1. This module writes `--ui-scale` (+ data-ui-scale) on <html>
 *   2. app.css: `html { font-size: calc(16px * var(--ui-scale)) }`
 *   3. All rem type / rem chrome across the shell follows
 *
 * Rem-based type grows; layout/pointer geometry that must stay hit-stable
 * stays in CSS pixels — no CSS `zoom` (that desyncs clientX / overlays).
 *
 * Default when unset:
 * - Tiny phones (CSS width ≤375, e.g. old iPhone SE) → small (95%)
 * - Otherwise → normal (107%)
 */

const KEY = 'alpha-admin-ui-scale';

/** Logical CSS width at/under which we default to Small (iPhone SE 1/2 = 375). */
export const UI_SCALE_TINY_MAX_WIDTH = 375;

/** @typedef {'small' | 'normal' | 'large'} UiScaleChoice */

/**
 * Scale factors — change these to retune Small / Normal / Large globally.
 * @type {Record<UiScaleChoice, number>}
 */
export const UI_SCALE_FACTORS = {
	small: 0.95,
	normal: 1.07,
	large: 1.18
};

export const uiScaleChoice = $state(/** @type {{ value: UiScaleChoice }} */ ({ value: 'normal' }));

/** @param {string | null | undefined} raw */
export function parseUiScaleChoice(raw) {
	if (raw === 'small' || raw === 'normal' || raw === 'large') return raw;
	return null;
}

/** @param {UiScaleChoice} choice */
export function uiScaleFactor(choice) {
	return UI_SCALE_FACTORS[choice] ?? 1.07;
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

function isMobileViewport() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(max-width: 767px)').matches ||
		window.matchMedia('(pointer: coarse)').matches
	);
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
}

/** @param {UiScaleChoice} choice */
export function setUiScale(choice) {
	uiScaleChoice.value = choice;
	localStorage.setItem(KEY, choice);
	applyUiScale(choice);
}

export function initUiScale() {
	const saved = parseUiScaleChoice(localStorage.getItem(KEY));
	const choice = saved ?? defaultUiScaleChoice();
	uiScaleChoice.value = choice;
	applyUiScale(choice);
}
