<script>
	/**
	 * Content-type glyph for tip rows.
	 * Outer slot is a fixed square; PNG/SVG fill it via contain — never overflow either axis.
	 */
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';

	/** @type {{ name?: string, size?: number }} */
	let { name = 'chat', size = 22 } = $props();

	const png = $derived(navPngUrl(name));
</script>

<span
	class="tip-icon"
	style:--tip-size="{size}px"
	style:width="{size}px"
	style:height="{size}px"
>
	{#if png}
		<img class="tip-png" src={png} alt="" />
	{:else}
		<span class="tip-svg">
			<NavIcon {name} {size} />
		</span>
	{/if}
</span>

<style>
	.tip-icon {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		box-sizing: border-box;
		overflow: hidden;
		line-height: 0;
		aspect-ratio: 1 / 1;
		width: var(--tip-size);
		height: var(--tip-size);
		max-width: var(--tip-size);
		max-height: var(--tip-size);
		min-width: 0;
		min-height: 0;
	}

	.tip-png {
		display: block;
		box-sizing: border-box;
		/* ~90% of locked square so PNGs read closer to TaskBox weight */
		width: 90%;
		height: 90%;
		max-width: 90%;
		max-height: 90%;
		object-fit: contain;
		object-position: center;
	}

	.tip-svg {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		overflow: hidden;
		line-height: 0;
	}

	.tip-svg :global(svg),
	.tip-svg :global(.icon) {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
	}
</style>
