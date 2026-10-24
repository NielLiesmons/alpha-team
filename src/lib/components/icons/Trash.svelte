<script>
	/**
	 * Trash — stroke glyph matching chrome plus/filter (16×16, stroke 1.5).
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 16, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden="true">
		<path
			d="M5.25 2.5h5.5M2.75 4.25h10.5M4.25 4.25l.55 8.1A1.25 1.25 0 0 0 6.04 13.5h3.92a1.25 1.25 0 0 0 1.24-1.15l.55-8.1M6.75 6.75v4.25M9.25 6.75v4.25"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
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
