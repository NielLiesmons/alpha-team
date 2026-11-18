<script>
	/**
	 * Adjust / tune — three stroked rails with knobs (push prefs, filters).
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	let { size = 16, className = '', strokeWidth = 1.5 } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg
		width={size}
		height={size}
		viewBox="0 0 18 18"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<path d="M3 4.5h12" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" />
		<path d="M3 9h12" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" />
		<path d="M3 13.5h12" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" />
		<circle cx="6.5" cy="4.5" r="1.6" fill="var(--bg, #111)" stroke="currentColor" stroke-width={strokeWidth} />
		<circle cx="11.5" cy="9" r="1.6" fill="var(--bg, #111)" stroke="currentColor" stroke-width={strokeWidth} />
		<circle cx="7.5" cy="13.5" r="1.6" fill="var(--bg, #111)" stroke="currentColor" stroke-width={strokeWidth} />
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
