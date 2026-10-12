<script>
	/**
	 * Status box — uses --accent-success / --accent-progress (warm accents swap roles).
	 * backlog, open, inProgress, inReview, closed, canceled.
	 */
	let { state = 'open', size = 24 } = $props();

	const checkStroke = $derived(size >= 20 ? 2.8 : 1.4);
	const iconSize = $derived(Math.round(size * 0.58));
	const crossSize = $derived(Math.round(size * 0.4));
	const progressPadding = $derived(Math.round(size * 0.25));
</script>

<div
	class="task-box state-{state}"
	style="width: {size}px; height: {size}px; border-radius: {size / 3}px;"
>
	{#if state === 'closed'}
		<svg
			width={size * 0.5}
			height={size * 0.5}
			viewBox="0 0 18 12"
			fill="none"
			stroke="var(--black)"
			stroke-width={checkStroke}
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M6.2002 11.1992L0.700195 5.69922L6.2002 10.9492L16.7002 0.699219L6.2002 11.1992Z" />
		</svg>
	{:else if state === 'inProgress'}
		<div class="icon-slot" style:padding-left="{progressPadding}px">
			<svg width={iconSize} height={iconSize} viewBox="0 0 11 22" aria-hidden="true">
				<path
					fill="var(--accent-progress)"
					d="M1.56676 21.7923C6.89979 21.0318 11 16.4462 11 10.903C11 5.35977 6.89979 0.774213 1.56676 0.0137178C0.70758 -0.108803 0 0.60654 0 1.47442V20.3316C0 21.1994 0.707579 21.9148 1.56676 21.7923Z"
				/>
			</svg>
		</div>
	{:else if state === 'inReview'}
		<div class="icon-slot">
			<svg width={iconSize} height={iconSize} viewBox="0 0 20 20" aria-hidden="true">
				<path
					fill="var(--accent-success)"
					d="M9.95571 20C15.503 20 20 15.503 20 9.95571C20 4.8941 16.256 0.706948 11.3863 0.012526C10.6018 -0.0993499 9.95571 0.553842 9.95571 1.34631V8.52081C9.95571 9.31328 9.31328 9.95571 8.52081 9.95571H1.34632C0.553842 9.95571 -0.0993498 10.6018 0.012526 11.3863C0.706948 16.256 4.8941 20 9.95571 20Z"
				/>
			</svg>
		</div>
	{:else if state === 'canceled'}
		<svg
			width={crossSize}
			height={crossSize}
			viewBox="-0.5 -0.5 15 15"
			fill="none"
			stroke="var(--white33)"
			stroke-width="3.3"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12.7001 0.699299L6.70025 6.69916M6.70025 6.69916L0.700195 12.6992M6.70025 6.69916L12.7002 12.6991M6.70025 6.69916L0.700308 0.699219" />
		</svg>
	{/if}
</div>

<style>
	.task-box {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.icon-slot {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.state-backlog {
		background: transparent;
		border: 1.4px dashed var(--white33);
	}

	.state-open {
		background: var(--black33);
		border: 1.4px solid var(--white33);
	}

	.state-closed {
		background: var(--accent-success);
		border: none;
	}

	.state-inProgress {
		background: var(--black33);
		border: 1.4px solid var(--accent-progress-66);
	}

	.state-inReview {
		background: var(--black33);
		border: 1.4px solid var(--accent-success-66);
	}

	.state-canceled {
		background: var(--white8);
		border: none;
	}
</style>
