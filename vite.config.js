import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: null,
			strategies: 'generateSW',
			manifest: {
				name: 'Alpha',
				short_name: 'Alpha',
				description: 'Family chat, drive, mail, and planning',
				lang: 'en',
				dir: 'ltr',
				start_url: '/',
				scope: '/',
				id: '/',
				display: 'standalone',
				display_override: ['standalone', 'minimal-ui'],
				orientation: 'any',
				background_color: '#090909',
				theme_color: '#090909',
				categories: ['productivity', 'social', 'utilities'],
				icons: [
					{
						src: '/icons/icon-192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/icon-maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// App shell only — never intercept Drive API / cross-origin traffic.
				importScripts: ['/push-sw.js'],
				/*
				 * Do NOT use navigateFallback → createHandlerBoundToURL (cache-only).
				 * After rsync deploys, that served stale HTML pointing at deleted hashed
				 * chunks and blanked installed PWAs until a hard refresh. NetworkFirst
				 * prefers live HTML when online; offline falls back to last cached page
				 * or precached `/`.
				 */
				/* null → no cache-only NavigationRoute (see NetworkFirst below). */
				navigateFallback: null,
				navigationPreload: false,
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
				/*
				 * Never precache HTML shells. Precache matches before runtime routes, so
				 * caching `/` / `chat` / … reintroduced cache-only navigations and blanked
				 * PWAs after deploy. Pages use NetworkFirst (alpha-pages-v3) instead.
				 */
				globPatterns: ['**/*.{js,css,ico,png,svg,webp,woff,woff2,webmanifest}'],
				/* Kit appends prerendered HTML globs — ignore so SPA shells stay out of precache. */
				globIgnores: ['**/api/recover.html', 'prerendered/**'],
				runtimeCaching: [
					{
						urlPattern: ({ request, url }) =>
							request.mode === 'navigate' &&
							!url.pathname.startsWith('/api') &&
							!url.pathname.startsWith('/jmap') &&
							!url.pathname.endsWith('/sw.js'),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'alpha-pages-v3',
							networkTimeoutSeconds: 3,
							expiration: {
								maxEntries: 64,
								maxAgeSeconds: 60 * 60 * 24 * 14
							},
							cacheableResponse: { statuses: [200] },
							plugins: [
								{
									handlerDidError: async () => {
										const match =
											(await caches.match('/', { ignoreSearch: true })) ||
											(await caches.match('/index.html', { ignoreSearch: true }));
										return match || Response.error();
									}
								}
							]
						}
					},
					{
						urlPattern: ({ request }) => request.destination === 'font',
						handler: 'CacheFirst',
						options: {
							cacheName: 'fonts',
							expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 }
						}
					},
					{
						urlPattern: ({ request, sameOrigin }) =>
							sameOrigin && request.destination === 'image',
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'images',
							expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 }
						}
					}
				]
			},
			devOptions: {
				enabled: false
			},
			kit: {
				includeVersionFile: true
			}
		})
	],
	ssr: {
		noExternal: ['@alpha/ui']
	},
	server: {
		port: 5174,
		strictPort: false,
		/* Same-origin JMAP — browser cannot call mail.{apex} (no CORS). */
		proxy: {
			'/jmap': {
				target: process.env.ALPHA_JMAP_PROXY || 'http://127.0.0.1:8080',
				changeOrigin: true,
				secure: false
			}
		}
	}
});
