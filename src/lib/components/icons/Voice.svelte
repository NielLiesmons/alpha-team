<script>
	/**
	 * Voice waveform — alpha-chat ic_polli_voice.xml paths (fill only; no reshape).
	 * @type {{ size?: number, className?: string }}
	 */
	let { size = 20, className = '' } = $props();
</script>

<span class="icon {className}" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 26 20" width={size} height={size} fill="none" aria-hidden="true">
		<path
			fill="currentColor"
			d="M0,10C0,9.08 0.746,8.333 1.667,8.333C2.587,8.333 3.333,9.08 3.333,10C3.333,10.921 2.587,11.667 1.667,11.667C0.746,11.667 0,10.921 0,10Z"
		/>
		<path
			fill="currentColor"
			d="M5.667,5C5.667,4.08 6.414,3.333 7.334,3.333C8.254,3.333 9.001,4.08 9.001,5V15C9.001,15.921 8.254,16.667 7.334,16.667C6.414,16.667 5.667,15.921 5.667,15V5Z"
		/>
		<path
			fill="currentColor"
			d="M11.333,1.667C11.333,0.746 12.079,0 13,0C13.92,0 14.666,0.746 14.666,1.667V18.333C14.666,19.254 13.92,20 13,20C12.079,20 11.333,19.254 11.333,18.333V1.667Z"
		/>
		<path
			fill="currentColor"
			d="M17,6.667C17,5.746 17.746,5 18.667,5C19.587,5 20.334,5.746 20.334,6.667V13.333C20.334,14.254 19.587,15 18.667,15C17.746,15 17,14.254 17,13.333V6.667Z"
		/>
		<path
			fill="currentColor"
			d="M22.666,10C22.666,9.08 23.412,8.333 24.333,8.333C25.253,8.333 25.999,9.08 25.999,10C25.999,10.921 25.253,11.667 24.333,11.667C23.412,11.667 22.666,10.921 22.666,10Z"
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
