<script>
	/**
	 * ArrowDown — Alpha Chat `ic_polli_arrow_down` path (viewport 11×14).
	 * Do not reshape the `d` geometry; stroke via currentColor only.
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	let { size = 18, className = '', strokeWidth = 1.6 } = $props();
</script>

<span class="icon {className}" style:width="{(size / 16)}rem" style:height="{(size / 16)}rem">
	<svg
		width={size}
		height={size}
		viewBox="0 0 11 14"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<path
			d="M5.2,0.7V12.7M5.2,12.7L9.7,8.2M5.2,12.7L0.7,8.2"
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

	.icon :global(path) {
		vector-effect: non-scaling-stroke;
	}
</style>
