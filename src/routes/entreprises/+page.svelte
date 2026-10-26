<script>
	import EnterpriseCard from '$lib/components/EnterpriseCard.svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import {
		ACCOUNTING_MODES,
		ACCOUNTING_MODE_LABELS,
		accountingBrowse,
		enterpriseGross,
		setAccountingBrowse
	} from '$lib/accounting.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { primaryEnterpriseId } from '$lib/project-status.js';
	import { buildMetricContext, evalMetric } from '$lib/table-metrics.js';
	import {
		captureForms,
		costItems,
		dataTables,
		enterprises,
		metrics,
		notes,
		openComposer,
		projects,
		salesLines,
		selectEntity,
		tableRows,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const NEW_WINDOW_MS = 7 * 86_400_000;

	const mode = $derived(accountingBrowse.mode);

	const sortedEnterprises = $derived(
		[...enterprises].sort(
			(a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.title).localeCompare(String(b.title))
		)
	);

	const metricCtx = $derived(buildMetricContext(dataTables, tableRows, metrics));

	/** @param {string} enterpriseId */
	function projectIdsFor(enterpriseId) {
		return projects.filter((p) => primaryEnterpriseId(p) === enterpriseId).map((p) => p.id);
	}

	/** @param {string | undefined | null} iso */
	function isRecent(iso) {
		if (!iso) return false;
		const t = Date.parse(iso);
		if (!Number.isFinite(t)) return false;
		return Date.now() - t < NEW_WINDOW_MS;
	}

	/** @param {string} enterpriseId */
	function newCount(enterpriseId) {
		const ids = new Set(projectIdsFor(enterpriseId));
		if (ids.size === 0) return 0;
		let n = 0;
		for (const t of tasks) {
			const pids = t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? [];
			if (pids.some((id) => ids.has(id)) && isRecent(t.created_at ?? t._drive?.created_at)) n += 1;
		}
		for (const note of notes) {
			if (
				(note.project_ids ?? []).some((id) => ids.has(id)) &&
				isRecent(note.created_at ?? note._drive?.created_at)
			) {
				n += 1;
			}
		}
		return n;
	}

	/** @param {number} cents */
	function formatMoney(cents, currency = 'EUR') {
		const n = (cents ?? 0) / 100;
		try {
			return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
		} catch {
			return `${n.toFixed(2)} ${currency}`;
		}
	}

	function onCreate() {
		if (mode === 'tables') openComposer('table');
		else if (mode === 'metrics') openComposer('metric');
		else if (mode === 'forms') openComposer('form');
		else if (mode === 'costs') openComposer('cost');
		else if (mode === 'sales') openComposer('sales');
		else if (mode === 'ledger') openComposer('ledger');
		else openComposer('enterprise');
	}
</script>

<svelte:head><title>Entreprises</title></svelte:head>

<div class="feed">
	<div class="cats" role="tablist" aria-label="Accounting">
		{#each ACCOUNTING_MODES as m (m)}
			<button
				type="button"
				role="tab"
				class:on={mode === m}
				aria-selected={mode === m}
				onclick={() => setAccountingBrowse(m)}>{ACCOUNTING_MODE_LABELS[m]}</button
			>
		{/each}
	</div>

	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}

	{#if !appBoot.listsReady && enterprises.length === 0 && dataTables.length === 0}
		<FeedSkeleton rows={6} />
	{:else if mode === 'enterprises'}
		{#if sortedEnterprises.length === 0}
			<p class="empty">No Entreprises yet</p>
			<button type="button" class="empty-add" onclick={onCreate}>Create enterprise</button>
		{:else}
			<div class="card-stack">
				{#each sortedEnterprises as ent (ent.id)}
					{@const gp = enterpriseGross(ent, costItems, salesLines, {
						tables: dataTables,
						rows: tableRows,
						metrics
					})}
					<EnterpriseCard
						id={ent.id}
						title={ent.title}
						status={ent.status ?? 'active'}
						icon={ent.icon}
						newCount={newCount(ent.id)}
						onclick={() => selectEntity('enterprise', ent.id)}
						selected={ui.selection?.kind === 'enterprise' && ui.selection.id === ent.id}
					/>
					{#if ui.selection?.kind === 'enterprise' && ui.selection.id === ent.id}
						<p class="gp-line">
							Gross {formatMoney(gp.gross_cents, ent.currency || 'EUR')} · out
							{gp.output_units}
						</p>
					{/if}
				{/each}
			</div>
		{/if}
	{:else if mode === 'tables'}
		{#if dataTables.length === 0}
			<p class="empty">No tables yet</p>
			<button type="button" class="empty-add" onclick={onCreate}>New table</button>
		{:else}
			<div class="card-stack">
				{#each dataTables as t (t.id)}
					{@const n = tableRows.filter((r) => r.table_id === t.id).length}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'table' && ui.selection.id === t.id}
						onclick={() => selectEntity('table', t.id)}
					>
						<span class="title">{t.title}</span>
						<span class="preview">{t.key || t.id} · {n} rows · {(t.columns || []).length} cols</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else if mode === 'metrics'}
		{#if metrics.length === 0}
			<p class="empty">No metrics yet</p>
			<button type="button" class="empty-add" onclick={onCreate}>New metric</button>
		{:else}
			<div class="card-stack">
				{#each metrics as m (m.id)}
					{@const v = evalMetric(m, metricCtx)}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'metric' && ui.selection.id === m.id}
						onclick={() => selectEntity('metric', m.id)}
					>
						<span class="title">{m.title || m.key}</span>
						<span class="preview">{m.key} · {v.toLocaleString(undefined, { maximumFractionDigits: 2 })} {m.unit || ''}</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else if mode === 'forms'}
		{#if captureForms.length === 0}
			<p class="empty">No capture forms yet</p>
			<button type="button" class="empty-add" onclick={onCreate}>New form</button>
		{:else}
			<div class="card-stack">
				{#each captureForms as f (f.id)}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'form' && ui.selection.id === f.id}
						onclick={() => selectEntity('form', f.id)}
					>
						<span class="title">{f.title}</span>
						<span class="preview">→ table {(dataTables.find((t) => t.id === f.table_id) || {}).title || f.table_id}</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else if mode === 'costs'}
		{#if costItems.length === 0}
			<p class="empty">No cost items</p>
			<button type="button" class="empty-add" onclick={onCreate}>Add cost</button>
		{:else}
			<div class="card-stack">
				{#each costItems as item (item.id)}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'cost' && ui.selection.id === item.id}
						onclick={() => selectEntity('cost', item.id)}
					>
						<span class="title">{item.title}</span>
						<span class="preview">{item.behavior} · {formatMoney(item.amount_cents, item.currency)}</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else if mode === 'sales'}
		{#if salesLines.length === 0}
			<p class="empty">No sales lines</p>
			<button type="button" class="empty-add" onclick={onCreate}>Add sales line</button>
		{:else}
			<div class="card-stack">
				{#each salesLines as line (line.id)}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'sales' && ui.selection.id === line.id}
						onclick={() => selectEntity('sales', line.id)}
					>
						<span class="title">{line.title}</span>
						<span class="preview">{formatMoney(line.price_cents, line.currency)}{#if line.unit_label} / {line.unit_label}{/if}</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<p class="empty">Ledger entries open from create (+)</p>
		<button type="button" class="empty-add" onclick={onCreate}>New ledger entry</button>
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
	}

	.cats {
		display: flex;
		gap: 4px;
		padding: 4px 8px 8px;
		overflow-x: auto;
		scrollbar-width: none;
		flex-shrink: 0;
	}

	.cats::-webkit-scrollbar {
		display: none;
	}

	.cats button {
		flex-shrink: 0;
		height: 28px;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.cats button.on {
		background: var(--fg-8);
		color: var(--fg);
	}

	.banner {
		margin: 0;
		padding: 10px 16px;
		font-size: 13px;
		color: var(--fg-66);
	}

	.err {
		color: #b44;
	}

	.empty {
		padding: 48px 16px 12px;
		color: var(--fg-66);
		margin: 0;
	}

	.empty-add {
		margin: 0 16px 24px;
		height: 36px;
		padding: 0 16px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
		align-self: flex-start;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 6px 10px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 12px 14px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
	}

	.title {
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
	}

	.preview {
		font-size: 12px;
		color: var(--fg-33);
	}

	.gp-line {
		margin: -2px 14px 8px;
		font-size: 11px;
		color: var(--fg-33);
	}
</style>
