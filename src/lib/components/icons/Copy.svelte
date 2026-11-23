<script>
	/**
	 * Copy — outline via currentColor.
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	let { size = 16, className = '', strokeWidth = 1.5 } = $props();
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
		<rect
			x="5.25"
			y="5.25"
			width="8.5"
			height="8.5"
			rx="1.5"
			stroke="currentColor"
			stroke-width={strokeWidth}
		/>
		<path
			d="M10.75 5.25V3.75A1.5 1.5 0 0 0 9.25 2.25H3.75A1.5 1.5 0 0 0 2.25 3.75v5.5A1.5 1.5 0 0 0 3.75 10.75H5.25"
			stroke="currentColor"
			stroke-width={strokeWidth}
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
</style>
