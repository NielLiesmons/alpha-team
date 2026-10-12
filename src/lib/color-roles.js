/**
 * Map brand accent → UI roles.
 * Warm accents (red / pink / orange) use accent-2 for success/confirm;
 * cool accents keep accent for success and accent-2 for “in progress”.
 */

/**
 * @param {string} hex
 * @returns {{ h: number, s: number, l: number } | null}
 */
export function hexToHsl(hex) {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
	if (!m) return null;
	const r = parseInt(m[1], 16) / 255;
	const g = parseInt(m[2], 16) / 255;
	const b = parseInt(m[3], 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return { h: h * 360, s, l };
}

/** Red / pink / orange / warm rose family. */
export function isWarmAccent(hex) {
	const hsl = hexToHsl(hex);
	if (!hsl) return false;
	if (hsl.s < 0.12) return false;
	const { h } = hsl;
	return h <= 55 || h >= 320;
}

/**
 * @param {string} accent
 * @returns {{ success: string, progress: string, warm: boolean }}
 */
export function accentRoles(accent) {
	const warm = isWarmAccent(accent);
	return {
		warm,
		/* CSS var names resolved on :root — callers set --accent-success etc. */
		success: warm ? 'var(--accent-2)' : 'var(--accent)',
		progress: warm ? 'var(--accent)' : 'var(--accent-2)'
	};
}
