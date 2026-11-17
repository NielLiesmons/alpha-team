<script>
	/**
	 * Content-type glyph for tip rows / comment sheet bars.
	 * Prefer filled nav PNG (mail.png, notes.png, …); fall back to stroke NavIcon.
	 * Task / project / enterprise keep their host boxes — do not use this for those.
	 */
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';

	/**
	 * `size` = outer square (match TaskBox). PNG draws slightly smaller inside.
	 * @type {{ name?: string, size?: number }}
	 */
	let { name = 'chat', size = 22 } = $props();

	const png = $derived(navPngUrl(name));
	/** Art inset so filled PNG doesn’t fill the whole TaskBox-sized square. */
	const art = $derived(Math.max(12, Math.round(size * 0.72)));
</script>

<span class="tip-icon" style:width="{size}px" style:height="{size}px">
	{#if png}
		<img class="tip-png" src={png} alt="" width={art} height={art} />
	{:else}
		<NavIcon {name} size={art} />
	{/if}
</span>

<style>
	.tip-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		line-height: 0;
	}

	.tip-png {
		display: block;
		width: auto;
		height: auto;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		opacity: 0.92;
	}
</style>
