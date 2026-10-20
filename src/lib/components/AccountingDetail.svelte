<script>
	import { accountingBrowse, enterpriseGross } from '$lib/accounting.svelte.js';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import {
		costItems,
		enterprises,
		ledgerEntries,
		openComposer,
		salesLines,
		selectEntity,
		ui
	} from '$lib/workspace.svelte.js';

	/** @param {number} cents */
	function formatMoney(cents, currency = 'EUR') {
		const n = (cents ?? 0) / 100;
		try {
			return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
		} catch {
			return `${n.toFixed(2)} ${currency}`;
		}
	}

	/** @param {number | undefined} ts */
	function formatDay(ts) {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const mode = $derived(accountingBrowse.mode);
	const title = $derived(
		mode === 'ledger'
			? 'Ledger'
			: mode === 'costs'
				? 'Costs'
				: mode === 'sales'
					? 'Sales'
					: mode === 'enterprises'
						? 'Enterprises'
						: 'Accounting'
	);

	const sortedLedger = $derived(
		[...ledgerEntries].sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0))
	);

	function onCreate() {
		if (mode === 'ledger') openComposer('ledger');
		else if (mode === 'costs') openComposer('cost');
		else if (mode === 'sales') openComposer('sales');
		else if (mode === 'enterprises') openComposer('enterprise');
	}
</script>

{#if mode === 'home'}
	<div class="empty desktop-empty">
		<p class="empty-title">Pick a category</p>
		<p class="empty-body">Ledger, Costs, Sales, or Enterprises — same pattern as Player library.</p>
	</div>
{:else}
	<header class="detail-top desktop-head">
		<span class="detail-top-label">{title}</span>
		<div class="detail-top-actions">
			<button type="button" class="chrome-add" aria-label="Add" onclick={onCreate}>
				<svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				</svg>
			</button>
		</div>
	</header>

	<div class="body-scroll">
		{#if mode === 'ledger'}
			{#if sortedLedger.length === 0}
				<p class="empty-inline">No ledger entries yet</p>
			{:else}
				<div class="card-stack">
					{#each sortedLedger as entry (entry.id)}
						<button
							type="button"
							class="row"
							class:on={ui.selection?.kind === 'ledger' && ui.selection.id === entry.id}
							onclick={() => selectEntity('ledger', entry.id)}
						>
							<span class="title-row">
								<span class="dir" class:in={entry.direction === 'in'}
									>{entry.direction === 'in' ? '+' : '−'}</span
								>
								<span class="title">{entry.memo || entry.account_title}</span>
								<span class="amt">{formatMoney(entry.amount_cents, entry.currency)}</span>
							</span>
							<span class="preview">
								{entry.account_code}
								{#if entry.channel}· {entry.channel}{/if}
								{#if entry.occurredAt}· {formatDay(entry.occurredAt)}{/if}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		{:else if mode === 'costs'}
			{#if costItems.length === 0}
				<p class="empty-inline">No cost items — add feed, builds, packaging…</p>
			{:else}
				<div class="card-stack">
					{#each costItems as item (item.id)}
						<button
							type="button"
							class="row"
							class:on={ui.selection?.kind === 'cost' && ui.selection.id === item.id}
							onclick={() => selectEntity('cost', item.id)}
						>
							<span class="title-row">
								<span class="title">{item.title}</span>
								<span class="amt">{formatMoney(item.amount_cents, item.currency)}</span>
							</span>
							<span class="preview">
								{item.behavior}
								{#if item.unit_label}· / {item.unit_label}{/if}
								{#if item.period && item.behavior === 'fixed'}· {item.period}{/if}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		{:else if mode === 'sales'}
			{#if salesLines.length === 0}
				<p class="empty-inline">No sales lines — add price × unit × channel</p>
			{:else}
				<div class="card-stack">
					{#each salesLines as line (line.id)}
						<button
							type="button"
							class="row"
							class:on={ui.selection?.kind === 'sales' && ui.selection.id === line.id}
							onclick={() => selectEntity('sales', line.id)}
						>
							<span class="title-row">
								<span class="title">{line.title}</span>
								<span class="amt">{formatMoney(line.price_cents, line.currency)}</span>
							</span>
							<span class="preview">
								{#if line.unit_label}/ {line.unit_label}{/if}
								{#if line.channel}· {line.channel}{/if}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		{:else if mode === 'enterprises'}
			{#if enterprises.length === 0}
				<p class="empty-inline">No enterprise sheets — link costs + sales for gross profit</p>
			{:else}
				<div class="card-stack">
					{#each enterprises as ent (ent.id)}
						{@const gp = enterpriseGross(ent, costItems, salesLines)}
						<button
							type="button"
							class="row"
							class:on={ui.selection?.kind === 'enterprise' && ui.selection.id === ent.id}
							onclick={() => selectEntity('enterprise', ent.id)}
						>
							<span class="title-row">
								<EnterpriseBox state={ent.status || 'active'} icon={ent.icon} size={22} />
								<span class="title">{ent.title}</span>
								<span class="amt" class:in={gp.gross_cents >= 0}
									>{formatMoney(gp.gross_cents, ent.currency || 'EUR')}</span
								>
							</span>
							<span class="preview">
								{ent.status || 'draft'} · rev {formatMoney(gp.revenue_cents)} − costs
								{formatMoney(gp.fixed_cents + gp.variable_cents)}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.empty {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 32px 24px;
		min-height: 40vh;
	}

	.empty-title {
		margin: 0 0 8px;
		font-size: 16px;
		font-weight: 600;
		color: var(--fg);
	}

	.empty-body {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--fg-33);
	}

	.detail-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--fg-8);
		flex-shrink: 0;
	}

	.detail-top-label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.chrome-add {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg-66);
		cursor: pointer;
	}

	.chrome-add:hover {
		background: var(--fg-8);
		color: var(--fg);
	}

	.body-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.empty-inline {
		padding: 32px 16px;
		margin: 0;
		color: var(--fg-66);
		font-size: 14px;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.row:hover,
	.row.on {
		background: var(--fg-4);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.dir {
		width: 14px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.dir.in {
		color: var(--fg);
	}

	.title {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.amt {
		font-size: 13px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--fg-66);
	}

	.amt.in {
		color: var(--fg);
	}

	.preview {
		padding-left: 22px;
		font-size: 13px;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
