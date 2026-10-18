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
				name: 'Alpha Admin',
				short_name: 'Admin',
				description: 'Family space operator dashboard',
				lang: 'en',
				dir: 'ltr',
				start_url: '/',
				scope: '/',
				id: '/',
				display: 'standalone',
				display_override: ['standalone', 'minimal-ui'],
				orientation: 'any',
				background_color: '#121212',
				theme_color: '#090909',
				categories: ['productivity', 'utilities'],
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
				navigateFallback: '/',
				navigateFallbackDenylist: [/^\/api/, /\/sw\.js$/],
				navigationPreload: false,
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.destination === 'font',
						handler: 'CacheFirst',
						options: {
							cacheName: 'fonts',
							expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 }
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
	server: {
		port: 5174,
		strictPort: false
	}
});
