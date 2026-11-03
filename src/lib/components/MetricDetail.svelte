<script>
	import { formatMetricValue } from '$lib/format-value.js';
	import { buildMetricContext, evalMetric } from '$lib/table-metrics.js';
	import { parentEnterpriseId } from '$lib/entity-routes.js';
	import {
		clearSelection,
		dataTables,
		enterprises,
		metrics,
		saveMetric,
		selectEntity,
		tableRows,
		ui
	} from '$lib/workspace.svelte.js';

	/** @type {{ metric: any }} */
	let { metric } = $props();

	const ctx = $derived(buildMetricContext(dataTables, tableRows, metrics));
	const live = $derived(evalMetric(metric, ctx));
	const parentId = $derived(
		metric.enterprise_id || parentEnterpriseId(ui.selection)
	);

	async function persist(patch) {
		Object.assign(metric, patch);
		await saveMetric({ ...metric }, false);
	}

	function backToEnterprise() {
		if (parentId) selectEntity('enterprise', parentId);
		else clearSelection();
	}
</script>

<header class="detail-top desktop-head">
	<div class="detail-top-start">
		{#if parentId}
			<button type="button" class="icon-hit" aria-label="Back to enterprise" onclick={backToEnterprise}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M10 3.5 5.5 8 10 12.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		{/if}
		<span class="detail-top-label">Metric</span>
	</div>
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
	<label class="field">
		<span>Unit</span>
		<input
			value={metric.unit ?? ''}
			placeholder="EUR, eggs, %"
			oninput={(e) => void persist({ unit: e.currentTarget.value || null })}
		/>
	</label>
	<p class="live">
		Live value: <strong>{formatMetricValue(live, metric.unit)}</strong>
	</p>
	<p class="hint">
		Examples: <code>sum(table:egg_actuals, col:dozen)</code>,
		<code>avg(table:flock, col:laying_pct)</code>,
		<code>metric:eggs.forecast * 12</code>
	</p>
</div>

<style>
	.body {
		padding: 48px 20px 48px;
		overflow: auto;
		min-height: 0;
		flex: 1;
	}

	@media (min-width: 768px) {
		.body {
			padding-left: 24px;
			padding-right: 24px;
		}
	}
	.title-input {
		width: 100%;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 22px;
		font-weight: 650;
		color: var(--fg);
		padding: 0;
		margin: 0 0 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 14px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}
	.field input,
	.field textarea,
	.field select {
		border: 1px solid var(--fg-8);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 400;
		padding: 8px 10px;
	}
	.live {
		margin: 8px 0;
		font-size: 14px;
		color: var(--fg-66);
	}
	.unit {
		margin-left: 4px;
		color: var(--fg-33);
	}
	.hint {
		margin: 16px 0 0;
		font-size: 12px;
		color: var(--fg-33);
		line-height: 1.45;
	}
	.hint code {
		font-size: 11px;
	}
</style>
