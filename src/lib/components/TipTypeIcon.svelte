<script>
	/**
	 * Content-type glyph for tip rows.
	 * Outer square matches TaskBox; PNG/SVG fill the available square.
	 */
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';

	/** @type {{ name?: string, size?: number }} */
	let { name = 'chat', size = 22 } = $props();

	const png = $derived(navPngUrl(name));
</script>

<span class="tip-icon" style:width="{size}px" style:height="{size}px">
	{#if png}
		<img class="tip-png" src={png} alt="" width={size} height={size} />
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
		flex-shrink: 0;
		line-height: 0;
		box-sizing: border-box;
		overflow: hidden;
	}

	.tip-png {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.tip-svg {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		line-height: 0;
	}
</style>
