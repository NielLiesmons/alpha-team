<script>
	import '../app.css';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { actor } from '$lib/actor.svelte.js';
	import { appBoot, bootApp, unlockShellFromLocalSession } from '$lib/boot.svelte.js';
	import { initBrand } from '$lib/brand.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { initChatWakeListeners } from '$lib/chat-sync.svelte.js';
	import { inviteFlow } from '$lib/invite-flow.svelte.js';
	import { initPwa } from '$lib/pwa.svelte.js';
	import { startRealtime, stopRealtime } from '$lib/realtime.svelte.js';
	import { initLocale } from '$lib/i18n.svelte.js';
	import { initTheme } from '$lib/theme.svelte.js';
	import { initUiScale } from '$lib/ui-scale.svelte.js';
	import { syncSpaceBrandDefaults } from '$lib/space-brand.svelte.js';
	import { startViewportBridge } from '$lib/viewport.svelte.js';
	import AppShell from '$lib/components/AppShell.svelte';
	import BootSplash from '$lib/components/BootSplash.svelte';
	import SpaceOnboarding from '$lib/components/SpaceOnboarding.svelte';
	import WelcomeGate from '$lib/components/WelcomeGate.svelte';

	let { children } = $props();

	/*
	 * Returning PWA: unlock AppShell from localStorage BEFORE first paint of BootSplash.
	 * Airplane mode / warm opens must not wait on Drive or async bootApp.
	 * Prerender stays wave-free (see markup). Pre-module #alpha-boot-shell wave stays
	 * until .shell mounts — hiding it on warm-boot left a blank screen.
	 */
	if (browser) {
		try {
			unlockShellFromLocalSession();
		} catch {
			/* ignore */
		}
	}

	const signedIn = $derived(Boolean(driveSession.connected && actor.email));
	const onboarding = $derived(Boolean(appBoot.onboarding?.active));
	const inviteWarming = $derived(Boolean(inviteFlow.active));
	const webManifestLink = $derived(pwaInfo?.webManifest?.linkTag ?? '');

	/* Drop the pre-module boot shell as soon as this module runs — don’t wait onMount. */
	if (typeof window !== 'undefined') {
		try {
			queueMicrotask(() => window.dispatchEvent(new Event('alpha-boot-started')));
		} catch {
			/* ignore */
		}
	}

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
		initUiScale();
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
			/* Airplane mode: reload cannot invent modules — leave SW cache-first path alone. */
			const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
			if (offline) return;
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

{#if !browser}
	<!--
		Prerender / SSR: theme background only. Never bake BootSplash Metaball into
		static HTML — returning PWAs would show it on every fresh open until hydrate.
	-->
	<main class="boot-placeholder" aria-busy="true" aria-label="Loading"></main>
{:else if !appBoot.ready || appBoot.stuck}
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

<style>
	.boot-placeholder {
		min-height: 100dvh;
		margin: 0;
		background: var(--shell, #090909);
	}
</style>
