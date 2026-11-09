/**
 * App locale — EN / FR / NL / ES.
 * Expand dict keys as screens are migrated; mail quote detection is separate (mail-body.js).
 */
import en from '$lib/i18n/en.js';
import fr from '$lib/i18n/fr.js';
import nl from '$lib/i18n/nl.js';
import es from '$lib/i18n/es.js';

const KEY = 'alpha-admin-locale';

/** @typedef {'en' | 'fr' | 'nl' | 'es'} AppLocale */

/** @type {Record<AppLocale, Record<string, string>>} */
const dicts = { en, fr, nl, es };

/** @type {{ value: AppLocale }} */
export const locale = $state({ value: 'en' });

/** @type {{ id: AppLocale, label: string, native: string }[]} */
export const localeChoices = [
	{ id: 'en', label: 'English', native: 'English' },
	{ id: 'fr', label: 'French', native: 'Français' },
	{ id: 'nl', label: 'Dutch', native: 'Nederlands' },
	{ id: 'es', label: 'Spanish', native: 'Español' }
];

/** @param {string} code @returns {code is AppLocale} */
export function isAppLocale(code) {
	return code === 'en' || code === 'fr' || code === 'nl' || code === 'es';
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, vars) {
	const table = dicts[locale.value] || en;
	let out = table[key] ?? en[key] ?? key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			out = out.replaceAll(`{${k}}`, String(v));
		}
	}
	return out;
}

/** @param {AppLocale} code */
export function setLocale(code) {
	if (!isAppLocale(code)) return;
	locale.value = code;
	try {
		localStorage.setItem(KEY, code);
	} catch {
		/* ignore */
	}
	if (typeof document !== 'undefined') {
		document.documentElement.lang = code;
	}
}

export function initLocale() {
	/** @type {AppLocale} */
	let next = 'en';
	try {
		const saved = localStorage.getItem(KEY);
		if (isAppLocale(saved || '')) next = /** @type {AppLocale} */ (saved);
		else if (typeof navigator !== 'undefined') {
			const nav = String(navigator.language || '')
				.toLowerCase()
				.slice(0, 2);
			if (isAppLocale(nav)) next = nav;
		}
	} catch {
		/* ignore */
	}
	locale.value = next;
	if (typeof document !== 'undefined') {
		document.documentElement.lang = next;
	}
}
