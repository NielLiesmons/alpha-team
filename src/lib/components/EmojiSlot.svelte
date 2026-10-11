<script>
	/** @type {{ src?: string | null, size?: number }} */
	let { src = null, size = 32 } = $props();
</script>

<span class="emoji-slot" class:empty={!src} style:width="{size}px" style:height="{size}px">
	{#if src}
		<img src={src} alt="" width={size} height={size} />
	{/if}
</span>

<style>
	.emoji-slot {
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.emoji-slot.empty {
		border-radius: 8px;
		background: var(--white8);
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
</style>
