const KEY = 'alpha-admin-theme';

/** @typedef {'system' | 'light' | 'gray' | 'dark'} ThemeChoice */

export const themeChoice = $state(/** @type {{ value: ThemeChoice }} */ ({ value: 'system' }));

/** @param {ThemeChoice} choice */
export function resolveTheme(choice) {
	if (choice !== 'system') return choice;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'gray' : 'light';
}

/** @param {ThemeChoice} choice */
export function applyTheme(choice) {
	const resolved = resolveTheme(choice);
	document.documentElement.dataset.theme = resolved;
	const meta = document.querySelector('meta[name="theme-color"]');
	const color = resolved === 'light' ? '#F3ECE2' : resolved === 'dark' ? '#000000' : '#121212';
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
	const choice =
		saved === 'light' || saved === 'gray' || saved === 'dark' || saved === 'system' ? saved : 'system';
	themeChoice.value = choice;
	applyTheme(choice);
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (themeChoice.value === 'system') applyTheme('system');
	});
}
