const KEY = 'alpha-admin-theme';

/** @typedef {'system' | 'light' | 'dark'} ThemeChoice */

export const themeChoice = $state(/** @type {{ value: ThemeChoice }} */ ({ value: 'system' }));

/** @param {ThemeChoice} choice */
export function resolveTheme(choice) {
	if (choice !== 'system') return choice;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolve a CSS color var to a concrete color for meta theme-color.
 * @param {string} varName e.g. '--shell' or '--bg'
 */
export function resolveCssColor(varName) {
	const el = document.createElement('div');
	el.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;background:var(${varName})`;
	document.documentElement.appendChild(el);
	const color = getComputedStyle(el).backgroundColor;
	el.remove();
	return color;
}

/**
 * Sync browser chrome (status / home indicator) to a surface token.
 * @param {'--shell' | '--bg'} [surface]
 */
export function syncThemeColor(surface = '--shell') {
	const meta = document.querySelector('meta[name="theme-color"]');
	if (!meta) return;
	const color = resolveCssColor(surface);
	if (color) meta.setAttribute('content', color);
}

/** @param {ThemeChoice} choice */
export function applyTheme(choice) {
	const resolved = resolveTheme(choice);
	document.documentElement.dataset.theme = resolved;
	/* Nav drawer owns theme-color while open — don't fight it. */
	if (!document.documentElement.classList.contains('nav-menu-open')) {
		syncThemeColor('--shell');
	}
}

/** @param {ThemeChoice} choice */
export function setTheme(choice) {
	themeChoice.value = choice;
	localStorage.setItem(KEY, choice);
	applyTheme(choice);
}

export function initTheme() {
	const saved = localStorage.getItem(KEY);
	/** @type {ThemeChoice} */
	let choice = 'system';
	if (saved === 'light' || saved === 'dark' || saved === 'system') {
		choice = saved;
	} else if (saved === 'gray' || saved === 'black') {
		/* legacy Black / Gray → standard dark */
		choice = 'dark';
	}
	themeChoice.value = choice;
	applyTheme(choice);
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (themeChoice.value === 'system') applyTheme('system');
	});
}
