<script>
	/**
	 * Website — alpha-ui/icons/website.svg verbatim (author paths only).
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	let { size = 14, className = '', strokeWidth = undefined } = $props();
	const sw = $derived(strokeWidth ?? 'var(--icon-stroke, 1.5)');
</script>

<span class="icon {className}" style:width="{(size / 16)}rem" style:height="{(size / 16)}rem" style:--_sw={sw}>
	<svg viewBox="0 0 14 14" width={size} height={size} fill="none" aria-hidden="true">
		<path
			d="M7 13.5C10.5899 13.5 13.5 10.5899 13.5 7C13.5 3.41015 10.5899 0.5 7 0.5C3.41015 0.5 0.5 3.41015 0.5 7C0.5 10.5899 3.41015 13.5 7 13.5Z"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path
			d="M0.5 7H13.5"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path
			d="M9.5 7C9.3772 9.37699 8.50168 11.6533 7 13.5C5.49832 11.6533 4.6228 9.37699 4.5 7C4.6228 4.62301 5.49832 2.34665 7 0.5C8.50168 2.34665 9.3772 4.62301 9.5 7Z"
			stroke="currentColor"
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
		stroke-width: var(--_sw);
	}
</style>
