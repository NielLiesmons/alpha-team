<script>
	/**
	 * Content-type glyph for tip rows / comment sheet bars.
	 * Prefer filled nav PNG (mail.png, notes.png, …); fall back to stroke NavIcon.
	 * Task / project / enterprise keep their host boxes — do not use this for those.
	 */
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';

	/** @type {{ name?: string, size?: number }} */
	let { name = 'chat', size = 19 } = $props();

	const png = $derived(navPngUrl(name));
</script>

{#if png}
	<img class="tip-png" src={png} alt="" width={size} height={size} />
{:else}
	<NavIcon {name} {size} />
{/if}

<style>
	.tip-png {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		/* Match quiet chrome — filled art reads at full ink */
		opacity: 0.92;
	}
</style>
