<script>
	import { formatMetricValue } from '$lib/format-value.js';
	import { buildMetricContext, evalMetric } from '$lib/table-metrics.js';
	import { openEntreprisesEntity, parentEnterpriseId } from '$lib/entity-routes.js';
	import {
		clearSelection,
		dataTables,
		enterprises,
		metrics,
		saveDataView,
		selectEntity,
		tableRows,
		ui
	} from '$lib/workspace.svelte.js';
	import FloatPanel from './FloatPanel.svelte';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import Pen from './icons/Pen.svelte';

	/** @type {{ view: any }} */
	let { view } = $props();

	const ctx = $derived(buildMetricContext(dataTables, tableRows, metrics));
	const parentId = $derived(
		view.enterprise_id || parentEnterpriseId(ui.selection)
	);
	const enterprise = $derived(
		enterprises.find((e) => String(e.id) === String(view.enterprise_id)) ?? null
	);
	const linkedMetrics = $derived(
		(view.metric_ids || []).map((id) => metrics.find((m) => m.id === id)).filter(Boolean)
	);
	const linkedTables = $derived(
		(view.table_ids || []).map((id) => dataTables.find((t) => t.id === id)).filter(Boolean)
	);

	/** Read-only by default; pen in the top bar enters edit. */
	let editing = $state(false);

	$effect(() => {
		void view?.id;
		editing = false;
		menu = null;
	});

	/** @type {null | 'enterprise' | 'add-metric' | 'add-table'} */
	let menu = $state(null);
	/** @type {HTMLButtonElement | undefined} */
	let entBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let addMetricBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let addTableBtn = $state();

	async function persist(patch) {
		Object.assign(view, patch);
		await saveDataView({ ...view }, false);
	}

	function backToEnterprise() {
		if (parentId) selectEntity('enterprise', parentId);
		else clearSelection();
	}

	/**
	 * @param {'metric_ids' | 'table_ids'} field
	 * @param {number} index
	 * @param {-1 | 1} dir
	 */
	async function move(field, index, dir) {
		const list = [...(view[field] || [])];
		const j = index + dir;
		if (j < 0 || j >= list.length) return;
		const tmp = list[index];
		list[index] = list[j];
		list[j] = tmp;
		await persist({ [field]: list });
	}

	async function removeId(/** @type {'metric_ids' | 'table_ids'} */ field, /** @type {string} */ id) {
		await persist({ [field]: (view[field] || []).filter((x) => x !== id) });
	}

	async function addId(/** @type {'metric_ids' | 'table_ids'} */ field, /** @type {string} */ id) {
		const cur = view[field] || [];
		if (cur.includes(id)) return;
		menu = null;
		await persist({ [field]: [...cur, id] });
	}

	async function setEnterprise(/** @type {string | null} */ id) {
		menu = null;
		await persist({ enterprise_id: id });
	}

	const unusedMetrics = $derived(
		metrics.filter((m) => !(view.metric_ids || []).includes(m.id))
	);
	const unusedTables = $derived(
		dataTables.filter((t) => !(view.table_ids || []).includes(t.id))
	);
</script>

<header class="detail-top desktop-head">
	<div class="detail-top-start">
		<button type="button" class="icon-hit" aria-label="Back" onclick={backToEnterprise}>
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
		<span class="detail-top-label">View</span>
	</div>
	<div class="detail-top-actions">
		<button
			type="button"
			class="icon-hit"
			aria-label={editing ? 'Done editing' : 'Edit'}
			aria-pressed={editing}
			onclick={() => {
				editing = !editing;
				menu = null;
			}}
		>
			<Pen size={13} />
		</button>
	</div>
</header>

<div class="body">
	{#if editing}
		<input
			class="title-input"
			value={view.title ?? ''}
			placeholder="Untitled view"
			oninput={(e) => void persist({ title: e.currentTarget.value })}
		/>

		<div class="meta-row" role="list">
			<div class="meta-item" role="listitem">
				<button
					bind:this={entBtn}
					type="button"
					class="meta-pill"
					class:empty={!enterprise}
					aria-label="Enterprise"
					aria-expanded={menu === 'enterprise'}
					onclick={() => (menu = menu === 'enterprise' ? null : 'enterprise')}
				>
					{#if enterprise}
						<EnterpriseBox state={enterprise.status ?? 'active'} icon={enterprise.icon} size={18} />
						<span class="pill-v">{enterprise.title}</span>
					{:else}
						<span class="pill-v muted">Enterprise</span>
					{/if}
				</button>
			</div>
		</div>

		<label class="desc-field">
			<span class="sr-only">Description</span>
			<textarea
				class="desc-input"
				rows="2"
				placeholder="Description"
				value={view.description ?? ''}
				oninput={(e) => void persist({ description: e.currentTarget.value || null })}
			></textarea>
		</label>
	{:else}
		<h2 class="title">{view.title || 'Untitled view'}</h2>
		{#if enterprise}
			<div class="meta-row" role="list">
				<div class="meta-item" role="listitem">
					<span class="meta-pill static">
						<EnterpriseBox state={enterprise.status ?? 'active'} icon={enterprise.icon} size={18} />
						<span class="pill-v">{enterprise.title}</span>
					</span>
				</div>
			</div>
		{/if}
		{#if view.description}
			<p class="desc">{view.description}</p>
		{/if}
	{/if}

	<section class="block">
		<div class="block-head">
			<h3>Metrics</h3>
			{#if editing}
				<button
					bind:this={addMetricBtn}
					type="button"
					class="add"
					aria-expanded={menu === 'add-metric'}
					onclick={() => (menu = menu === 'add-metric' ? null : 'add-metric')}
				>
					+ Add
				</button>
			{/if}
		</div>
		{#if linkedMetrics.length === 0}
			<p class="hint">No metrics in this view yet.</p>
		{:else}
			<ul class="ordered-list">
				{#each linkedMetrics as m, i (m.id)}
					<li class="ordered-row">
						{#if editing}
							<div class="order-btns">
								<button
									type="button"
									class="order"
									aria-label="Move up"
									disabled={i === 0}
									onclick={() => void move('metric_ids', i, -1)}
								>
									↑
								</button>
								<button
									type="button"
									class="order"
									aria-label="Move down"
									disabled={i === linkedMetrics.length - 1}
									onclick={() => void move('metric_ids', i, 1)}
								>
									↓
								</button>
							</div>
						{/if}
						<button
							type="button"
							class="metric-row"
							onclick={() => openEntreprisesEntity('metric', m.id)}
						>
							<span class="m-title">{m.title || m.key}</span>
							<span class="m-val">{formatMetricValue(evalMetric(m, ctx), m.unit)}</span>
						</button>
						{#if editing}
							<button
								type="button"
								class="rm"
								aria-label="Remove from view"
								onclick={() => void removeId('metric_ids', m.id)}>×</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="block">
		<div class="block-head">
			<h3>Tables</h3>
			{#if editing}
				<button
					bind:this={addTableBtn}
					type="button"
					class="add"
					aria-expanded={menu === 'add-table'}
					onclick={() => (menu = menu === 'add-table' ? null : 'add-table')}
				>
					+ Add
				</button>
			{/if}
		</div>
		{#if linkedTables.length === 0}
			<p class="hint">No tables in this view yet.</p>
		{:else}
			<ul class="ordered-list">
				{#each linkedTables as t, i (t.id)}
					{@const n = tableRows.filter((r) => r.table_id === t.id).length}
					<li class="ordered-row">
						{#if editing}
							<div class="order-btns">
								<button
									type="button"
									class="order"
									aria-label="Move up"
									disabled={i === 0}
									onclick={() => void move('table_ids', i, -1)}
								>
									↑
								</button>
								<button
									type="button"
									class="order"
									aria-label="Move down"
									disabled={i === linkedTables.length - 1}
									onclick={() => void move('table_ids', i, 1)}
								>
									↓
								</button>
							</div>
						{/if}
						<button
							type="button"
							class="table-row"
							onclick={() => openEntreprisesEntity('table', t.id)}
						>
							<span class="t-title">{t.title}</span>
							<span class="t-meta">{n} entries</span>
						</button>
						{#if editing}
							<button
								type="button"
								class="rm"
								aria-label="Remove from view"
								onclick={() => void removeId('table_ids', t.id)}>×</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

{#if editing}
	<FloatPanel
		open={menu === 'enterprise'}
		anchor={entBtn}
		placement="below"
		width={260}
		maxHeight={280}
		onclose={() => (menu = null)}
	>
		<div class="float-list" role="listbox">
			<button type="button" class="option" onclick={() => void setEnterprise(null)}>
				<span class="option-text muted">None</span>
			</button>
			{#each enterprises as ent (ent.id)}
				<button
					type="button"
					class="option"
					class:active={String(view.enterprise_id) === String(ent.id)}
					onclick={() => void setEnterprise(ent.id)}
				>
					<EnterpriseBox state={ent.status ?? 'active'} icon={ent.icon} size={18} />
					<span class="option-text">{ent.title}</span>
				</button>
			{/each}
		</div>
	</FloatPanel>

	<FloatPanel
		open={menu === 'add-metric'}
		anchor={addMetricBtn}
		placement="below"
		align="end"
		width={280}
		maxHeight={320}
		onclose={() => (menu = null)}
	>
		<div class="float-list" role="listbox">
			{#if unusedMetrics.length === 0}
				<p class="menu-empty">All metrics already listed</p>
			{:else}
				{#each unusedMetrics as m (m.id)}
					<button type="button" class="option" onclick={() => void addId('metric_ids', m.id)}>
						<span class="option-text">{m.title || m.key}</span>
					</button>
				{/each}
			{/if}
		</div>
	</FloatPanel>

	<FloatPanel
		open={menu === 'add-table'}
		anchor={addTableBtn}
		placement="below"
		align="end"
		width={280}
		maxHeight={320}
		onclose={() => (menu = null)}
	>
		<div class="float-list" role="listbox">
			{#if unusedTables.length === 0}
				<p class="menu-empty">All tables already listed</p>
			{:else}
				{#each unusedTables as t (t.id)}
					<button type="button" class="option" onclick={() => void addId('table_ids', t.id)}>
						<span class="option-text">{t.title}</span>
					</button>
				{/each}
			{/if}
		</div>
	</FloatPanel>
{/if}

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

	.title {
		margin: 0 0 10px;
		font-size: 22px;
		font-weight: 650;
		line-height: 1.25;
		color: var(--fg);
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
		margin: 0 0 10px;
	}

	.meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 12px;
	}

	.meta-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.meta-pill.static {
		cursor: default;
	}

	.meta-pill:hover,
	.meta-pill[aria-expanded='true'] {
		background: var(--fg-8);
		color: var(--fg);
	}

	.meta-pill.static:hover {
		background: var(--fg-4);
		color: var(--fg-66);
	}

	.meta-pill.empty {
		color: var(--fg-33);
	}

	.pill-v {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pill-v.muted,
	.muted {
		color: var(--fg-33);
	}

	.desc {
		margin: 0 0 20px;
		font-size: 14px;
		color: var(--fg-66);
	}

	.desc-field {
		display: block;
		margin: 0 0 20px;
	}

	.desc-input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--fg-8);
		border-radius: 10px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 14px;
		padding: 8px 10px;
		resize: vertical;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.block {
		margin-bottom: 24px;
	}

	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.block h3 {
		margin: 0;
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.add {
		border: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.add:hover {
		color: var(--fg);
	}

	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--fg-33);
	}

	.ordered-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.ordered-row {
		display: flex;
		align-items: stretch;
		gap: 4px;
	}

	.order-btns {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 4px;
	}

	.order {
		width: 22px;
		height: 18px;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--fg-33);
		font-size: 11px;
		line-height: 1;
		cursor: pointer;
	}

	.order:hover:not(:disabled) {
		background: var(--fg-8);
		color: var(--fg);
	}

	.order:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.metric-row,
	.table-row {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 10px 12px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.metric-row:hover,
	.table-row:hover {
		background: var(--fg-8);
	}

	.m-title,
	.t-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
	}

	.m-val {
		font-size: 18px;
		font-weight: 650;
		color: var(--fg);
	}

	.t-meta {
		font-size: 12px;
		color: var(--fg-33);
	}

	.rm {
		width: 28px;
		border: 0;
		background: transparent;
		color: var(--fg-33);
		font-size: 18px;
		cursor: pointer;
		border-radius: 8px;
	}

	.rm:hover {
		background: var(--fg-8);
		color: var(--fg);
	}

	.float-list {
		display: flex;
		flex-direction: column;
		padding: 6px;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}

	.option:hover,
	.option.active {
		background: var(--fg-8);
	}

	.option-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.menu-empty {
		margin: 0;
		padding: 12px;
		font-size: 13px;
		color: var(--fg-33);
	}
</style>
