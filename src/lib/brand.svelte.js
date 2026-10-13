/**
 * Per-Space brand knobs (fixture for now → later meta/brand.json on Drive).
 * Operator UIs: #111 / #1A1A bases + a touch of accent (not the public Bley poles).
 */

import { isWarmAccent } from './color-roles.js';

const KEY = 'alpha-admin-brand';

/** @typedef {{ accent: string, fontDisplay: string }} Brand */

/** @type {Brand} */
const BLEY_DEFAULT = {
	accent: '#dd8f87',
	fontDisplay: 'Ovo'
};

export const brand = $state(/** @type {Brand} */ ({ ...BLEY_DEFAULT }));

/** Apply CSS variables on <html>. */
export function applyBrand(next = brand) {
	const root = document.documentElement;
	root.style.setProperty('--accent', next.accent);
	root.style.setProperty(
		'--font-display',
		`'${next.fontDisplay}', 'Times New Roman', Georgia, serif`
	);
	/* Hue only — fixed L/C so accent never lifts #111 / #1A1A brightness */
	root.style.setProperty('--page-raw', 'oklch(from var(--accent) 0.177 0.006 h)');
	root.style.setProperty('--popover-raw', 'oklch(from var(--accent) 0.235 0.005 h)');
	root.style.setProperty('--type-raw', 'oklch(from var(--accent) 0.97 0.004 h)');
	root.style.setProperty('--page-raw-light', 'oklch(from var(--accent) 0.975 0.004 h)');
	root.style.setProperty('--popover-raw-light', 'oklch(from var(--accent) 0.99 0.003 h)');
	root.style.setProperty('--type-raw-light', 'oklch(from var(--accent) 0.22 0.006 h)');
	root.style.setProperty('--scrim', 'color-mix(in srgb, #000000 55%, transparent)');
	root.style.setProperty('--shadow-strong', 'color-mix(in srgb, #000000 40%, transparent)');

	/* Warm accent (pink/red/orange) → success uses complementary; else accent is success */
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
	localStorage.setItem(KEY, JSON.stringify({ accent: brand.accent, fontDisplay: brand.fontDisplay }));
	applyBrand(brand);
}

export function initBrand() {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (typeof parsed.accent === 'string') brand.accent = parsed.accent;
			if (typeof parsed.fontDisplay === 'string') brand.fontDisplay = parsed.fontDisplay;
		}
	} catch {
		/* ignore */
	}
	applyBrand(brand);
}
