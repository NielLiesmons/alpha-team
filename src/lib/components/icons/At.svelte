<script>
	/**
	 * Stroked @ — mentions / assignee category mark.
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	let { size = 14, className = '', strokeWidth = 1.5 } = $props();
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
		<path
			d="M12.2 9a3.2 3.2 0 1 1-3.2-3.2A3.2 3.2 0 0 1 12.2 9Z"
			stroke="currentColor"
			stroke-width={strokeWidth}
		/>
		<path
			d="M12.2 9v1.15a1.85 1.85 0 0 0 3.55.7A6.5 6.5 0 1 1 13.9 4.2"
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
</style>
