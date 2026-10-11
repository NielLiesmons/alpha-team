<script>
	/** @type {{ priority?: string, size?: number }} */
	let { priority = 'none', size = 18 } = $props();
</script>

{#if priority !== 'none'}
	<span class="dot {priority}" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span>
{/if}

<style>
	.dot {
		display: block;
		border-radius: 999px;
		flex-shrink: 0;
		box-sizing: border-box;
		border: 2px solid var(--white33);
	}

	.low {
		border-color: var(--white33);
	}

	.medium {
		border-color: var(--goldColor, #ffb338);
		background: color-mix(in srgb, var(--goldColor, #ffb338) 35%, transparent);
	}

	.high,
	.urgent {
		border-color: var(--rougeColor, #ff4778);
		background: var(--rougeColor, #ff4778);
	}
</style>
