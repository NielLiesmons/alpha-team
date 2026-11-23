<script>
	/** Dismiss / close X. @type {{ size?: number, className?: string }} */
	let { size = 18, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 18 18" width={size} height={size} fill="none" aria-hidden="true">
		<path
			d="M4.5 4.5 13.5 13.5M13.5 4.5 4.5 13.5"
			stroke="currentColor"
			stroke-width="1.7"
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
	}
</style>
