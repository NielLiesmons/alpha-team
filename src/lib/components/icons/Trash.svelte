<script>
	/**
	 * Trash — stroke glyph from alpha-ui/icons/trash.svg (19×20).
	 * Stroke weight matches chrome plus/filter (1.5, non-scaling). Default size = pen.
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 13, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 19 20" width={size} height={size} fill="none" aria-hidden="true">
		<path d="M0.5 4.5L18.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
		<path
			d="M2.5 4.5H16.5L14.9444 18C14.9444 18.3978 14.7805 18.7794 14.4888 19.0606C14.1972 19.3419 13.8014 19.5 13.3889 19.5H5.61111C5.19855 19.5 4.80289 19.3419 4.51116 19.0606C4.21945 18.7794 4.05556 18.3978 4.05556 18L2.5 4.5Z"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path d="M7 8L7.5 16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
		<path d="M12 8L11.5 16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
		<path
			d="M6.5 4.5V2.5C6.5 1.39543 7.39543 0.5 8.5 0.5H10.5C11.6046 0.5 12.5 1.39543 12.5 2.5V4.5"
			stroke="currentColor"
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

	.icon :global(path) {
		vector-effect: non-scaling-stroke;
		stroke-width: 1.5;
	}
</style>
