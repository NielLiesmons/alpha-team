<script>
	/**
	 * Accent unread dot for popover / filter rows (same mark as UnreadMark / mail rows).
	 * Centers a fixed ~7px glyph inside the `.alpha-popover-ico` square (`size` = slot).
	 * @type {{ size?: number, className?: string, quiet?: boolean }}
	 */
	let { size = 16, className = '', quiet = false } = $props();
</script>

<span
	class="unread-dot-slot {className}"
	class:quiet
	style:width="{size}px"
	style:height="{size}px"
	aria-hidden="true"
>
	<span class="dot"></span>
</span>

<style>
	.unread-dot-slot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		line-height: 0;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(
			--gradient-accent-1,
			radial-gradient(circle at top left, #5c5fff 0%, #4542ff 100%)
		);
		flex-shrink: 0;
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--bg, #000) 35%, transparent);
	}

	.unread-dot-slot.quiet .dot {
		background: var(--fg-33);
		box-shadow: none;
		opacity: 0.85;
	}
</style>
