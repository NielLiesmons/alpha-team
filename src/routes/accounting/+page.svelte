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
			id: 'ledger',
			label: 'Ledger',
			count: ledgerEntries.length,
			create: 'ledger',
			hint: 'Actual money in and out'
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
			id: 'enterprises',
			label: 'Enterprises',
			count: enterprises.length,
			create: 'enterprise',
			hint: 'Sheets that link costs + sales → gross profit'
		}
	]);
</script>

<svelte:head><title>Accounting</title></svelte:head>

<nav class="feed" aria-label="Accounting">
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
			aria-label="New ledger entry"
			onclick={() => {
				setAccountingBrowse('ledger');
				openComposer('ledger');
			}}
		>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
		</button>
	</div>
	<p class="hint">
		Build cost and sales lists first, then assemble an enterprise sheet for gross profit — same idea as
		playlists linking songs.
	</p>
</nav>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding-top: var(--feed-pad-top, 48px);
		padding-bottom: var(--feed-pad-bottom, 40px);
		box-sizing: border-box;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
		box-sizing: border-box;
	}

	.card-stack.top {
		padding-top: 0;
	}

	.row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: calc(0.85rem - 4px) 0.9rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
		font: inherit;
	}

	.row:hover,
	.row.on {
		background: var(--fg-4);
	}

	.title {
		flex: 1;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
	}

	.count {
		font-size: 12px;
		font-weight: 500;
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
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: transparent;
		border: none;
		color: var(--fg-33);
		cursor: pointer;
		padding: 0;
	}

	.group-add-btn:hover {
		color: var(--fg);
		background: var(--fg-8);
	}

	.hint {
		margin: 10px 16px 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
	}
</style>
