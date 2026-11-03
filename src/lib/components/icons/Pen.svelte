<script>
	/**
	 * Filled pen from alpha-ui/icons/pen-fill.svg (currentColor).
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 13, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 13 13" width={size} height={size} fill="none" aria-hidden="true">
		<path
			d="M12.0781 0.92194C11.3127 0.156563 10.432 -0.203665 10.111 0.117347L2.06734 7.78599C0.468919 9.38441 -0.304728 12.0982 0.111023 12.514C0.526774 12.9297 3.24059 12.1561 4.83901 10.5577L12.8827 2.88902C13.2037 2.56801 12.8434 1.68732 12.0781 0.92194Z"
			fill="currentColor"
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
