<script>
	import { onMount } from 'svelte';
	import { serviceOrigin } from '$lib/space-host.js';

	onMount(() => {
		const target =
			serviceOrigin(import.meta.env?.PUBLIC_PLAYER_URL, 'player') || '/';
		window.location.replace(target);
	});
</script>

<p class="hint">Opening Player…</p>

<style>
	.hint {
		padding: 2rem 1.25rem;
		color: var(--fg-66);
		font-size: 14px;
	}
</style>
