/** Same string → color mapping the Chateau / Zapstore / Alpha Chat avatars use. */

/**
 * Prefer email (stable, unique) for profile hue; fall back to display name.
 * @param {string} [email]
 * @param {string} [name]
 */
export function profileColorSeed(email, name) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	if (e.includes('@')) return e;
	const n = String(name || '').trim();
	if (n) return n;
	return 'A';
}

/** @param {string} value */
export function stringToColor(value) {
	const normalized = value.trim().toUpperCase();
	if (normalized.length === 0) return { r: 128, g: 128, b: 128 };

	let number = BigInt(0);
	for (let i = 0; i < normalized.length; i++) {
		number += BigInt(normalized.charCodeAt(i)) * BigInt(256) ** BigInt(i);
	}

	const hue = Number(number % BigInt(360));
	const h = hue / 60;
	const s = 0.7;
	const v = hue >= 32 && hue <= 204 ? 0.7 : hue >= 216 && hue <= 273 ? 0.96 : 0.9;
	const c = v * s;
	const x = c * (1 - Math.abs((h % 2) - 1));
	const m = v - c;

	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 1) {
		r = c;
		g = x;
	} else if (h < 2) {
		r = x;
		g = c;
	} else if (h < 3) {
		g = c;
		b = x;
	} else if (h < 4) {
		g = x;
		b = c;
	} else if (h < 5) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}

	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

/** @param {{ r: number, g: number, b: number }} rgb @param {boolean} isDark */
export function profileTextColor(rgb, isDark) {
	const factor = isDark ? 1.08 : 0.95;
	const clamp = (n) => Math.min(255, Math.max(0, Math.round(n * factor)));
	return `rgb(${clamp(rgb.r)}, ${clamp(rgb.g)}, ${clamp(rgb.b)})`;
}

/** Bar / accent rgb() from identity seed. */
export function profileAccentCss(email, name) {
	const rgb = stringToColor(profileColorSeed(email, name));
	return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/** Author-name text color (slightly adjusted for theme). */
export function profileNameCss(email, name, isDark) {
	const rgb = stringToColor(profileColorSeed(email, name));
	return profileTextColor(rgb, isDark);
}
