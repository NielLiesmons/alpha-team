<script>
	/**
	 * Content-type glyph for tip rows.
	 * Outer square matches TaskBox; PNG art is clearly smaller inside.
	 */
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';

	/** @type {{ name?: string, size?: number }} */
	let { name = 'chat', size = 22 } = $props();

	const png = $derived(navPngUrl(name));
	/** Fixed small glyph inside TaskBox-sized square (22 → 12). */
	const art = 12;
</script>

<span class="tip-icon" style:width="{size}px" style:height="{size}px">
	{#if png}
		<img class="tip-png" src={png} alt="" width="12" height="12" />
	{:else}
		<span class="tip-svg">
			<NavIcon {name} size={art} />
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
	}

	.tip-png {
		display: block;
		width: 12px !important;
		height: 12px !important;
		max-width: 12px !important;
		max-height: 12px !important;
		object-fit: contain;
		opacity: 0.92;
	}

	.tip-svg {
		display: grid;
		place-items: center;
		line-height: 0;
	}
</style>
