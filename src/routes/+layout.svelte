<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import { loadActor } from '$lib/actor.svelte.js';
	import { initBrand } from '$lib/brand.svelte.js';
	import { initTheme } from '$lib/theme.svelte.js';

	let { children } = $props();

	onMount(() => {
		initBrand();
		initTheme();
		loadActor();
	});
</script>

<AppShell>
	{@render children()}
</AppShell>
