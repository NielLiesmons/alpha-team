<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import Spinner from './Spinner.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import {
		accounts,
		closeComposer,
		projects,
		saveLedgerEntry,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	let amount = $state('');
	let memo = $state('');
	let direction = $state(/** @type {'out' | 'in'} */ ('out'));
	let accountId = $state('');
	let channel = $state('');
	let costBehavior = $state(/** @type {'none' | 'fixed' | 'variable' | 'capex'} */ ('variable'));
	let kind = $state(/** @type {'actual' | 'planned'} */ ('actual'));
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {string[]} */
	let taskIds = $state([]);
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let amountInput = $state();
	let saving = $state(false);
	/** @type {null | 'account' | 'projects' | 'tasks' | 'channel' | 'behavior' | 'kind'} */
	let bottomMenu = $state(null);

	const CHANNELS = [
		{ id: '', label: 'No channel' },
		{ id: 'farmgate', label: 'Farm gate' },
		{ id: 'market', label: 'Market' },
		{ id: 'boutique', label: 'Boutique' },
		{ id: 'csa', label: 'CSA' },
		{ id: 'pro', label: 'Pro / wholesale' },
		{ id: 'web', label: 'Web' },
		{ id: 'other', label: 'Other' }
	];

	const BEHAVIORS = [
		{ id: 'variable', label: 'Variable' },
		{ id: 'fixed', label: 'Fixed' },
		{ id: 'capex', label: 'Capex' },
		{ id: 'none', label: 'None' }
	];

	const KINDS = [
		{ id: 'actual', label: 'Actual' },
		{ id: 'planned', label: 'Planned' }
	];

	const open = $derived(ui.composer?.kind === 'ledger');

	const expenseAccounts = $derived(
		accounts.filter((a) => a.kind === 'expense' || a.kind === 'tax' || a.kind === 'asset')
	);
	const incomeAccounts = $derived(
		accounts.filter((a) => a.kind === 'income' || a.kind === 'tax' || a.kind === 'asset')
	);
	const accountChoices = $derived(direction === 'in' ? incomeAccounts : expenseAccounts);

	const linkedTasks = $derived(
		projectIds.length === 0
			? tasks
			: tasks.filter((t) => (t.project_ids ?? []).some((id) => projectIds.includes(id)))
	);

	$effect(() => {
		if (!open) {
			seededFor = null;
			saving = false;
			bottomMenu = null;
			return;
		}
		const key = '__new__';
		if (seededFor === key) return;
		seededFor = key;
		amount = '';
		memo = '';
		direction = 'out';
		accountId = expenseAccounts[0]?.id ?? accounts[0]?.id ?? '';
		channel = '';
		costBehavior = 'variable';
		kind = 'actual';
		projectIds = [];
		taskIds = [];
		saving = false;
		bottomMenu = null;
		tick().then(() => amountInput?.focus());
	});

	$effect(() => {
		if (!open) return;
		const ids = accountChoices.map((a) => a.id);
		if (accountId && !ids.includes(accountId)) {
			accountId = accountChoices[0]?.id ?? '';
		}
	});

	/** @param {string} id */
	function toggleProject(id) {
		if (projectIds.includes(id)) projectIds = projectIds.filter((p) => p !== id);
		else projectIds = [...projectIds, id];
	}

	/** @param {string} id */
	function toggleTask(id) {
		if (taskIds.includes(id)) taskIds = taskIds.filter((t) => t !== id);
		else taskIds = [...taskIds, id];
	}

	function parseCents(raw) {
		const cleaned = String(raw).trim().replace(',', '.').replace(/[^\d.]/g, '');
		if (!cleaned) return 0;
		const n = Number(cleaned);
		if (!Number.isFinite(n) || n < 0) return 0;
		if (!cleaned.includes('.')) return Math.round(n * 100);
		return Math.round(n * 100);
	}

	async function save() {
		const cents = parseCents(amount);
		if (!cents || !accountId || saving) return;
		saving = true;
		try {
			const pending = saveLedgerEntry(
				{
					amount_cents: cents,
					direction,
					account_id: accountId,
					kind,
					cost_behavior: direction === 'out' ? costBehavior : 'none',
					channel: channel || undefined,
					memo: memo.trim(),
					project_ids: projectIds,
					task_ids: taskIds,
					occurred_at: new Date().toISOString()
				},
				true
			);
			closeComposer();
			await pending;
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			saving = false;
		}
	}

	const accountLabel = $derived(accounts.find((a) => a.id === accountId)?.title ?? 'Account');
</script>

<CreateSheet {open} label="New entry" onclose={closeComposer}>
	<div class="sheet-title-row dir-row">
		<button
			type="button"
			class="dir-btn"
			class:on={direction === 'out'}
			onclick={() => (direction = 'out')}
		>
			Expense
		</button>
		<button
			type="button"
			class="dir-btn"
			class:on={direction === 'in'}
			onclick={() => (direction = 'in')}
		>
			Income
		</button>
	</div>
	<div class="form-divider"></div>
	<div class="amount-row">
		<span class="currency">€</span>
		<input
			bind:this={amountInput}
			class="sheet-input amount"
			placeholder="0.00"
			inputmode="decimal"
			bind:value={amount}
		/>
	</div>
	<div class="memo-wrap">
		<input class="sheet-body memo" placeholder="Memo (optional)" bind:value={memo} />
	</div>
	<div class="form-divider"></div>
	<div class="task-bottom-row">
		<div class="bottom-pills">
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={!accountId}
					aria-expanded={bottomMenu === 'account'}
					onclick={() => (bottomMenu = bottomMenu === 'account' ? null : 'account')}
				>
					<span class="pill-names">{accountLabel}</span>
				</button>
				{#if bottomMenu === 'account'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#each accountChoices as a (a.id)}
							<button
								type="button"
								class="option"
								class:active={accountId === a.id}
								onclick={() => {
									accountId = a.id;
									bottomMenu = null;
								}}
							>
								<span class="code">{a.code}</span>
								<span>{a.title}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					aria-expanded={bottomMenu === 'projects'}
					onclick={() => (bottomMenu = bottomMenu === 'projects' ? null : 'projects')}
				>
					{#if projectIds.length === 0}
						<span>Project</span>
					{:else}
						<span class="pill-projects"><ProjectPillsDisplay {projectIds} /></span>
					{/if}
				</button>
				{#if bottomMenu === 'projects'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#if projects.length === 0}
							<p class="menu-empty">No projects yet</p>
						{:else}
							{#each projects as project (project.id)}
								{@const on = projectIds.includes(project.id)}
								<button type="button" class="option" class:active={on} onclick={() => toggleProject(project.id)}>
									<span>{project.title}</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={taskIds.length === 0}
					aria-expanded={bottomMenu === 'tasks'}
					onclick={() => (bottomMenu = bottomMenu === 'tasks' ? null : 'tasks')}
				>
					{#if taskIds.length === 0}
						<span>Task</span>
					{:else}
						<span class="pill-names"
							>{taskIds.map((id) => tasks.find((t) => t.id === id)?.title ?? id).join(', ')}</span
						>
					{/if}
				</button>
				{#if bottomMenu === 'tasks'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#if linkedTasks.length === 0}
							<p class="menu-empty">No tasks</p>
						{:else}
							{#each linkedTasks as task (task.id)}
								{@const on = taskIds.includes(task.id)}
								<button type="button" class="option" class:active={on} onclick={() => toggleTask(task.id)}>
									<span>{task.title}</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={!channel}
					aria-expanded={bottomMenu === 'channel'}
					onclick={() => (bottomMenu = bottomMenu === 'channel' ? null : 'channel')}
				>
					<span class="pill-names"
						>{CHANNELS.find((c) => c.id === channel)?.label ?? 'Channel'}</span
					>
				</button>
				{#if bottomMenu === 'channel'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#each CHANNELS as c (c.id)}
							<button
								type="button"
								class="option"
								class:active={channel === c.id}
								onclick={() => {
									channel = c.id;
									bottomMenu = null;
								}}
							>
								<span>{c.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if direction === 'out'}
				<div class="pill-wrap">
					<button
						type="button"
						class="meta-pill"
						aria-expanded={bottomMenu === 'behavior'}
						onclick={() => (bottomMenu = bottomMenu === 'behavior' ? null : 'behavior')}
					>
						<span class="pill-names"
							>{BEHAVIORS.find((b) => b.id === costBehavior)?.label ?? 'Variable'}</span
						>
					</button>
					{#if bottomMenu === 'behavior'}
						<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
						></button>
						<div class="bottom-menu" role="listbox">
							{#each BEHAVIORS as b (b.id)}
								<button
									type="button"
									class="option"
									class:active={costBehavior === b.id}
									onclick={() => {
										costBehavior = /** @type {typeof costBehavior} */ (b.id);
										bottomMenu = null;
									}}
								>
									<span>{b.label}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					aria-expanded={bottomMenu === 'kind'}
					onclick={() => (bottomMenu = bottomMenu === 'kind' ? null : 'kind')}
				>
					<span class="pill-names">{KINDS.find((k) => k.id === kind)?.label ?? 'Actual'}</span>
				</button>
				{#if bottomMenu === 'kind'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#each KINDS as k (k.id)}
							<button
								type="button"
								class="option"
								class:active={kind === k.id}
								onclick={() => {
									kind = /** @type {typeof kind} */ (k.id);
									bottomMenu = null;
								}}
							>
								<span>{k.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<PrimaryButton
			size="sheet"
			disabled={!parseCents(amount) || !accountId || saving}
			onclick={save}
		>
			{#if saving}
				<Spinner size={14} label="Saving" />
			{/if}
			Add
		</PrimaryButton>
	</div>
</CreateSheet>

<style>
	.dir-row {
		gap: 8px;
	}

	.dir-btn {
		flex: 1;
		height: 36px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.dir-btn.on {
		background: var(--fg-8);
		color: var(--fg);
	}

	.amount-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px 4px;
	}

	.currency {
		font-size: 22px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.amount {
		font-size: 22px !important;
		font-weight: 600;
	}

	.memo-wrap {
		padding: 0 16px 8px;
	}

	.memo {
		min-height: 0 !important;
		padding: 4px 0 !important;
		resize: none;
	}

	.task-bottom-row {
		--ctrl-h: 36px;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		padding: 12px 16px 0;
		flex-shrink: 0;
		position: relative;
		z-index: 3;
	}

	.bottom-pills {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.pill-wrap {
		position: relative;
		flex-shrink: 0;
		height: var(--ctrl-h);
		display: flex;
		align-items: center;
	}

	.meta-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: var(--ctrl-h);
		min-height: var(--ctrl-h);
		max-height: var(--ctrl-h);
		max-width: 200px;
		padding: 0 14px 0 10px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		font-size: 14px;
		font-weight: 500;
		line-height: 1;
		color: var(--fg-66);
		white-space: nowrap;
		cursor: pointer;
		font-family: inherit;
		box-sizing: border-box;
	}

	.meta-pill.empty {
		color: var(--fg-33);
		padding-left: 12px;
	}

	.meta-pill:hover {
		background: var(--fg-8);
	}

	.pill-names {
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--fg);
	}

	.pill-projects {
		display: flex;
		min-width: 0;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
	}

	.bottom-menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		z-index: 50;
		min-width: 200px;
		max-height: 220px;
		overflow: auto;
		padding: 4px;
		background: var(--glass);
		border: 1px solid var(--glass-border);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}

	.option:hover,
	.option.active {
		background: var(--fg-8);
		color: var(--fg);
	}

	.code {
		font-size: 11px;
		color: var(--fg-33);
		min-width: 4.5em;
	}

	.menu-empty {
		margin: 0;
		padding: 10px 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

</style>
