<script>
	/**
	 * Zapstore StudioCountryChart subset — single metric bars, Alpha tokens.
	 */
	let {
		/** @type {{ code: string, count: number }[]} */
		rows = [],
		loading = false,
		emptyLabel = 'No country data yet.'
	} = $props();

	const max = $derived(Math.max(1, ...rows.map((r) => r.count)));

	const REGIONAL_A = 0x1f1e6;

	/** @param {string} code */
	function flagEmoji(code) {
		const raw = String(code ?? '')
			.trim()
			.toUpperCase();
		if (!raw || raw === 'XX' || !/^[A-Z]{2}$/.test(raw)) return '';
		return String.fromCodePoint(
			REGIONAL_A + raw.charCodeAt(0) - 65,
			REGIONAL_A + raw.charCodeAt(1) - 65
		);
	}

	/** @param {number} value */
	function pct(value) {
		return `${Math.min(100, Math.round((value / max) * 100))}%`;
	}
</script>

<div class="country-chart">
	{#if loading}
		<p class="empty">…</p>
	{:else if rows.length === 0}
		<p class="empty">{emptyLabel}</p>
	{:else}
		<ul class="list">
			{#each rows as row (row.code)}
				{@const flag = flagEmoji(row.code)}
				<li class="row">
					<div class="name" title={row.code}>
						{#if flag}
							<span class="flag" aria-hidden="true">{flag}</span>
						{/if}
						<span class="code">{row.code}</span>
					</div>
					<div class="metric">
						<div
							class="track"
							role="img"
							aria-label="{row.code}: {row.count.toLocaleString()}"
						>
							<div class="fill" style:width={pct(row.count)}></div>
						</div>
						<span class="num" class:zero={row.count === 0}>{row.count.toLocaleString()}</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.country-chart {
		width: 100%;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.row {
		display: grid;
		grid-template-columns: clamp(56px, 22%, 88px) minmax(0, 1fr);
		gap: 8px 10px;
		align-items: center;
	}

	.name {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
		line-height: 1.3;
	}

	.flag {
		flex-shrink: 0;
		font-size: 1.05rem;
		line-height: 1;
	}

	.code {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.metric {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: center;
		min-width: 0;
	}

	.track {
		height: 8px;
		border-radius: 4px;
		background: var(--fg-8);
		overflow: hidden;
		min-width: 0;
	}

	.fill {
		height: 100%;
		border-radius: 4px;
		background: linear-gradient(90deg, var(--fg-33), var(--fg-66));
		min-width: 0;
		transition: width 0.2s ease-out;
	}

	.num {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--fg-66);
		min-width: 2.75rem;
		text-align: right;
		flex-shrink: 0;
	}

	.num.zero {
		color: var(--fg-33);
	}

	.empty {
		margin: 0;
		font-size: 13px;
		color: var(--fg-33);
		line-height: 1.45;
	}
</style>
