<script>
	/**
	 * Rounded diamond progress marker (Chateau-inspired, Alpha tokens).
	 * 0 → empty track; 1–99 → arc; 100 → filled.
	 */
	/** @type {{ percentage?: number, size?: number, onclick?: ((e: MouseEvent) => void) | null }} */
	let { percentage = 0, size = 24, onclick = null } = $props();

	const PERIMETER = 59.2;
	const PATH =
		'M 13.4,2.4 L 21.6,10.6 Q 23,12 21.6,13.4 L 13.4,21.6 Q 12,23 10.6,21.6 L 2.4,13.4 Q 1,12 2.4,10.6 L 10.6,2.4 Q 12,1 13.4,2.4 Z';

	const pct = $derived(Math.max(0, Math.min(100, percentage)));
	const isDone = $derived(pct >= 100);
	const hasArc = $derived(pct > 0 && pct < 100);
	const dashOff = $derived(PERIMETER * (1 - pct / 100));
	const sw = $derived((1.5 * 24) / size);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	class="milestone-box"
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	aria-label={onclick ? 'Milestone progress' : undefined}
	{onclick}
	onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(/** @type {any} */ (e)) : undefined}
>
	<path
		d={PATH}
		fill={isDone ? 'var(--accent-success)' : 'var(--fg-8)'}
		stroke="none"
	/>

	{#if !isDone}
		<path
			d={PATH}
			fill="none"
			stroke={hasArc ? 'var(--fg-11)' : 'var(--fg-16)'}
			stroke-width={sw}
			stroke-linejoin="miter"
		/>
	{/if}

	{#if hasArc}
		<path
			d={PATH}
			fill="none"
			stroke="var(--accent-success)"
			stroke-width={sw}
			stroke-linejoin="miter"
			stroke-dasharray="{PERIMETER} 9999"
			stroke-dashoffset={dashOff}
		/>
	{/if}
</svg>

<style>
	.milestone-box {
		flex-shrink: 0;
		display: block;
		cursor: default;
	}

	.milestone-box[role='button'] {
		cursor: pointer;
	}
</style>
