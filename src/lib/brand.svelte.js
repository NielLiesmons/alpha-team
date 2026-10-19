/**
 * Per-Space brand knobs (fixture for now → later meta/brand.json on Drive).
 * Operator UIs: near-grayscale fg/bg poles + accent hue (shared model with Bley).
 * Admin never sets a display / serif face.
 */

import { isWarmAccent } from './color-roles.js';

const KEY = 'alpha-admin-brand';

/** @typedef {{ accent: string }} Brand */

/** @type {Brand} */
const BLEY_DEFAULT = {
	accent: '#dd8f87'
};

export const brand = $state(/** @type {Brand} */ ({ ...BLEY_DEFAULT }));

/** Apply CSS variables on <html>. */
export function applyBrand(next = brand) {
	const root = document.documentElement;
	root.style.setProperty('--accent', next.accent);

	/* Poles — low saturation for Admin (Bley site raises S on the public surface). */
	root.style.setProperty('--fg-raw', 'hsl(from var(--accent) h 8% 8%)');
	root.style.setProperty('--bg-raw', 'hsl(from var(--accent) h 4% 97%)');
	root.style.setProperty('--ink-raw', 'var(--fg-raw)');

	/* Shadows from dark pole; scrim is theme/viewport CSS (--bg / --shell) */
	root.style.setProperty('--shadow', 'color-mix(in srgb, var(--fg-raw) 22%, transparent)');
	root.style.setProperty('--shadow-strong', 'color-mix(in srgb, var(--fg-raw) 32%, transparent)');
	root.style.removeProperty('--scrim');

	const warm = isWarmAccent(next.accent);
	root.dataset.accentWarm = warm ? '1' : '0';
	if (warm) {
		root.style.setProperty('--accent-success', 'var(--accent-2)');
		root.style.setProperty('--accent-progress', 'var(--accent)');
	} else {
		root.style.setProperty('--accent-success', 'var(--accent)');
		root.style.setProperty('--accent-progress', 'var(--accent-2)');
	}
	root.style.setProperty(
		'--accent-success-66',
		'color-mix(in srgb, var(--accent-success) 66%, transparent)'
	);
	root.style.setProperty(
		'--accent-progress-66',
		'color-mix(in srgb, var(--accent-progress) 66%, transparent)'
	);
}

/** @param {Partial<Brand>} patch */
export function setBrand(patch) {
	Object.assign(brand, patch);
	localStorage.setItem(KEY, JSON.stringify({ accent: brand.accent }));
	applyBrand(brand);
}

export function initBrand() {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (typeof parsed.accent === 'string') brand.accent = parsed.accent;
		}
	} catch {
		/* ignore */
	}
	applyBrand(brand);
}
