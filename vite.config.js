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
				/* Query busts stale importScripts after push-open / tip-mid + local-first boot. */
				importScripts: ['/push-sw.js?v=9'],
				/*
				 * Do NOT use navigateFallback → createHandlerBoundToURL (cache-only).
				 * After rsync deploys, that served stale HTML pointing at deleted hashed
				 * chunks and blanked installed PWAs until a hard refresh.
				 *
				 * NetworkFirst with a short timeout: prefer live HTML when online,
				 * fall back to last cached page within ~0.35s (and immediately offline)
				 * so airplane-mode / flaky mobile doesn’t sit on the boot wave.
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
				 * PWAs after deploy. Pages use NetworkFirst (alpha-pages-v8) instead.
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
							cacheName: 'alpha-pages-v8',
							/* 0.35s — local-first: prefer cached shell quickly; was 1s. */
							networkTimeoutSeconds: 0.35,
							expiration: {
								maxEntries: 64,
								maxAgeSeconds: 60 * 60 * 24 * 14
							},
							cacheableResponse: { statuses: [200] },
							plugins: [
								{
									handlerDidError: async ({ request }) => {
										const reqUrl = request?.url ? new URL(request.url) : null;
										const path = reqUrl?.pathname || '/';
										const match =
											(await caches.match(request, { ignoreSearch: true })) ||
											(path !== '/'
												? await caches.match(path, { ignoreSearch: true })
												: null) ||
											(await caches.match('/', { ignoreSearch: true })) ||
											(await caches.match('/index.html', { ignoreSearch: true })) ||
											(await caches.match('/chat', { ignoreSearch: true }));
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
