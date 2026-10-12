const KEY = 'alpha-admin-theme';

/** @typedef {'system' | 'light' | 'gray' | 'dark' | 'black'} ThemeChoice */

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
	const color =
		resolved === 'light'
			? '#f5f2f2'
			: resolved === 'black'
				? '#000000'
				: resolved === 'dark'
					? '#0a0808'
					: '#160b0f';
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
		saved === 'light' ||
		saved === 'gray' ||
		saved === 'dark' ||
		saved === 'black' ||
		saved === 'system'
			? saved
			: 'system';
	themeChoice.value = choice;
	applyTheme(choice);
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (themeChoice.value === 'system') applyTheme('system');
	});
}
