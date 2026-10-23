<script>
	/**
	 * Trash — stroke glyph from alpha-ui/icons/trash.svg.
	 * Uses BaseIcon so stroke weight matches chrome plus/filter via --icon-stroke.
	 * @type {{ size?: number, className?: string }}
	 */
	import BaseIcon from './BaseIcon.svelte';

	let { size = 16, className = '' } = $props();
</script>

<BaseIcon {size} {className}>
	<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
		<path
			d="M5.25 2.5h5.5M2.75 4.25h10.5M4.25 4.25l.55 8.1A1.25 1.25 0 0 0 6.04 13.5h3.92a1.25 1.25 0 0 0 1.24-1.15l.55-8.1M6.75 6.75v4.25M9.25 6.75v4.25"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
</BaseIcon>
