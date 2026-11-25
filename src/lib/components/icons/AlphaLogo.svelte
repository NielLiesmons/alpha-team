<script>
	/**
	 * Alpha mark — alpha-ui/icons/alpha-logo.svg path (fill only; no reshape).
	 * Used as the chat send glyph (reads like a send mark).
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 16, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{(size / 16)}rem" style:height="{(size / 16)}rem">
	<svg viewBox="0 0 272 297" width={size} height={size} fill="none" aria-hidden="true">
		<path
			fill="currentColor"
			d="M136 0C159.663 0 180.072 13.9306 189.475 34.0381L189.5 34L265.606 211.262C269.694 219.288 272 228.375 272 238C272 270.585 245.585 297 213 297C180.415 297 154 270.585 154 238C154 222.327 160.112 208.082 170.081 197.517L170 197.5L169.983 197.465C178.046 189.027 183 177.592 183 165C183 139.043 161.957 118 136 118C110.043 118 89 139.043 89 165C89 177.592 93.9528 189.027 102.016 197.465L102 197.5L101.918 197.517C111.888 208.082 118 222.327 118 238C118 270.585 91.5848 297 59 297C26.4152 297 0 270.585 0 238C0 228.375 2.30484 219.288 6.39258 211.262L82.5 34L82.5244 34.0381C91.9266 13.9304 112.337 0 136 0Z"
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
