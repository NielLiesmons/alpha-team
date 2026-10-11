<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import { initTheme } from '$lib/theme.svelte.js';

	let { children } = $props();

	onMount(() => {
		initTheme();
	});
</script>

<AppShell>
	{@render children()}
</AppShell>
