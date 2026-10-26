<script>
	import { buildMetricContext, evalMetric } from '$lib/table-metrics.js';
	import {
		clearSelection,
		dataTables,
		enterprises,
		metrics,
		saveMetric,
		tableRows
	} from '$lib/workspace.svelte.js';

	/** @type {{ metric: any }} */
	let { metric } = $props();

	const ctx = $derived(buildMetricContext(dataTables, tableRows, metrics));
	const live = $derived(evalMetric(metric, ctx));

	async function persist(patch) {
		Object.assign(metric, patch);
		await saveMetric({ ...metric }, false);
	}
</script>

<header class="detail-top desktop-head">
	<span class="detail-top-label">Metric</span>
	<button type="button" class="icon-hit" aria-label="Close" onclick={clearSelection}>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
	</button>
</header>

<div class="body">
	<input
		class="title-input"
		value={metric.title ?? ''}
		placeholder="Title"
		oninput={(e) => void persist({ title: e.currentTarget.value })}
	/>
	<label class="field">
		<span>Key</span>
		<input
			value={metric.key ?? ''}
			placeholder="eggs.forecast_month"
			oninput={(e) => void persist({ key: e.currentTarget.value })}
		/>
	</label>
	<label class="field">
		<span>Expression</span>
		<textarea
			rows="3"
			value={metric.expr ?? ''}
			placeholder="sum(table:egg_actuals, col:dozen)"
			oninput={(e) => void persist({ expr: e.currentTarget.value })}
		></textarea>
	</label>
	<label class="field">
		<span>Enterprise</span>
		<select
			value={metric.enterprise_id ?? ''}
			onchange={(e) => void persist({ enterprise_id: e.currentTarget.value || null })}
		>
			<option value="">—</option>
			{#each enterprises as ent (ent.id)}
				<option value={ent.id}>{ent.title}</option>
			{/each}
		</select>
	</label>
	<p class="live">
		Live value: <strong>{Number.isFinite(live) ? live.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</strong>
		{#if metric.unit}<span class="unit">{metric.unit}</span>{/if}
	</p>
	<p class="hint">
		Examples: <code>sum(table:egg_actuals, col:dozen)</code>,
		<code>avg(table:flock, col:laying_pct)</code>,
		<code>metric:eggs.forecast * 12</code>
	</p>
</div>

<style>
	.detail-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 48px;
		padding: 0 8px 0 16px;
	}
	.detail-top-label {
		font-size: 13px;
		color: var(--fg-33);
	}
	.icon-hit {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg-66);
		cursor: pointer;
	}
	.body {
		padding: 8px 16px 32px;
	}
	.title-input {
		width: 100%;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--fg);
		margin-bottom: 14px;
		outline: none;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.field input,
	.field textarea,
	.field select {
		border: 1px solid var(--fg-8);
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		padding: 8px 10px;
	}
	.live {
		margin: 16px 0 8px;
		font-size: 15px;
		color: var(--fg);
	}
	.unit {
		color: var(--fg-33);
		font-size: 13px;
		margin-left: 4px;
	}
	.hint {
		font-size: 12px;
		color: var(--fg-33);
		line-height: 1.45;
	}
	.hint code {
		font-size: 11px;
		color: var(--fg-66);
	}
</style>
