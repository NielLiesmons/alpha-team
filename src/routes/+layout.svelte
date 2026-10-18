<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { actor } from '$lib/actor.svelte.js';
	import { appBoot, bootApp } from '$lib/boot.svelte.js';
	import { initBrand } from '$lib/brand.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { initTheme } from '$lib/theme.svelte.js';
	import AppShell from '$lib/components/AppShell.svelte';
	import BootSplash from '$lib/components/BootSplash.svelte';
	import WelcomeGate from '$lib/components/WelcomeGate.svelte';

	let { children } = $props();

	const signedIn = $derived(Boolean(driveSession.connected && actor.email));
	const webManifestLink = $derived(pwaInfo?.webManifest?.linkTag ?? '');

	onMount(() => {
		initBrand();
		initTheme();
		bootApp();

		// Register SW after first paint — autoUpdate keeps home-screen installs fresh.
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			void import('virtual:pwa-register').then(({ registerSW }) => {
				registerSW({
					immediate: true,
					onRegisteredSW(_swUrl, registration) {
						if (!registration) return;
						// Periodic check (iOS PWA often sleeps; catch updates on resume)
						setInterval(() => {
							void registration.update();
						}, 60 * 60 * 1000);
						document.addEventListener('visibilitychange', () => {
							if (document.visibilityState === 'visible') void registration.update();
						});
					}
				});
			});
		}
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
