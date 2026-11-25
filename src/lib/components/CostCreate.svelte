<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import Spinner from './Spinner.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { closeComposer, projects, saveCostItem, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let title = $state('');
	let amount = $state('');
	let behavior = $state(/** @type {'fixed' | 'variable' | 'capex'} */ ('variable'));
	let unitLabel = $state('');
	let period = $state(/** @type {'once' | 'month' | 'year'} */ ('month'));
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	let saving = $state(false);
	/** @type {null | 'projects' | 'behavior' | 'period'} */
	let bottomMenu = $state(null);

	const open = $derived(ui.composer?.kind === 'cost');

	$effect(() => {
		if (!open) {
			seededFor = null;
			saving = false;
			bottomMenu = null;
			return;
		}
		if (seededFor === '__new__') return;
		seededFor = '__new__';
		title = '';
		amount = '';
		behavior = 'variable';
		unitLabel = '';
		period = 'month';
		projectIds = [];
		tick().then(() => titleInput?.focus());
	});

	function eurosToCents(raw) {
		const cleaned = String(raw).trim().replace(',', '.').replace(/[^\d.]/g, '');
		if (!cleaned) return 0;
		const n = Number(cleaned);
		if (!Number.isFinite(n) || n < 0) return 0;
		return cleaned.includes('.') ? Math.round(n * 100) : Math.round(n * 100);
	}

	/** @param {string} p */
	function periodLabel(p) {
		if (p === 'once') return t('acc.once');
		if (p === 'month') return t('acc.month');
		if (p === 'year') return t('acc.year');
		return p;
	}

	/** @param {string} id */
	function toggleProject(id) {
		if (projectIds.includes(id)) projectIds = projectIds.filter((p) => p !== id);
		else projectIds = [...projectIds, id];
	}

	async function save() {
		if (!title.trim() || !eurosToCents(amount) || saving) return;
		saving = true;
		try {
			const pending = saveCostItem(
				{
					title: title.trim(),
					behavior,
					amount_cents: eurosToCents(amount),
					unit_label: unitLabel.trim(),
					period: behavior === 'variable' ? 'once' : period,
					project_ids: projectIds
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
</script>

<CreateSheet {open} sheetId="cost-create" label={t('create.cost')} onclose={closeComposer}>
	<div class="sheet-title-row">
		<input bind:this={titleInput} class="sheet-input" placeholder={t('acc.costTitle')} bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<div class="amount-row">
		<span class="currency">€</span>
		<input class="sheet-input amount" placeholder="0.00" inputmode="decimal" bind:value={amount} />
		{#if behavior === 'variable'}
			<span class="per">/</span>
			<input class="unit" placeholder={t('acc.unit')} bind:value={unitLabel} />
		{/if}
	</div>
	<div class="form-divider"></div>
	<div class="task-bottom-row">
		<div class="bottom-pills">
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					onclick={() => (bottomMenu = bottomMenu === 'behavior' ? null : 'behavior')}
				>
					{behavior === 'fixed'
						? t('acc.fixed')
						: behavior === 'capex'
							? t('acc.capex')
							: t('acc.variable')}
				</button>
				{#if bottomMenu === 'behavior'}
					<button type="button" class="menu-backdrop" aria-label={t('common.close')} onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu">
						{#each [['variable', t('acc.variable')], ['fixed', t('acc.fixed')], ['capex', t('acc.capex')]] as [id, label]}
							<button
								type="button"
								class="option"
								class:active={behavior === id}
								onclick={() => {
									behavior = /** @type {any} */ (id);
									bottomMenu = null;
								}}>{label}</button
							>
						{/each}
					</div>
				{/if}
			</div>
			{#if behavior !== 'variable'}
				<div class="pill-wrap">
					<button
						type="button"
						class="meta-pill"
						onclick={() => (bottomMenu = bottomMenu === 'period' ? null : 'period')}
					>
						{periodLabel(period)}
					</button>
					{#if bottomMenu === 'period'}
						<button type="button" class="menu-backdrop" aria-label={t('common.close')} onclick={() => (bottomMenu = null)}
						></button>
						<div class="bottom-menu">
							{#each ['once', 'month', 'year'] as p}
								<button
									type="button"
									class="option"
									class:active={period === p}
									onclick={() => {
										period = /** @type {any} */ (p);
										bottomMenu = null;
									}}>{periodLabel(p)}</button
								>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					onclick={() => (bottomMenu = bottomMenu === 'projects' ? null : 'projects')}
				>
					{#if projectIds.length === 0}
						<span>{t('acc.project')}</span>
					{:else}
						<ProjectPillsDisplay {projectIds} />
					{/if}
				</button>
				{#if bottomMenu === 'projects'}
					<button type="button" class="menu-backdrop" aria-label={t('common.close')} onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu">
						{#each projects as project (project.id)}
							<button
								type="button"
								class="option"
								class:active={projectIds.includes(project.id)}
								onclick={() => toggleProject(project.id)}>{project.title}</button
							>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<PrimaryButton
			size="sheet"
			disabled={!title.trim() || !eurosToCents(amount) || saving}
			onclick={save}
		>
			{#if saving}<Spinner size={14} label={t('common.saving')} />{/if}
			{t('acc.add')}
		</PrimaryButton>
	</div>
</CreateSheet>

<style>
	.amount-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
	}
	.currency {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--fg-33);
	}
	.amount {
		font-size: 1.25rem !important;
		font-weight: 600;
	}
	.per {
		color: var(--fg-33);
	}
	.unit {
		width: 72px;
		border: 0;
		background: var(--fg-4);
		border-radius: 8px;
		padding: 8px 10px;
		color: var(--fg);
		font: inherit;
		font-size: 0.875rem;
	}
	.task-bottom-row {
		--ctrl-h: 36px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px 0;
	}
	.bottom-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}
	.pill-wrap {
		position: relative;
	}
	.meta-pill {
		height: var(--ctrl-h);
		padding: 0 12px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}
	.meta-pill.empty {
		color: var(--fg-33);
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
		min-width: 160px;
		padding: 4px;
		background: var(--glass);
		border: 1px solid var(--glass-border);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
	}
	.option {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 0.875rem;
		text-align: left;
		cursor: pointer;
	}
	.option.active,
	.option:hover {
		background: var(--fg-8);
		color: var(--fg);
	}
</style>
