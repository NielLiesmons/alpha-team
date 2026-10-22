<script>
	/** Bley / Zapstore pen glyph (filled diamond tip). */
	/** @type {{ size?: number, className?: string }} */
	let { size = 16, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
		<path
			d="M15.0781 0.92194C14.3127 0.156563 13.432 -0.203665 13.111 0.117347L2.06734 11.161C0.468919 12.7594 -0.304728 15.4732 0.111023 15.889C0.526774 16.3047 3.24059 15.5311 4.83901 13.9327L15.8827 2.88902C16.2037 2.56801 15.8434 1.68732 15.0781 0.92194Z"
		/>
	</svg>
</span>

<style>
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		line-height: 0;
		color: inherit;
	}

	.icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
</style>
