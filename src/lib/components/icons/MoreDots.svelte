<script>
	/**
	 * Horizontal ⋯ overflow glyph — shared across chrome, mail panels, settings.
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 16, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<circle cx="3.2" cy="8" r="1.35" fill="currentColor" />
		<circle cx="8" cy="8" r="1.35" fill="currentColor" />
		<circle cx="12.8" cy="8" r="1.35" fill="currentColor" />
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
	}
</style>
