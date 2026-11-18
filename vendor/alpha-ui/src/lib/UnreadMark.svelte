<script>
	/**
	 * Accent unread mark — for notifications targeted at the signed-in user.
	 * Dot alone, or dot + count. Plain inventory counts should stay muted text.
	 * @type {{ count?: number, size?: number, className?: string }}
	 */
	let { count = 0, size = 7, className = '' } = $props();

	const n = $derived(Math.max(0, Math.floor(Number(count) || 0)));
	const label = $derived(n > 9 ? '9+' : String(n));
</script>

{#if n > 0}
	<span class="unread-mark {className}" title={String(n)}>
		<span class="dot" style:--dot="{size}px" aria-hidden="true"></span>
		<span class="n">{label}</span>
	</span>
{/if}

<style>
	.unread-mark {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		line-height: 1;
		flex-shrink: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
	}

	.dot {
		width: var(--dot, 7px);
		height: var(--dot, 7px);
		border-radius: 999px;
		background: var(--accent-1, #5a58fe);
		flex-shrink: 0;
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--bg, #000) 35%, transparent);
	}

	.n {
		font-size: 12px;
		font-weight: 650;
		color: var(--accent-1, #5a58fe);
		letter-spacing: 0;
	}
</style>
