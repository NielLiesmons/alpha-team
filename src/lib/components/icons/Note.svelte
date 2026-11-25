<script>
	/**
	 * Note — alpha-ui/icons/note.svg verbatim (author paths only).
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	let { size = 17, className = '', strokeWidth = undefined } = $props();
	const sw = $derived(strokeWidth ?? 'var(--icon-stroke, 1.5)');
</script>

<span class="icon {className}" style:width="{(size / 16)}rem" style:height="{(size / 16)}rem" style:--_sw={sw}>
	<svg viewBox="0 0 17 17" width={size} height={size} fill="none" aria-hidden="true">
		<path
			d="M4.5 0.5H12.5C14.7091 0.5 16.5 2.29086 16.5 4.5V9.5C16.5 10.7318 14.9075 12.0746 13.5 13.5C12.051 14.9674 10.7682 16.5 9.5 16.5H4.5C2.29086 16.5 0.5 14.7091 0.5 12.5V4.5C0.5 2.29086 2.29086 0.5 4.5 0.5Z"
			stroke="currentColor"
		/>
		<path
			d="M16.5 8.5C16.5 11 12.5 8.5 10.5 10.5C8.5 12.5 11 16.5 8.5 16.5"
			stroke="currentColor"
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

	.icon :global(path) {
		vector-effect: non-scaling-stroke;
		stroke-width: var(--_sw);
	}
</style>
