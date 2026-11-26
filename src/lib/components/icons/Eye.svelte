<script>
	/**
	 * Open eye — show password (currentColor fill).
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 18, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{(size / 16)}rem" style:height="{(size / 16)}rem">
	<svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
		<path
			fill-rule="evenodd"
			clip-rule="evenodd"
			d="M12 5C7.2 5 3.2 8.1 1.5 12.2c-.1.3-.1.6 0 .8C3.2 17.1 7.2 20.2 12 20.2s8.8-3.1 10.5-7.2c.1-.3.1-.6 0-.8C20.8 8.1 16.8 5 12 5Zm0 12.7c-3.6 0-6.7-2.3-8.1-5.5C5.3 8.9 8.4 6.5 12 6.5s6.7 2.4 8.1 5.7c-1.4 3.2-4.5 5.5-8.1 5.5Zm0-9.2a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Zm0 5.9a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Z"
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
