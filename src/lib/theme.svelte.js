const KEY = 'alpha-admin-theme';

/** @typedef {'system' | 'light' | 'dark'} ThemeChoice */

export const themeChoice = $state(/** @type {{ value: ThemeChoice }} */ ({ value: 'system' }));

/** @param {ThemeChoice} choice */
export function resolveTheme(choice) {
	if (choice !== 'system') return choice;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** @param {ThemeChoice} choice */
export function applyTheme(choice) {
	const resolved = resolveTheme(choice);
	document.documentElement.dataset.theme = resolved;
	const meta = document.querySelector('meta[name="theme-color"]');
	const color = resolved === 'light' ? '#f8f5f5' : '#160b0f';
	meta?.setAttribute('content', color);
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
