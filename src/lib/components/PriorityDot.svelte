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
		border-color: var(--accent-progress);
		background: color-mix(in srgb, var(--accent-progress) 35%, transparent);
	}

	.high,
	.urgent {
		border-color: var(--accent-progress);
		background: var(--accent-progress);
	}
</style>
