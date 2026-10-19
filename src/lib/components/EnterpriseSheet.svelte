<script>
	import {
		clearSelection,
		costItems,
		projects,
		salesLines,
		saveEnterprise
	} from '$lib/workspace.svelte.js';
	import { enterpriseGross } from '$lib/accounting.svelte.js';

	/** @type {{ enterprise: any }} */
	let { enterprise } = $props();

	/** @type {null | 'fixed' | 'variable' | 'sales' | 'projects'} */
	let addMenu = $state(null);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let saveTimer = null;
	let saving = $state(false);
	/** @type {string | null} */
	let saveError = $state(null);

	const byCost = $derived(new Map(costItems.map((c) => [c.id, c])));
	const bySales = $derived(new Map(salesLines.map((s) => [s.id, s])));

	const fixedCatalog = $derived(
		costItems.filter((c) => c.behavior === 'fixed' || c.behavior === 'capex')
	);
	const variableCatalog = $derived(costItems.filter((c) => c.behavior === 'variable'));

	const gp = $derived(enterpriseGross(enterprise, costItems, salesLines));

	const linkedProjects = $derived(
		(enterprise.project_ids ?? [])
			.map((id) => projects.find((p) => p.id === id))
			.filter(Boolean)
	);

	function formatMoney(cents, currency = 'EUR') {
		const n = (cents ?? 0) / 100;
		try {
			return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
		} catch {
			return `${n.toFixed(2)} ${currency}`;
		}
	}

	function parseNum(raw) {
		const n = Number(String(raw ?? '').replace(',', '.'));
		return Number.isFinite(n) && n >= 0 ? n : 0;
	}

	/** @param {Partial<any>} patch */
	function scheduleSave(patch) {
		Object.assign(enterprise, patch);
		// Trigger reactivity on array fields by reassigning
		if (patch.fixed_costs) enterprise.fixed_costs = [...patch.fixed_costs];
		if (patch.variable_costs) enterprise.variable_costs = [...patch.variable_costs];
		if (patch.sales) enterprise.sales = [...patch.sales];
		if (patch.project_ids) enterprise.project_ids = [...patch.project_ids];

		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void persist();
		}, 400);
	}

	async function persist() {
		saving = true;
		saveError = null;
		try {
			await saveEnterprise(
				{
					...enterprise,
					fixed_costs: enterprise.fixed_costs ?? [],
					variable_costs: enterprise.variable_costs ?? [],
					sales: enterprise.sales ?? [],
					project_ids: enterprise.project_ids ?? [],
					expected_output_units: Number(enterprise.expected_output_units) || 0,
					output_unit_label: enterprise.output_unit_label || '',
					title: enterprise.title || 'Untitled'
				},
				false
			);
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	/** @param {string} id */
	function addFixed(id) {
		if ((enterprise.fixed_costs ?? []).some((r) => r.cost_item_id === id)) return;
		scheduleSave({
			fixed_costs: [...(enterprise.fixed_costs ?? []), { cost_item_id: id, qty: 1 }]
		});
		addMenu = null;
	}

	/** @param {string} id */
	function addVariable(id) {
		if ((enterprise.variable_costs ?? []).some((r) => r.cost_item_id === id)) return;
		scheduleSave({
			variable_costs: [
				...(enterprise.variable_costs ?? []),
				{ cost_item_id: id, units_per_output: 1 }
			]
		});
		addMenu = null;
	}

	/** @param {string} id */
	function addSales(id) {
		if ((enterprise.sales ?? []).some((r) => r.sales_line_id === id)) return;
		const units = Number(enterprise.expected_output_units) || 0;
		scheduleSave({
			sales: [...(enterprise.sales ?? []), { sales_line_id: id, units }]
		});
		addMenu = null;
	}

	/** @param {number} index @param {number} qty */
	function setFixedQty(index, qty) {
		const next = (enterprise.fixed_costs ?? []).map((r, i) =>
			i === index ? { ...r, qty } : r
		);
		scheduleSave({ fixed_costs: next });
	}

	/** @param {number} index */
	function removeFixed(index) {
		scheduleSave({
			fixed_costs: (enterprise.fixed_costs ?? []).filter((_, i) => i !== index)
		});
	}

	/** @param {number} index @param {number} units */
	function setVariablePerOut(index, units) {
		const next = (enterprise.variable_costs ?? []).map((r, i) =>
			i === index ? { ...r, units_per_output: units } : r
		);
		scheduleSave({ variable_costs: next });
	}

	/** @param {number} index */
	function removeVariable(index) {
		scheduleSave({
			variable_costs: (enterprise.variable_costs ?? []).filter((_, i) => i !== index)
		});
	}

	/** @param {number} index @param {number} units */
	function setSalesUnits(index, units) {
		const next = (enterprise.sales ?? []).map((r, i) =>
			i === index ? { ...r, units } : r
		);
		scheduleSave({ sales: next });
	}

	/** @param {number} index */
	function removeSales(index) {
		scheduleSave({
			sales: (enterprise.sales ?? []).filter((_, i) => i !== index)
		});
	}

	/** @param {string} id */
	function toggleProject(id) {
		const cur = enterprise.project_ids ?? [];
		const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
		scheduleSave({ project_ids: next });
	}

	function fixedLineTotal(row) {
		const item = byCost.get(row.cost_item_id);
		if (!item) return 0;
		return (Number(item.amount_cents) || 0) * (Number(row.qty) || 1);
	}

	function variableLineTotal(row) {
		const item = byCost.get(row.cost_item_id);
		if (!item) return 0;
		const output = Number(enterprise.expected_output_units) || 0;
		return (Number(item.amount_cents) || 0) * (Number(row.units_per_output) || 1) * output;
	}

	function salesLineTotal(row) {
		const line = bySales.get(row.sales_line_id);
		if (!line) return 0;
		return (Number(line.price_cents) || 0) * (Number(row.units) || 0);
	}

	const unusedFixed = $derived(
		fixedCatalog.filter(
			(c) => !(enterprise.fixed_costs ?? []).some((r) => r.cost_item_id === c.id)
		)
	);
	const unusedVariable = $derived(
		variableCatalog.filter(
			(c) => !(enterprise.variable_costs ?? []).some((r) => r.cost_item_id === c.id)
		)
	);
	const unusedSales = $derived(
		salesLines.filter(
			(s) => !(enterprise.sales ?? []).some((r) => r.sales_line_id === s.id)
		)
	);
</script>

<header class="detail-top desktop-head">
	<span class="detail-top-label">Enterprise sheet</span>
	<div class="detail-top-actions">
		{#if saving}
			<span class="save-hint">Saving…</span>
		{:else if saveError}
			<span class="save-hint err">{saveError}</span>
		{/if}
		<button type="button" class="icon-hit" aria-label="Close" onclick={clearSelection}>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>
	</div>
</header>

<div class="body sheet">
	<input
		class="title-input"
		value={enterprise.title ?? ''}
		placeholder="Enterprise title"
		oninput={(e) => scheduleSave({ title: e.currentTarget.value })}
	/>

	<div class="gp-card" class:neg={gp.gross_cents < 0}>
		<span class="gp-label">Gross profit</span>
		<span class="gp-value">{formatMoney(gp.gross_cents, enterprise.currency || 'EUR')}</span>
		<span class="gp-break">
			rev {formatMoney(gp.revenue_cents)} − fixed {formatMoney(gp.fixed_cents)} − var
			{formatMoney(gp.variable_cents)}
		</span>
	</div>

	<div class="meta-grid">
		<label class="field">
			<span class="field-label">Output / period</span>
			<input
				class="field-input"
				inputmode="decimal"
				value={enterprise.expected_output_units ?? ''}
				oninput={(e) => scheduleSave({ expected_output_units: parseNum(e.currentTarget.value) })}
			/>
		</label>
		<label class="field">
			<span class="field-label">Unit</span>
			<input
				class="field-input"
				placeholder="dozen, kg…"
				value={enterprise.output_unit_label ?? ''}
				oninput={(e) => scheduleSave({ output_unit_label: e.currentTarget.value })}
			/>
		</label>
		<label class="field">
			<span class="field-label">Status</span>
			<select
				class="field-input"
				value={enterprise.status || 'draft'}
				onchange={(e) => scheduleSave({ status: e.currentTarget.value })}
			>
				<option value="draft">Draft</option>
				<option value="active">Active</option>
				<option value="paused">Paused</option>
				<option value="closed">Closed</option>
			</select>
		</label>
	</div>

	{#if linkedProjects.length}
		<p class="projects-line">
			Projects: {linkedProjects.map((p) => p.title).join(', ')}
		</p>
	{/if}

	<section class="block">
		<div class="block-head">
			<h3>Fixed / capex</h3>
			<div class="add-wrap">
				<button
					type="button"
					class="add-btn"
					disabled={unusedFixed.length === 0}
					onclick={() => (addMenu = addMenu === 'fixed' ? null : 'fixed')}
				>
					+ Add
				</button>
				{#if addMenu === 'fixed'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (addMenu = null)}
					></button>
					<div class="picker">
						{#each unusedFixed as c (c.id)}
							<button type="button" class="picker-opt" onclick={() => addFixed(c.id)}>
								{c.title}
								<span class="muted">{formatMoney(c.amount_cents, c.currency)}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		{#if !(enterprise.fixed_costs ?? []).length}
			<p class="empty-hint">Egg mobile, rent share, insurance…</p>
		{:else}
			<ul class="lines">
				{#each enterprise.fixed_costs ?? [] as row, i (row.cost_item_id)}
					{@const item = byCost.get(row.cost_item_id)}
					<li class="line">
						<div class="line-main">
							<span class="line-title">{item?.title ?? 'Missing cost'}</span>
							<span class="line-meta">
								{#if item}
									{formatMoney(item.amount_cents, item.currency)}
									{#if item.period}· {item.period}{/if}
								{/if}
							</span>
						</div>
						<label class="coef">
							<span class="coef-label">qty</span>
							<input
								class="coef-input"
								inputmode="decimal"
								value={row.qty ?? 1}
								oninput={(e) => setFixedQty(i, parseNum(e.currentTarget.value))}
							/>
						</label>
						<span class="line-total">{formatMoney(fixedLineTotal(row))}</span>
						<button type="button" class="rm" aria-label="Remove" onclick={() => removeFixed(i)}
							>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="block">
		<div class="block-head">
			<h3>Variable</h3>
			<div class="add-wrap">
				<button
					type="button"
					class="add-btn"
					disabled={unusedVariable.length === 0}
					onclick={() => (addMenu = addMenu === 'variable' ? null : 'variable')}
				>
					+ Add
				</button>
				{#if addMenu === 'variable'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (addMenu = null)}
					></button>
					<div class="picker">
						{#each unusedVariable as c (c.id)}
							<button type="button" class="picker-opt" onclick={() => addVariable(c.id)}>
								{c.title}
								<span class="muted"
									>{formatMoney(c.amount_cents, c.currency)}{#if c.unit_label}/ {c.unit_label}{/if}</span
								>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		{#if !(enterprise.variable_costs ?? []).length}
			<p class="empty-hint">Feed, packaging — set units per output</p>
		{:else}
			<ul class="lines">
				{#each enterprise.variable_costs ?? [] as row, i (row.cost_item_id)}
					{@const item = byCost.get(row.cost_item_id)}
					<li class="line">
						<div class="line-main">
							<span class="line-title">{item?.title ?? 'Missing cost'}</span>
							<span class="line-meta">
								{#if item}
									{formatMoney(item.amount_cents, item.currency)}
									{#if item.unit_label}/ {item.unit_label}{/if}
								{/if}
							</span>
						</div>
						<label class="coef">
							<span class="coef-label">per out</span>
							<input
								class="coef-input"
								inputmode="decimal"
								value={row.units_per_output ?? 1}
								oninput={(e) => setVariablePerOut(i, parseNum(e.currentTarget.value))}
							/>
						</label>
						<span class="line-total">{formatMoney(variableLineTotal(row))}</span>
						<button type="button" class="rm" aria-label="Remove" onclick={() => removeVariable(i)}
							>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="block">
		<div class="block-head">
			<h3>Sales</h3>
			<div class="add-wrap">
				<button
					type="button"
					class="add-btn"
					disabled={unusedSales.length === 0}
					onclick={() => (addMenu = addMenu === 'sales' ? null : 'sales')}
				>
					+ Add
				</button>
				{#if addMenu === 'sales'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (addMenu = null)}
					></button>
					<div class="picker">
						{#each unusedSales as s (s.id)}
							<button type="button" class="picker-opt" onclick={() => addSales(s.id)}>
								{s.title}
								<span class="muted"
									>{formatMoney(s.price_cents, s.currency)}{#if s.unit_label}/ {s.unit_label}{/if}</span
								>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		{#if !(enterprise.sales ?? []).length}
			<p class="empty-hint">Price × channel — set sold units</p>
		{:else}
			<ul class="lines">
				{#each enterprise.sales ?? [] as row, i (row.sales_line_id)}
					{@const line = bySales.get(row.sales_line_id)}
					<li class="line">
						<div class="line-main">
							<span class="line-title">{line?.title ?? 'Missing sales'}</span>
							<span class="line-meta">
								{#if line}
									{formatMoney(line.price_cents, line.currency)}
									{#if line.unit_label}/ {line.unit_label}{/if}
									{#if line.channel}· {line.channel}{/if}
								{/if}
							</span>
						</div>
						<label class="coef">
							<span class="coef-label">units</span>
							<input
								class="coef-input"
								inputmode="decimal"
								value={row.units ?? 0}
								oninput={(e) => setSalesUnits(i, parseNum(e.currentTarget.value))}
							/>
						</label>
						<span class="line-total">{formatMoney(salesLineTotal(row))}</span>
						<button type="button" class="rm" aria-label="Remove" onclick={() => removeSales(i)}
							>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="block">
		<div class="block-head">
			<h3>Projects</h3>
			<div class="add-wrap">
				<button
					type="button"
					class="add-btn"
					onclick={() => (addMenu = addMenu === 'projects' ? null : 'projects')}
				>
					Link
				</button>
				{#if addMenu === 'projects'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (addMenu = null)}
					></button>
					<div class="picker">
						{#each projects as p (p.id)}
							<button
								type="button"
								class="picker-opt"
								class:on={(enterprise.project_ids ?? []).includes(p.id)}
								onclick={() => toggleProject(p.id)}
							>
								{p.title}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>
</div>

<style>
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

	.detail-top-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.save-hint {
		font-size: 12px;
		color: var(--fg-33);
	}

	.save-hint.err {
		color: #b44;
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon-hit {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
	}

	.body.sheet {
		padding: 12px 14px 32px;
		overflow: auto;
		flex: 1;
		min-height: 0;
	}

	.title-input {
		width: 100%;
		margin: 0 0 12px;
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 22px;
		font-weight: 650;
		line-height: 1.25;
		color: var(--fg);
	}

	.title-input:focus {
		outline: none;
	}

	.gp-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		margin-bottom: 14px;
		border-radius: 14px;
		background: var(--fg-4);
	}

	.gp-card.neg .gp-value {
		color: var(--fg-66);
	}

	.gp-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.gp-value {
		font-size: 22px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
	}

	.gp-break {
		font-size: 12px;
		color: var(--fg-33);
	}

	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
		margin-bottom: 8px;
	}

	@media (max-width: 520px) {
		.meta-grid {
			grid-template-columns: 1fr 1fr;
		}
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
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
	}

	.projects-line {
		margin: 0 0 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

	.block {
		margin-top: 16px;
	}

	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 6px;
	}

	.block-head h3 {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.add-wrap {
		position: relative;
	}

	.add-btn {
		height: 28px;
		padding: 0 10px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}

	.add-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
	}

	.picker {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 50;
		min-width: 220px;
		max-height: 240px;
		overflow: auto;
		padding: 4px;
		background: var(--glass);
		border: 1px solid var(--glass-border);
		border-radius: 12px;
	}

	.picker-opt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}

	.picker-opt:hover,
	.picker-opt.on {
		background: var(--fg-8);
	}

	.muted {
		font-size: 12px;
		color: var(--fg-33);
	}

	.empty-hint {
		margin: 0;
		padding: 8px 0;
		font-size: 13px;
		color: var(--fg-33);
	}

	.lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.line {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 12px;
		background: var(--fg-4);
	}

	.line-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.line-title {
		font-size: 14px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.line-meta {
		font-size: 12px;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.coef {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}

	.coef-label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.coef-input {
		width: 64px;
		height: 32px;
		padding: 0 8px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.line-total {
		min-width: 72px;
		font-size: 13px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: right;
		color: var(--fg-66);
	}

	.rm {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-33);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}

	.rm:hover {
		background: var(--fg-8);
		color: var(--fg);
	}

	@media (max-width: 420px) {
		.line {
			grid-template-columns: 1fr auto auto;
			grid-template-rows: auto auto;
		}
		.line-main {
			grid-column: 1 / -2;
		}
		.rm {
			grid-row: 1 / 3;
			align-self: center;
		}
		.coef,
		.line-total {
			grid-row: 2;
		}
	}
</style>
