<script module>
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	/** @param {string | undefined} iso */
	function labelForIso(iso) {
		if (!iso) return '';
		const d = new Date(`${iso}T12:00:00Z`);
		if (Number.isNaN(d.getTime())) return iso;
		return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
	}
</script>

<script>
	/**
	 * Zapstore DownloadChart subset — Alpha tokens (no blurple/gold).
	 * Dual series: pageviews (primary) + optional uniques (faint).
	 */
	let {
		/** @type {{ date: string, pageviews: number, uniques?: number }[]} */
		series = [],
		loading = false,
		plotFloorY = 140,
		padTop = 28,
		padBottom = 12,
		chartId = 'svc'
	} = $props();

	const DAYS = $derived(Math.max(1, series.length || 7));
	const xDenom = $derived(Math.max(1, DAYS - 1));
	const pageviews = $derived(
		series.length
			? series.map((p) => Number(p.pageviews) || 0)
			: Array(DAYS).fill(0)
	);
	const uniques = $derived(
		series.length
			? series.map((p) => Number(p.uniques) || 0)
			: Array(DAYS).fill(0)
	);
	const labels = $derived(
		series.length
			? series.map((p) => labelForIso(p.date))
			: Array.from({ length: DAYS }, (_, i) => String(i + 1))
	);
	const globalMax = $derived(Math.max(1, ...pageviews, ...uniques));
	const SVG_H = $derived(plotFloorY + padBottom);

	let containerEl = $state(/** @type {HTMLDivElement | null} */ (null));
	let W = $state(400);
	/** @type {number | null} */
	let hoverIndex = $state(null);

	$effect(() => {
		if (loading) hoverIndex = null;
	});

	$effect(() => {
		if (!containerEl) return;
		W = containerEl.clientWidth || 400;
		const ro = new ResizeObserver(([e]) => {
			W = e.contentRect.width;
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	const RIGHT_ZONE = 14;
	const BADGE_W = 44;
	const BADGE_H = 24;

	function buildPath(/** @type {number[]} */ data, /** @type {number} */ cW, /** @type {number} */ cH) {
		if (!data.length) return '';
		const pts = data.map((v, i) => [
			(i / xDenom) * cW,
			padTop + cH - (v / globalMax) * cH
		]);
		if (pts.length === 1) return `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
		let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
		for (let i = 1; i < pts.length; i++) {
			const cpx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(2);
			d += ` C ${cpx} ${pts[i - 1][1].toFixed(2)} ${cpx} ${pts[i][1].toFixed(2)} ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
		}
		return d;
	}

	const chart = $derived.by(() => {
		const cW = Math.max(1, W - RIGHT_ZONE);
		const cH = Math.max(1, plotFloorY - padTop);
		const pvPath = buildPath(pageviews, cW, cH);
		const uqPath = buildPath(uniques, cW, cH);
		const endI = DAYS - 1;
		const endX = (endI / xDenom) * cW;
		const endY = padTop + cH - (pageviews[endI] / globalMax) * cH;
		return { cW, cH, pvPath, uqPath, endX, endY };
	});

	const activeIndex = $derived(hoverIndex ?? DAYS - 1);
	const activeX = $derived((activeIndex / xDenom) * chart.cW);
	const activeY = $derived(padTop + chart.cH - (pageviews[activeIndex] / globalMax) * chart.cH);
	const activeVal = $derived(pageviews[activeIndex] ?? 0);
	const activeLabel = $derived(labels[activeIndex] ?? '');
	const pillX = $derived(Math.max(36, Math.min(W - 36, activeX)));
	const badgeLeft = $derived(activeX + 10 + BADGE_W > chart.cW);

	function updateHover(/** @type {PointerEvent} */ event) {
		if (loading) return;
		const el = /** @type {SVGSVGElement} */ (event.currentTarget);
		const rect = el.getBoundingClientRect();
		const x = event.clientX - rect.left;
		hoverIndex = Math.max(0, Math.min(DAYS - 1, Math.round((x / chart.cW) * xDenom)));
	}

	function handleLeave(/** @type {PointerEvent} */ event) {
		if (event.pointerType === 'mouse') hoverIndex = null;
	}

	function badgeRectX(x, left) {
		return left ? x - 10 - BADGE_W : x + 10;
	}
	function badgeTextX(x, left) {
		return left ? x - 10 - BADGE_W / 2 : x + 10 + BADGE_W / 2;
	}
</script>

<div class="chart-wrap" bind:this={containerEl}>
	{#if W > 0}
		<div class="chart-body" aria-busy={loading}>
			{#if loading}
				<div class="loading" style:height="{SVG_H}px">
					<p>{/* quiet */ ''}</p>
				</div>
			{/if}
			<svg
				class="chart-svg"
				class:loading
				width={W}
				height={SVG_H}
				viewBox="0 0 {W} {SVG_H}"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
				overflow="visible"
				onpointerdown={updateHover}
				onpointermove={updateHover}
				onpointerleave={handleLeave}
			>
				<defs>
					<linearGradient
						id="{chartId}-line"
						x1="0"
						y1="0"
						x2={chart.endX}
						y2="0"
						gradientUnits="userSpaceOnUse"
					>
						<stop offset="0%" stop-color="var(--fg-33)" />
						<stop offset="100%" stop-color="var(--fg)" />
					</linearGradient>
					<filter id="{chartId}-glow" x="-20%" y="-250%" width="140%" height="600%">
						<feGaussianBlur in="SourceGraphic" stdDeviation="8" />
					</filter>
				</defs>

				{#if !loading}
					{#if chart.uqPath}
						<path
							d={chart.uqPath}
							stroke="var(--fg-33)"
							stroke-width="1.6"
							fill="none"
							opacity="0.55"
						/>
					{/if}
					{#if chart.pvPath}
						<path
							d={chart.pvPath}
							stroke="var(--fg)"
							stroke-width="6"
							fill="none"
							filter="url(#{chartId}-glow)"
							opacity="0.22"
						/>
						<path
							d={chart.pvPath}
							stroke="url(#{chartId}-line)"
							stroke-width="2.6"
							fill="none"
						/>
					{/if}

					<line
						x1={activeX}
						y1={padTop}
						x2={activeX}
						y2={SVG_H}
						stroke={hoverIndex != null ? 'var(--fg-33)' : 'var(--fg-8)'}
						stroke-width="1"
						pointer-events="none"
					/>

					{#if hoverIndex == null}
						<circle cx={chart.endX} cy={chart.endY} r="5" fill="var(--fg)" />
					{:else}
						<circle cx={activeX} cy={activeY} r="5" fill="var(--fg)" pointer-events="none" />
						<rect
							x={badgeRectX(activeX, badgeLeft)}
							y={activeY - BADGE_H / 2}
							width={BADGE_W}
							height={BADGE_H}
							rx="6"
							fill="var(--fg-8)"
							pointer-events="none"
						/>
						<text
							x={badgeTextX(activeX, badgeLeft)}
							y={activeY}
							text-anchor="middle"
							dominant-baseline="middle"
							font-size="12"
							font-weight="700"
							fill="var(--fg)"
							pointer-events="none"
						>{activeVal}</text>
					{/if}
				{/if}
			</svg>

			<div class="date-row">
				<div class="date-pill" class:on={hoverIndex != null} style="left: {pillX}px;">
					{activeLabel}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.chart-wrap {
		width: 100%;
		position: relative;
		overflow: visible;
	}

	.chart-body {
		position: relative;
		width: 100%;
	}

	.loading {
		position: absolute;
		inset: 0 auto auto 0;
		width: 100%;
		pointer-events: none;
	}

	.chart-svg {
		display: block;
		cursor: crosshair;
		touch-action: none;
		mask-image: linear-gradient(to right, transparent 0px, black 12px);
		-webkit-mask-image: linear-gradient(to right, transparent 0px, black 12px);
	}

	.chart-svg.loading {
		pointer-events: none;
		cursor: default;
	}

	.date-row {
		position: relative;
		height: 26px;
	}

	.date-pill {
		position: absolute;
		height: 26px;
		background: var(--fg-8);
		border-radius: 8px;
		display: inline-flex;
		align-items: center;
		padding: 0 12px;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
		white-space: nowrap;
		line-height: 1;
		transform: translateX(-50%);
		pointer-events: none;
	}

	.date-pill.on {
		color: var(--fg);
	}
</style>
