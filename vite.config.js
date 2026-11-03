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
				/* SPA shell for deep links offline (URL stays /drive, /chat, …). */
				navigateFallback: '/',
				navigateFallbackDenylist: [/^\/api/, /^\/jmap/, /\/sw\.js$/],
				navigationPreload: false,
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,webmanifest}'],
				runtimeCaching: [
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
