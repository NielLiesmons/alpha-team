<script>
	/**
	 * Forward — mirrored Reply glyph (same Zapstore path).
	 * @type {{ size?: number, className?: string, strokeWidth?: number | string }}
	 */
	import Reply from './Reply.svelte';

	let { size = 14, className = '', strokeWidth = 1.4 } = $props();
</script>

<span class="fwd {className}">
	<Reply {size} {strokeWidth} />
</span>

<style>
	.fwd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		line-height: 0;
		transform: scaleX(-1);
	}
</style>
