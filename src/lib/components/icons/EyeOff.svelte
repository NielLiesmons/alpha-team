<script>
	/**
	 * Crossed eye — hide password (currentColor fill).
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 18, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{(size / 16)}rem" style:height="{(size / 16)}rem">
	<svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
		<path
			fill-rule="evenodd"
			clip-rule="evenodd"
			d="M3.3 2.2a.75.75 0 0 0-1.1 1.02l2.2 2.37C2.5 7.4 1.4 9.5 1.5 12c.1.3.1.6 0 .8C3.2 17.1 7.2 20.2 12 20.2c2.1 0 4.1-.6 5.8-1.7l2.9 3.1a.75.75 0 1 0 1.1-1.02L3.3 2.2Zm11.7 14.5c-1 .5-2 .7-3 .7-3.6 0-6.7-2.3-8.1-5.5.6-1.4 1.6-2.6 2.9-3.5l1.7 1.8a3.7 3.7 0 0 0 4.5 4.7l1.99 2.1Zm1.4-1.5 1.5 1.6c1.3-.9 2.4-2.2 3.1-3.7-1.4-3.3-4.5-5.7-8.1-5.7-.7 0-1.4.1-2 .3l1.5 1.6a3.7 3.7 0 0 1 4 3.9Z"
			fill="currentColor"
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
