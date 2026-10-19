<script>
	/** Priority indicator from the Chateau task row. Bars by default. */
	let { priority = 'none', size = 22, variant = 'bars' } = $props();

	const ACTIVE_COUNTS = { none: 0, low: 1, medium: 2, high: 3 };
	const activeCount = $derived(ACTIVE_COUNTS[priority] ?? 0);
	const isUrgent = $derived(priority === 'urgent');
	const isNone = $derived(priority === 'none');
	const unitH = $derived(Math.max(2, Math.round(size * 0.165)));
	const gap = $derived(Math.max(1, Math.round(unitH * 0.55)));
	const barRadius = $derived(Math.ceil(unitH / 2));
	const DIM = 'var(--white16)';
	const ACTIVE = 'var(--white66)';
	const elColors = $derived([
		activeCount >= 1 ? ACTIVE : DIM,
		activeCount >= 2 ? ACTIVE : DIM,
		activeCount >= 3 ? ACTIVE : DIM
	]);
</script>

<div class="priority-box" style="width: {size}px; height: {size}px; border-radius: {Math.round(size / 3)}px;">
	{#if isUrgent}
		{@const s = size / 22}
		<div
			class="urgent-triangle"
			style="
				width: {size}px;
				height: {size}px;
				clip-path: path('M {8.7 * s} {8.1 * s} L {5.3 * s} {13.9 * s} Q {3 * s} {17.9 * s} {7.6 * s} {17.9 * s} L {14.4 * s} {17.9 * s} Q {19 * s} {17.9 * s} {16.7 * s} {13.9 * s} L {13.3 * s} {8.1 * s} Q {11 * s} {4.1 * s} {8.7 * s} {8.1 * s} Z');
			"
		></div>
	{:else if isNone}
		<div class="inner-row" style:gap="{gap}px">
			{#each [0, 1, 2] as i (i)}
				<div class="dot" style="width: {unitH}px; height: {unitH}px; background: {DIM};"></div>
			{/each}
		</div>
	{:else if variant === 'dots'}
		<div class="inner-row" style:gap="{gap}px">
			{#each [0, 1, 2] as i (i)}
				<div class="dot" style="width: {unitH}px; height: {unitH}px; background: {elColors[i]};"></div>
			{/each}
		</div>
	{:else}
		<div class="inner-row bars-row" style:gap="{gap}px">
			{#each [0, 1, 2] as i (i)}
				<div
					class="bar"
					style="width: {unitH}px; height: {unitH * (i + 1)}px; border-radius: {barRadius}px; background: {elColors[i]};"
				></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.priority-box {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: transparent;
		border: none;
	}

	.inner-row {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bars-row {
		align-items: flex-end;
	}

	.urgent-triangle {
		background: var(--goldColor);
		flex-shrink: 0;
	}

	.dot {
		border-radius: 50%;
		flex-shrink: 0;
	}

	.bar {
		flex-shrink: 0;
	}
</style>
