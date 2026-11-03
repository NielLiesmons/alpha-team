<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		void goto('/settings', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>
