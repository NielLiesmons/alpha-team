<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		activities,
		ledgerEntries,
		openComposer,
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

	/** @param {any} a */
	function activityGross(a) {
		const units = Number(a.expected_units_month) || 0;
		const revenue = units * (Number(a.price_per_unit_cents) || 0);
		const variable = units * (Number(a.variable_cost_per_unit_cents) || 0);
		const fixed = Number(a.fixed_cost_cents_month) || 0;
		return revenue - variable - fixed;
	}

	const actuals = $derived(ledgerEntries.filter((e) => (e.kind || 'actual') === 'actual'));

	const summary = $derived.by(() => {
		let income = 0;
		let expense = 0;
		for (const e of actuals) {
			const a = e.amount_cents ?? 0;
			if (e.direction === 'in') income += a;
			else expense += a;
		}
		return { income, expense, profit: income - expense };
	});

	const sorted = $derived(
		[...ledgerEntries].sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0))
	);
</script>

<svelte:head><title>Accounting</title></svelte:head>

<div class="feed">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}

	{#if !appBoot.listsReady && ledgerEntries.length === 0 && activities.length === 0}
		<FeedSkeleton rows={8} />
	{:else}
		<div class="task-group-header">
			<span class="eyebrow-label-xs">Actual</span>
			<span class="task-group-count"
				>{formatMoney(summary.income)} in · {formatMoney(summary.expense)} out ·
				{formatMoney(summary.profit)} gross</span
			>
			<button
				type="button"
				class="task-group-add-btn"
				aria-label="Add ledger entry"
				onclick={() => openComposer('ledger')}
			>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		</div>

		{#if ledgerEntries.length === 0}
			<p class="empty">No ledger entries yet</p>
		{:else}
			<div class="card-stack">
				{#each sorted as entry (entry.id)}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'ledger' && ui.selection.id === entry.id}
						onclick={() => selectEntity('ledger', entry.id)}
					>
						<span class="title-row">
							<span class="dir" class:in={entry.direction === 'in'}>
								{entry.direction === 'in' ? '+' : '−'}
							</span>
							<span class="title">{entry.memo || entry.account_title}</span>
							<span class="amt" class:in={entry.direction === 'in'}
								>{formatMoney(entry.amount_cents, entry.currency)}</span
							>
							{#if entry.occurredAt}
								<span class="time">{formatDay(entry.occurredAt)}</span>
							{/if}
						</span>
						<span class="preview">
							{entry.account_code}
							{#if entry.channel}· {entry.channel}{/if}
							{#if entry.kind !== 'actual'}· {entry.kind}{/if}
							{#if entry.cost_behavior && entry.cost_behavior !== 'none'}
								· {entry.cost_behavior}{/if}
							{#if entry.targets?.length}
								· {entry.targets.map((t) => t.label).join(', ')}
							{/if}
						</span>
					</button>
				{/each}
			</div>
		{/if}

		<div class="task-group-header">
			<span class="eyebrow-label-xs">Scenarios</span>
			<span class="task-group-count">{activities.length}</span>
			<button
				type="button"
				class="task-group-add-btn"
				aria-label="Add activity scenario"
				onclick={() => openComposer('activity')}
			>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		</div>

		{#if activities.length === 0}
			<p class="empty">No activity models yet — model fixed vs variable costs for a farm line</p>
		{:else}
			<div class="card-stack">
				{#each activities as activity (activity.id)}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'activity' && ui.selection.id === activity.id}
						onclick={() => selectEntity('activity', activity.id)}
					>
						<span class="title-row">
							<span class="title">{activity.title}</span>
							<span class="amt" class:in={activityGross(activity) >= 0}
								>{formatMoney(activityGross(activity), activity.currency || 'EUR')}/mo</span
							>
						</span>
						<span class="preview">
							{activity.status || 'draft'}
							{#if activity.unit_label}· {activity.expected_units_month || 0}
								{activity.unit_label}/mo{/if}
							{#if activity.channels?.length}· {activity.channels.join(', ')}{/if}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
	}

	.banner {
		margin: 0;
		padding: 10px 16px;
		font-size: 13px;
		color: var(--fg-66);
	}

	.empty {
		padding: 24px 16px 32px;
		color: var(--fg-66);
		font-size: 14px;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(0.2rem + 2px);
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

	.title-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-width: 0;
	}

	.dir {
		flex-shrink: 0;
		width: 14px;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.dir.in {
		color: var(--fg);
	}

	.title {
		flex: 1;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.amt {
		flex-shrink: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--fg-66);
	}

	.amt.in {
		color: var(--fg);
	}

	.time {
		flex-shrink: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
		letter-spacing: 0.01em;
		white-space: nowrap;
	}

	.preview {
		width: 100%;
		padding-left: 22px;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		line-height: 1.4;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		box-sizing: border-box;
	}

	.task-group-count {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
</style>
