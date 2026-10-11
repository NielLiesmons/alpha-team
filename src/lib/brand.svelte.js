/**
 * Per-Space brand knobs (fixture for now → later meta/brand.json on Drive).
 * Surfaces derive from accent + broken grayscale poles — same recipe as Bley.
 */

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
	root.style.setProperty('--bg-base', '#f8f8f8');
	root.style.setProperty('--ink-base', '#040404');
	root.style.setProperty(
		'--bg-raw',
		'color-mix(in oklab, var(--bg-base) 97%, var(--accent) 3%)'
	);
	root.style.setProperty(
		'--ink-raw',
		'color-mix(in oklab, var(--ink-base) 95%, var(--accent) 5%)'
	);
	root.style.setProperty('--scrim', 'color-mix(in srgb, var(--ink-raw) 48%, transparent)');
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
