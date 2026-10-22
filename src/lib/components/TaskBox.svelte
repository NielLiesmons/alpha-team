<script>
	/**
	 * Status box — accent-1 (closed) / accent-2 (progress).
	 * Recurring: split perimeter stroke + inward half-arrows (CTA-tint stroke).
	 * `embedded`: glyph only (no plate) for use inside meta pills.
	 */
	/** @type {{ state?: string, size?: number, embedded?: boolean }} */
	let { state = 'open', size = 24, embedded = false } = $props();

	const checkSize = $derived(Math.round(size * 0.62));
	const iconSize = $derived(Math.round(size * 0.58));
	const crossSize = $derived(Math.round(size * 0.4));
	const progressPadding = $derived(Math.round(size * 0.25));
	const ring = $derived(Math.max(10, Math.round(size * 0.72)));

	/** Stable per-instance gradient id (avoid collisions when many boxes mount). */
	const gradId = `recur-cta-${Math.random().toString(36).slice(2, 9)}`;

	/**
	 * Recurring outline in viewBox 0..100.
	 * One continuous path per half (segment + half-arrow) so joins don’t double-paint.
	 * Left: A starts high, B ends low (clear gap). Right arrow tilts up + inward.
	 */
	const recurStroke = $derived(Math.max(5.2, 100 * (1.45 / Math.max(size, 1))));
	const recurGeom = $derived.by(() => {
		const sw = recurStroke;
		const inset = sw / 2 + 0.8;
		const x0 = inset;
		const y0 = inset;
		const x1 = 100 - inset;
		const y1 = 100 - inset;
		const r = Math.min((100 - 2 * inset) / 3, (x1 - x0) / 2, (y1 - y0) / 2);
		const midY = 50;
		/* Gap larger than stroke + caps so halves never fuse */
		const gap = Math.max(sw * 3.2, 22);
		const tip = Math.max(16, Math.min(24, size * 0.85));
		const tipRise = tip * 0.78;

		/* A: left UPPER → top → right UPPER; arrow inward + UP */
		const aStartY = midY - gap / 2;
		const aEndY = midY - gap / 2;
		const pathA = [
			`M ${x0} ${aStartY}`,
			`L ${x0} ${y0 + r}`,
			`Q ${x0} ${y0} ${x0 + r} ${y0}`,
			`L ${x1 - r} ${y0}`,
			`Q ${x1} ${y0} ${x1} ${y0 + r}`,
			`L ${x1} ${aEndY}`,
			`L ${x1 - tip} ${aEndY - tipRise}`
		].join(' ');

		/* B: right LOWER → bottom → left LOWER; arrow inward (tip sits low) */
		const bStartY = midY + gap / 2;
		const bEndY = midY + gap / 2;
		const pathB = [
			`M ${x1} ${bStartY}`,
			`L ${x1} ${y1 - r}`,
			`Q ${x1} ${y1} ${x1 - r} ${y1}`,
			`L ${x0 + r} ${y1}`,
			`Q ${x0} ${y1} ${x0} ${y1 - r}`,
			`L ${x0} ${bEndY}`,
			`L ${x0 + tip} ${bEndY - tipRise * 0.35}`
		].join(' ');

		return { pathA, pathB, sw };
	});
</script>

<div
	class="task-box state-{state}"
	class:embedded
	style="width: {size}px; height: {size}px; border-radius: {size / 3}px;"
>
	{#if state === 'closed'}
		<svg
			class="check"
			width={checkSize}
			height={checkSize * (12 / 18)}
			viewBox="-1 -1 20 14"
			fill="none"
			stroke={embedded ? 'var(--accent-1)' : 'var(--whiteEnforced)'}
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M6.2 11.2 0.7 5.7 6.2 10.95 16.7 0.7 6.2 11.2Z" />
		</svg>
	{:else if state === 'inProgress'}
		<div class="icon-slot" style:padding-left={embedded ? '0' : `${progressPadding}px`}>
			<svg width={iconSize} height={iconSize} viewBox="0 0 11 22" aria-hidden="true">
				<path
					fill="var(--accent-2)"
					d="M1.56676 21.7923C6.89979 21.0318 11 16.4462 11 10.903C11 5.35977 6.89979 0.774213 1.56676 0.0137178C0.70758 -0.108803 0 0.60654 0 1.47442V20.3316C0 21.1994 0.707579 21.9148 1.56676 21.7923Z"
				/>
			</svg>
		</div>
	{:else if state === 'inReview'}
		<div class="icon-slot">
			<svg width={iconSize} height={iconSize} viewBox="0 0 20 20" aria-hidden="true">
				<path
					fill="var(--accent-1)"
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
			<path
				d="M12.7001 0.699299L6.70025 6.69916M6.70025 6.69916L0.700195 12.6992M6.70025 6.69916L12.7002 12.6991M6.70025 6.69916L0.700308 0.699219"
			/>
		</svg>
	{:else if state === 'recurring'}
		<svg
			class="recur-stroke"
			viewBox="0 0 100 100"
			width={size}
			height={size}
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<!-- Match CTA --button-primary-bg (accent-1 tinted glass) -->
				<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
					<stop offset="0%" stop-color="color-mix(in srgb, var(--accent-1) 42%, var(--fg-33))" />
					<stop offset="100%" stop-color="color-mix(in srgb, var(--accent-1) 22%, var(--fg-33))" />
				</linearGradient>
			</defs>
			<path
				d={recurGeom.pathA}
				stroke="url(#{gradId})"
				stroke-width={recurGeom.sw}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d={recurGeom.pathB}
				stroke="url(#{gradId})"
				stroke-width={recurGeom.sw}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	{:else if embedded}
		<span
			class="bare-ring"
			class:dashed={state === 'backlog'}
			style:width="{ring}px"
			style:height="{ring}px"
			style:border-radius="{Math.round(ring / 3)}px"
		></span>
	{/if}
</div>

<style>
	.task-box {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-sizing: border-box;
		overflow: visible;
		position: relative;
	}

	.check {
		overflow: visible;
		flex-shrink: 0;
	}

	.check :global(path) {
		vector-effect: non-scaling-stroke;
		stroke-width: var(--task-check-stroke);
	}

	.icon-slot {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.recur-stroke {
		display: block;
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	.state-backlog {
		background: transparent;
		border: var(--task-box-stroke) dashed var(--white33);
	}

	.state-open {
		background: var(--box-plate);
		border: var(--task-box-stroke) solid var(--white33);
	}

	.state-closed {
		background: var(--gradient-accent-1);
		border: var(--task-box-stroke) solid transparent;
	}

	.state-inProgress {
		background: var(--box-plate);
		border: var(--task-box-stroke) solid var(--accent-2-66);
	}

	.state-inReview {
		background: var(--box-plate);
		border: var(--task-box-stroke) solid var(--accent-1-66);
	}

	.state-canceled {
		background: var(--white8);
		border: var(--task-box-stroke) solid transparent;
	}

	.state-recurring {
		background: var(--box-plate);
		border: none;
	}

	.task-box.embedded {
		background: transparent !important;
		border: none !important;
	}

	.bare-ring {
		display: block;
		box-sizing: border-box;
		border: var(--task-box-stroke) solid var(--fg-33);
		flex-shrink: 0;
	}

	.bare-ring.dashed {
		border-style: dashed;
	}
</style>
