<script>
	import { accountingBrowse, setAccountingBrowse } from '$lib/accounting.svelte.js';
	import {
		costItems,
		enterprises,
		ledgerEntries,
		openComposer,
		salesLines
	} from '$lib/workspace.svelte.js';

	const cats = $derived([
		{
			id: 'enterprises',
			label: 'Entreprises',
			count: enterprises.length,
			create: 'enterprise',
			hint: 'Farm lines — Eggs, Sheep, General… + P&L sheets'
		},
		{
			id: 'costs',
			label: 'Costs',
			count: costItems.length,
			create: 'cost',
			hint: 'Atomic fixed, variable, and build costs'
		},
		{
			id: 'sales',
			label: 'Sales',
			count: salesLines.length,
			create: 'sales',
			hint: 'Price lines and channels'
		},
		{
			id: 'ledger',
			label: 'Ledger',
			count: ledgerEntries.length,
			create: 'ledger',
			hint: 'Actual money in and out'
		}
	]);
</script>

<svelte:head><title>Entreprises</title></svelte:head>

<nav class="feed" aria-label="Entreprises">
	<div class="card-stack top">
		{#each cats as cat (cat.id)}
			<button
				type="button"
				class="row"
				class:on={accountingBrowse.mode === cat.id}
				onclick={() => setAccountingBrowse(/** @type {any} */ (cat.id))}
			>
				<span class="title">{cat.label}</span>
				{#if cat.count}
					<span class="count">{cat.count}</span>
				{/if}
			</button>
		{/each}
	</div>

	<div class="group-header">
		<span class="eyebrow-label-xs">Quick add</span>
		<button
			type="button"
			class="group-add-btn"
			aria-label="New enterprise"
			onclick={() => {
				setAccountingBrowse('enterprises');
				openComposer('enterprise');
			}}
		>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
		</button>
	</div>
	<p class="hint">
		Create enterprises for each farm activity, attach projects, then compose costs and sales on each
		enterprise sheet for gross profit.
	</p>
</nav>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
	}

	.card-stack.top {
		padding-top: 4px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
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

	.row:hover,
	.row.on {
		background: var(--fg-4);
	}

	.title {
		flex: 1;
		font-size: 15px;
		font-weight: 600;
	}

	.count {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-33);
		font-variant-numeric: tabular-nums;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 12px 6px 0;
		padding: 6px 10px;
		border-radius: 10px;
		background: var(--fg-4);
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.group-add-btn {
		margin-left: auto;
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
	}

	.hint {
		margin: 10px 16px 24px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
	}
</style>
