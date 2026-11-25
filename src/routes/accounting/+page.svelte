<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		void goto('/entreprises', { replaceState: true });
	});
</script>

<svelte:head><title>Entreprises</title></svelte:head>

<p class="redir">Moved to Entreprises…</p>

<style>
	.redir {
		padding: 24px;
		color: var(--fg-33);
		font-size: 0.875rem;
	}
</style>
