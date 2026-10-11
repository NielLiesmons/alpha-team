<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import { initBrand } from '$lib/brand.svelte.js';
	import { initTheme } from '$lib/theme.svelte.js';

	let { children } = $props();

	onMount(() => {
		initBrand();
		initTheme();
	});
</script>

<AppShell>
	{@render children()}
</AppShell>
