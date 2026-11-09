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

	$effect(() => {
		if (!signedIn) {
			stopRealtime();
			return;
		}
		return startRealtime();
	});

	onMount(() => {
		const stopVv = startViewportBridge();
		const stopPwa = initPwa();
		const stopChatWake = initChatWakeListeners();
		initBrand();
		initTheme();
		initLocale();
		bootApp();

		// Light SW registration — avoid hammering iOS with update checks.
		// (Must run before cleanup return — previously this was dead code after `return`.)
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			void import('virtual:pwa-register').then(({ registerSW }) => {
				registerSW({
					immediate: true,
					onRegisteredSW(_swUrl, registration) {
						if (!registration) return;
						/* Check for deploys on load + whenever the tab becomes visible. */
						void registration.update();
						document.addEventListener('visibilitychange', () => {
							if (document.visibilityState !== 'visible') return;
							void registration.update();
						});
					}
				});
			});
		}

		return () => {
			stopVv();
			stopPwa?.();
			stopChatWake?.();
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
