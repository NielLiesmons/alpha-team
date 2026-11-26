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
				/* Query busts stale importScripts after pages seed + immutable adopt. */
				importScripts: ['/push-sw.js?v=14'],
				/*
				 * Do NOT use navigateFallback → createHandlerBoundToURL (cache-only).
				 * After rsync deploys, that served stale HTML pointing at deleted hashed
				 * chunks and blanked installed PWAs until a hard refresh.
				 *
				 * NetworkFirst with a short timeout: prefer live HTML when online,
				 * fall back to last cached page within ~0.35s (and immediately offline).
				 * push-sw.js seeds `/` + `/chat` into this cache on install so airplane
				 * kill-reopen is not stuck on an empty runtime cache after a version bump.
				 */
				/* null → no cache-only NavigationRoute (see NetworkFirst below). */
				navigateFallback: null,
				navigationPreload: false,
				/*
				 * Keep the prior workbox precache — push-sw trims to 2 generations.
				 * Aggressive cleanup deleted modules that cached HTML still referenced,
				 * which is the warm-offline “Still opening offline” death spiral.
				 */
				cleanupOutdatedCaches: false,
				clientsClaim: true,
				skipWaiting: true,
				/*
				 * Never precache HTML shells. Precache matches before runtime routes, so
				 * caching `/` / `chat` / … reintroduced cache-only navigations and blanked
				 * PWAs after deploy. Pages use NetworkFirst (alpha-pages-v11) instead.
				 */
				globPatterns: ['**/*.{js,css,ico,png,svg,webp,woff,woff2,webmanifest}'],
				/* Kit appends prerendered HTML globs — ignore so SPA shells stay out of precache. */
				globIgnores: ['**/api/recover.html', 'prerendered/**'],
				runtimeCaching: [
					{
						/* Kit emits _app/env.js after Workbox’s precache glob — cache it explicitly. */
						urlPattern: ({ url }) =>
							url.pathname === '/_app/env.js' || url.pathname === '/_app/version.json',
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'alpha-app-meta-v1',
							cacheableResponse: { statuses: [200] }
						}
					},
					{
						urlPattern: ({ request, url }) =>
							request.mode === 'navigate' &&
							!url.pathname.startsWith('/api') &&
							!url.pathname.startsWith('/jmap') &&
							!url.pathname.endsWith('/sw.js'),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'alpha-pages-v11',
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
										const ignore = { ignoreSearch: true };
										/** @param {Cache} cache */
										const fromCache = async (cache) =>
											(await cache.match(request, ignore)) ||
											(await cache.match(path, ignore)) ||
											(await cache.match('/', ignore)) ||
											(await cache.match('/chat', ignore));
										const current = await caches.open('alpha-pages-v11');
										let match = await fromCache(current);
										if (!match) {
											const names = (await caches.keys())
												.filter(
													(n) =>
														n.indexOf('alpha-pages-') === 0 &&
														n !== 'alpha-pages-v11'
												)
												.sort((a, b) =>
													b.localeCompare(a, undefined, { numeric: true })
												);
											for (const name of names) {
												match = await fromCache(await caches.open(name));
												if (match) break;
											}
										}
										if (!match) {
											match =
												(await caches.match(request, ignore)) ||
												(path !== '/'
													? await caches.match(path, ignore)
													: null) ||
												(await caches.match('/', ignore)) ||
												(await caches.match('/chat', ignore));
										}
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
