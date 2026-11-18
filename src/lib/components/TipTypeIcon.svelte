<script>
	/**
	 * Content-type glyph for tip rows.
	 * Outer square matches TaskBox; PNG is slightly inset inside it.
	 */
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';

	/** @type {{ name?: string, size?: number }} */
	let { name = 'chat', size = 22 } = $props();

	const png = $derived(navPngUrl(name));
	const imgSize = $derived(Math.max(10, Math.round(size * 0.72)));
</script>

<span class="tip-icon" style:width="{size}px" style:height="{size}px">
	{#if png}
		<img class="tip-png" src={png} alt="" width={imgSize} height={imgSize} />
	{:else}
		<span class="tip-svg">
			<NavIcon {name} size={imgSize} />
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
		width: 72%;
		height: 72%;
		object-fit: contain;
		opacity: 0.92;
	}

	.tip-svg {
		display: grid;
		place-items: center;
		line-height: 0;
	}
</style>
