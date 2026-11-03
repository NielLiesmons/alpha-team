/**
 * Admin brand — Zapstore accent pair is hardcoded in @alpha/ui tokens.
 * This module clears legacy localStorage accent overrides so old Space
 * color picks do not tint poles / accents anymore.
 */

const KEY = 'alpha-admin-brand';

/** @typedef {{ accent: string }} Brand */

/** Fixed accent-1 (read-only for Settings swatches). */
export const brand = $state(/** @type {Brand} */ ({ accent: '#5A58FE' }));

/** Apply / reset CSS variables on <html> — poles stay grayscale. */
export function applyBrand() {
	const root = document.documentElement;
	/* Drop legacy inline overrides from the old accent picker */
	root.style.removeProperty('--accent');
	root.style.removeProperty('--accent-1');
	root.style.removeProperty('--accent-2');
	root.style.removeProperty('--accent-3');
	root.style.removeProperty('--accent-success');
	root.style.removeProperty('--accent-progress');
	root.style.removeProperty('--accent-success-66');
	root.style.removeProperty('--accent-progress-66');
	root.style.removeProperty('--fg-raw');
	root.style.removeProperty('--bg-raw');
	root.style.removeProperty('--ink-raw');
	root.style.removeProperty('--scrim');
	root.style.removeProperty('--shadow');
	root.style.removeProperty('--shadow-strong');
	delete root.dataset.accentWarm;
}

/** @param {Partial<Brand>} _patch ignored — accents are locked */
export function setBrand(_patch) {
	/* no-op: Admin uses Zapstore blurple/gold only for now */
}

export function initBrand() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* ignore */
	}
	applyBrand();
}
