<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { actor } from '$lib/actor.svelte.js';
	import { appBoot, bootApp } from '$lib/boot.svelte.js';
	import { initBrand } from '$lib/brand.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { initChatWakeListeners } from '$lib/chat-sync.svelte.js';
	import { initPwa } from '$lib/pwa.svelte.js';
	import { startRealtime, stopRealtime } from '$lib/realtime.svelte.js';
	import { initLocale } from '$lib/i18n.svelte.js';
	import { initTheme } from '$lib/theme.svelte.js';
	import { startViewportBridge } from '$lib/viewport.svelte.js';
	import AppShell from '$lib/components/AppShell.svelte';
	import BootSplash from '$lib/components/BootSplash.svelte';
	import WelcomeGate from '$lib/components/WelcomeGate.svelte';

	let { children } = $props();

	const signedIn = $derived(Boolean(driveSession.connected && actor.email));
	const webManifestLink = $derived(pwaInfo?.webManifest?.linkTag ?? '');

	/* Realtime bus: connect as soon as Drive creds exist (actor optional on the wire). */
	$effect(() => {
		if (!driveSession.connected) {
			stopRealtime();
			return;
		}
		/* Re-open when actor appears so hello carries the email for diagnostics. */
		void actor.email;
		return startRealtime();
	});

	onMount(() => {
		const stopVv = startViewportBridge();
		const stopPwa = initPwa();
		const stopChatWake = initChatWakeListeners();
		initBrand();
		initTheme();
		initLocale();
		try {
			window.dispatchEvent(new Event('alpha-boot-started'));
		} catch {
			/* ignore */
		}
		void bootApp().catch((e) => {
			console.error('bootApp', e);
			appBoot.error = e instanceof Error ? e.message : String(e);
			appBoot.stuck = true;
		});

		/* Stale hashed chunks after deploy → blank shell; force a clean reload once. */
		/** @param {Event} e */
		function onPreloadError(e) {
			e.preventDefault?.();
			if (sessionStorage.getItem('alpha.chunk-reload') === '1') return;
			sessionStorage.setItem('alpha.chunk-reload', '1');
			location.reload();
		}
		window.addEventListener('vite:preloadError', onPreloadError);

		// Light SW registration — auto-activate new workers so phones leave blank shells.
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			void import('virtual:pwa-register').then(({ registerSW }) => {
				const updateSW = registerSW({
					immediate: true,
					onNeedRefresh() {
						void updateSW?.(true);
					},
					onRegisteredSW(_swUrl, registration) {
						if (!registration) return;
						void registration.update();
						document.addEventListener('visibilitychange', () => {
							if (document.visibilityState !== 'visible') return;
							void registration.update();
						});
					}
				});
			});
		}

		/* Deep-link recovery: /?recover=1 or /?reset=1 */
		try {
			const q = new URLSearchParams(location.search);
			if (q.has('recover') || q.has('reset')) {
				void import('$lib/boot-recovery.js').then(({ recoverAppShell }) =>
					recoverAppShell({ full: q.has('reset') })
				);
			}
		} catch {
			/* ignore */
		}

		return () => {
			stopVv();
			stopPwa?.();
			stopChatWake?.();
			window.removeEventListener('vite:preloadError', onPreloadError);
		};
	});
</script>

<svelte:head>
	{#if webManifestLink}
		{@html webManifestLink}
	{/if}
</svelte:head>

{#if !appBoot.ready || appBoot.stuck}
	<BootSplash />
{:else if !signedIn}
	<WelcomeGate />
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
