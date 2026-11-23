<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { actor } from '$lib/actor.svelte.js';
	import { appBoot, bootApp } from '$lib/boot.svelte.js';
	import { initBrand } from '$lib/brand.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { initChatWakeListeners } from '$lib/chat-sync.svelte.js';
	import { inviteFlow } from '$lib/invite-flow.svelte.js';
	import { initPwa } from '$lib/pwa.svelte.js';
	import { startRealtime, stopRealtime } from '$lib/realtime.svelte.js';
	import { initLocale } from '$lib/i18n.svelte.js';
	import { initTheme } from '$lib/theme.svelte.js';
	import { syncSpaceBrandDefaults } from '$lib/space-brand.svelte.js';
	import { startViewportBridge } from '$lib/viewport.svelte.js';
	import AppShell from '$lib/components/AppShell.svelte';
	import BootSplash from '$lib/components/BootSplash.svelte';
	import SpaceOnboarding from '$lib/components/SpaceOnboarding.svelte';
	import WelcomeGate from '$lib/components/WelcomeGate.svelte';

	let { children } = $props();

	const signedIn = $derived(Boolean(driveSession.connected && actor.email));
	const onboarding = $derived(Boolean(appBoot.onboarding?.active));
	const inviteWarming = $derived(Boolean(inviteFlow.active));
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
		syncSpaceBrandDefaults();
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

		/* Stale hashed chunks after deploy → blank shell; bypass SW via /api/recover once. */
		/** @param {Event} e */
		function onPreloadError(e) {
			e.preventDefault?.();
			if (sessionStorage.getItem('alpha.chunk-reload') === '1') {
				location.replace('/api/recover');
				return;
			}
			sessionStorage.setItem('alpha.chunk-reload', '1');
			location.replace('/api/recover');
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

		/*
		 * Deep-link recovery is handled inline in app.html BEFORE modules load.
		 * Keep a bundle-side fallback only if the inline script was stripped by an
		 * ancient cached shell (should be rare after /api/recover).
		 */
		try {
			if (!window.__ALPHA_RECOVERING) {
				const q = new URLSearchParams(location.search);
				if (q.has('recover') || q.has('reset')) {
					void import('$lib/boot-recovery.js').then(({ recoverAppShell }) =>
						recoverAppShell({ full: q.has('reset') })
					);
				}
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
{:else if !signedIn || inviteWarming}
	<WelcomeGate />
{:else if onboarding}
	<SpaceOnboarding />
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
