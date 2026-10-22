<script>
	/** Filled trash can (Admin delete mark — no trash.svg in shared set yet). */
	/** @type {{ size?: number, className?: string }} */
	let { size = 16, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
		<path
			d="M6.1 1.35A1.35 1.35 0 0 1 7.45 0h1.1A1.35 1.35 0 0 1 9.9 1.35V2h3.35c.41 0 .75.34.75.75S13.66 3.5 13.25 3.5H2.75A.75.75 0 0 1 2 2.75 0.75.75 0 0 1 2.75 2H6.1V1.35ZM3.4 4.75h9.2l-.55 8.35A1.85 1.85 0 0 1 10.21 14.8H5.79a1.85 1.85 0 0 1-1.84-1.7L3.4 4.75Zm2.35 1.7a.65.65 0 0 0-1.3.08l.35 5.1a.65.65 0 1 0 1.3-.09l-.35-5.09Zm3.15-.08a.65.65 0 0 0-1.3 0v5.2a.65.65 0 0 0 1.3 0V6.37Zm2.2.08a.65.65 0 0 0-1.3-.08l-.35 5.09a.65.65 0 1 0 1.3.09l.35-5.1Z"
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
