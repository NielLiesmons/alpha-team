<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { actor } from '$lib/actor.svelte.js';
	import { appBoot, bootApp } from '$lib/boot.svelte.js';
	import { initBrand } from '$lib/brand.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { initPwa } from '$lib/pwa.svelte.js';
	import { initTheme } from '$lib/theme.svelte.js';
	import { startViewportBridge } from '$lib/viewport.svelte.js';
	import AppShell from '$lib/components/AppShell.svelte';
	import BootSplash from '$lib/components/BootSplash.svelte';
	import WelcomeGate from '$lib/components/WelcomeGate.svelte';

	let { children } = $props();

	const signedIn = $derived(Boolean(driveSession.connected && actor.email));
	const webManifestLink = $derived(pwaInfo?.webManifest?.linkTag ?? '');

	onMount(() => {
		const stopVv = startViewportBridge();
		const stopPwa = initPwa();
		initBrand();
		initTheme();
		bootApp();

		// Light SW registration — avoid hammering iOS with update checks.
		// (Must run before cleanup return — previously this was dead code after `return`.)
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			void import('virtual:pwa-register').then(({ registerSW }) => {
				registerSW({
					immediate: true,
					onRegisteredSW(_swUrl, registration) {
						if (!registration) return;
						let lastCheck = 0;
						const CHECK_MS = 6 * 60 * 60 * 1000;
						document.addEventListener('visibilitychange', () => {
							if (document.visibilityState !== 'visible') return;
							const now = Date.now();
							if (now - lastCheck < CHECK_MS) return;
							lastCheck = now;
							void registration.update();
						});
					}
				});
			});
		}

		return () => {
			stopVv();
			stopPwa?.();
		};
	});
</script>

<svelte:head>
	{#if webManifestLink}
		{@html webManifestLink}
	{/if}
</svelte:head>

{#if !appBoot.ready}
	<BootSplash />
{:else if !signedIn}
	<WelcomeGate />
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
