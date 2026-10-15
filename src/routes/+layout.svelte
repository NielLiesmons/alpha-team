<script>
	import '../app.css';
	import { onMount } from 'svelte';
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

	onMount(() => {
		initBrand();
		initTheme();
		bootApp();
	});
</script>

{#if !appBoot.ready}
	<BootSplash />
{:else if !signedIn}
	<WelcomeGate />
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
