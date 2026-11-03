import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			/* SPA fallback so deep routes reopen offline from the PWA shell */
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		prerender: {
			entries: ['*']
		}
	}
};

export default config;
