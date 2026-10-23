<script>
	/** iOS-style outline trash (lid + can). */
	/** @type {{ size?: number, className?: string }} */
	let { size = 16, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg
		viewBox="0 0 16 16"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		stroke-width="1.35"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<!-- lid handle -->
		<path d="M6.25 2.25h3.5" />
		<!-- lid -->
		<path d="M2.75 4.25h10.5" />
		<!-- can body -->
		<path d="M4.1 4.25l.7 9.1A1.35 1.35 0 0 0 6.14 14.5h3.72a1.35 1.35 0 0 0 1.34-1.15l.7-9.1" />
		<!-- inner lines -->
		<path d="M6.5 6.75v5.25M9.5 6.75v5.25" />
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
