<script>
	/**
	 * Junk / spam — circle with slash.
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	let { size = 14, className = '', strokeWidth = 1.45 } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width={strokeWidth} />
		<path
			d="M7.2 16.8 16.8 7.2"
			stroke="currentColor"
			stroke-width={strokeWidth}
			stroke-linecap="round"
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

	.icon :global(path),
	.icon :global(circle) {
		vector-effect: non-scaling-stroke;
	}
</style>
