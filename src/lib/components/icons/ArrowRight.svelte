<script>
	/**
	 * ArrowRight — ArrowDown geometry rotated (same stroke family).
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	import ArrowDown from './ArrowDown.svelte';

	let { size = 14, className = '', strokeWidth = 1.5 } = $props();
</script>

<span class="right {className}">
	<ArrowDown {size} {strokeWidth} />
</span>

<style>
	.right {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		line-height: 0;
		transform: rotate(-90deg);
	}
</style>
