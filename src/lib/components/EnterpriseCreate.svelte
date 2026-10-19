<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import Spinner from './Spinner.svelte';
	import {
		closeComposer,
		costItems,
		projects,
		salesLines,
		saveEnterprise,
		ui
	} from '$lib/workspace.svelte.js';
	import { enterpriseGross } from '$lib/accounting.svelte.js';

	let title = $state('');
	let outputUnits = $state('');
	let outputLabel = $state('');
	/** @type {{ cost_item_id: string, qty: number }[]} */
	let fixedRows = $state([]);
	/** @type {{ cost_item_id: string, units_per_output: number }[]} */
	let variableRows = $state([]);
	/** @type {{ sales_line_id: string, units: number }[]} */
	let salesRows = $state([]);
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	let saving = $state(false);
	/** @type {null | 'fixed' | 'variable' | 'sales' | 'projects'} */
	let bottomMenu = $state(null);

	const open = $derived(ui.composer?.kind === 'enterprise');

	const fixedCosts = $derived(costItems.filter((c) => c.behavior === 'fixed' || c.behavior === 'capex'));
	const variableCosts = $derived(costItems.filter((c) => c.behavior === 'variable'));

	const preview = $derived.by(() => {
		const units = Number(String(outputUnits).replace(',', '.')) || 0;
		const draft = {
			fixed_costs: fixedRows,
			variable_costs: variableRows,
			sales: salesRows.map((r) => ({ ...r, units: r.units || units })),
			expected_output_units: units
		};
		return enterpriseGross(draft, costItems, salesLines);
	});

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
		outputUnits = '';
		outputLabel = '';
		fixedRows = [];
		variableRows = [];
		salesRows = [];
		projectIds = [];
		tick().then(() => titleInput?.focus());
	});

	/** @param {string[]} list @param {string} id */
	function toggle(list, id) {
		return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
	}

	/** @param {string} id */
	function toggleFixed(id) {
		const i = fixedRows.findIndex((r) => r.cost_item_id === id);
		fixedRows =
			i >= 0 ? fixedRows.filter((_, j) => j !== i) : [...fixedRows, { cost_item_id: id, qty: 1 }];
	}

	/** @param {string} id */
	function toggleVariable(id) {
		const i = variableRows.findIndex((r) => r.cost_item_id === id);
		variableRows =
			i >= 0
				? variableRows.filter((_, j) => j !== i)
				: [...variableRows, { cost_item_id: id, units_per_output: 1 }];
	}

	/** @param {string} id */
	function toggleSales(id) {
		const i = salesRows.findIndex((r) => r.sales_line_id === id);
		const units = Number(String(outputUnits).replace(',', '.')) || 0;
		salesRows =
			i >= 0
				? salesRows.filter((_, j) => j !== i)
				: [...salesRows, { sales_line_id: id, units }];
	}

	function formatMoney(cents) {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(
			(cents ?? 0) / 100
		);
	}

	async function save() {
		if (!title.trim() || saving) return;
		saving = true;
		try {
			const units = Number(String(outputUnits).replace(',', '.')) || 0;
			const pending = saveEnterprise(
				{
					title: title.trim(),
					status: 'draft',
					project_ids: projectIds,
					fixed_costs: fixedRows,
					variable_costs: variableRows,
					sales: salesRows.map((r) => ({
						sales_line_id: r.sales_line_id,
						units: r.units || units
					})),
					expected_output_units: units,
					output_unit_label: outputLabel.trim()
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

<CreateSheet {open} sheetId="enterprise-create" label="New enterprise" onclose={closeComposer}>
	<div class="sheet-title-row">
		<input
			bind:this={titleInput}
			class="sheet-input"
			placeholder="Enterprise sheet (e.g. Laying hens)"
			bind:value={title}
		/>
	</div>
	<div class="form-divider"></div>
	<div class="fields">
		<label class="field">
			<span class="field-label">Expected output / period</span>
			<input class="field-input" inputmode="decimal" placeholder="0" bind:value={outputUnits} />
		</label>
		<label class="field">
			<span class="field-label">Output unit</span>
			<input class="field-input" placeholder="dozen, kg…" bind:value={outputLabel} />
		</label>
	</div>
	<p class="preview">
		Gross {formatMoney(preview.gross_cents)}
		<span class="dim"
			>(rev {formatMoney(preview.revenue_cents)} − fixed {formatMoney(preview.fixed_cents)} − var
			{formatMoney(preview.variable_cents)})</span
		>
	</p>
	<div class="form-divider"></div>
	<div class="task-bottom-row">
		<div class="bottom-pills">
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={fixedRows.length === 0}
					onclick={() => (bottomMenu = bottomMenu === 'fixed' ? null : 'fixed')}
				>
					Fixed ({fixedRows.length})
				</button>
				{#if bottomMenu === 'fixed'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu">
						{#if fixedCosts.length === 0}
							<p class="menu-empty">Add fixed costs first</p>
						{:else}
							{#each fixedCosts as c (c.id)}
								<button
									type="button"
									class="option"
									class:active={fixedRows.some((r) => r.cost_item_id === c.id)}
									onclick={() => toggleFixed(c.id)}>{c.title}</button
								>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={variableRows.length === 0}
					onclick={() => (bottomMenu = bottomMenu === 'variable' ? null : 'variable')}
				>
					Variable ({variableRows.length})
				</button>
				{#if bottomMenu === 'variable'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu">
						{#if variableCosts.length === 0}
							<p class="menu-empty">Add variable costs first</p>
						{:else}
							{#each variableCosts as c (c.id)}
								<button
									type="button"
									class="option"
									class:active={variableRows.some((r) => r.cost_item_id === c.id)}
									onclick={() => toggleVariable(c.id)}>{c.title}</button
								>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={salesRows.length === 0}
					onclick={() => (bottomMenu = bottomMenu === 'sales' ? null : 'sales')}
				>
					Sales ({salesRows.length})
				</button>
				{#if bottomMenu === 'sales'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu">
						{#if salesLines.length === 0}
							<p class="menu-empty">Add sales lines first</p>
						{:else}
							{#each salesLines as s (s.id)}
								<button
									type="button"
									class="option"
									class:active={salesRows.some((r) => r.sales_line_id === s.id)}
									onclick={() => toggleSales(s.id)}>{s.title}</button
								>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					onclick={() => (bottomMenu = bottomMenu === 'projects' ? null : 'projects')}
				>
					Project
				</button>
				{#if bottomMenu === 'projects'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu">
						{#each projects as p (p.id)}
							<button
								type="button"
								class="option"
								class:active={projectIds.includes(p.id)}
								onclick={() => (projectIds = toggle(projectIds, p.id))}>{p.title}</button
							>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<button type="button" class="publish-btn" disabled={!title.trim() || saving} onclick={save}>
			{#if saving}<Spinner size={14} label="Saving" />{/if}
			Create
		</button>
	</div>
</CreateSheet>

<style>
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		padding: 12px 16px 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.field-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}
	.field-input {
		height: 36px;
		padding: 0 12px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
	}
	.preview {
		margin: 10px 16px 8px;
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
	}
	.dim {
		font-weight: 500;
		color: var(--fg-33);
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
		font-size: 13px;
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
		min-width: 200px;
		max-height: 220px;
		overflow: auto;
		padding: 4px;
		background: var(--glass);
		border: 1px solid var(--glass-border);
		border-radius: 12px;
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
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}
	.option.active,
	.option:hover {
		background: var(--fg-8);
		color: var(--fg);
	}
	.menu-empty {
		margin: 0;
		padding: 10px;
		font-size: 13px;
		color: var(--fg-33);
	}
	.publish-btn {
		height: var(--ctrl-h);
		padding: 0 18px;
		margin-left: auto;
		border: 1px solid transparent;
		border-radius: 9999px;
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.publish-btn:disabled {
		opacity: 0.5;
	}
</style>
