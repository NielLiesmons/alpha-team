<script>
	import { goto } from '$app/navigation';
	import {
		appendTableRow,
		captureForms,
		clearSelection,
		enterprises,
		saveCaptureForm,
		saveDataTable,
		saveTableRow,
		tableRows
	} from '$lib/workspace.svelte.js';

	/** @type {{ table: any }} */
	let { table } = $props();

	let saving = $state(false);
	/** @type {string | null} */
	let err = $state(null);

	const rows = $derived(tableRows.filter((r) => r.table_id === table.id));
	const formsForTable = $derived(captureForms.filter((f) => f.table_id === table.id));

	/** @param {Partial<any>} patch */
	async function persist(patch) {
		Object.assign(table, patch);
		if (patch.columns) table.columns = [...patch.columns];
		saving = true;
		err = null;
		try {
			await saveDataTable({ ...table }, false);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	function addColumn() {
		const id = crypto.randomUUID().slice(0, 8);
		const cols = [
			...(table.columns || []),
			{ id, key: `col_${(table.columns || []).length + 1}`, label: 'New column', type: 'number' }
		];
		void persist({ columns: cols });
	}

	/** @param {number} i @param {string} field @param {string} value */
	function setCol(i, field, value) {
		const cols = (table.columns || []).map((c, idx) => {
			if (idx !== i) return c;
			const next = { ...c, [field]: value };
			if (field === 'label' && (!c.key || c.key.startsWith('col_'))) {
				next.key = String(value)
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '_')
					.replace(/^_|_$/g, '') || c.key;
			}
			return next;
		});
		void persist({ columns: cols });
	}

	/** @param {number} i */
	function removeCol(i) {
		void persist({ columns: (table.columns || []).filter((_, idx) => idx !== i) });
	}

	async function addRow() {
		/** @type {Record<string, unknown>} */
		const cells = {};
		for (const c of table.columns || []) {
			cells[c.id] = c.type === 'number' ? 0 : c.type === 'bool' ? false : '';
		}
		await appendTableRow({
			table_id: table.id,
			cells,
			occurred_on: new Date().toISOString().slice(0, 10)
		});
	}

	/**
	 * @param {any} row
	 * @param {string} colId
	 * @param {string} raw
	 * @param {string} type
	 */
	function setCell(row, colId, raw, type) {
		let v = raw;
		if (type === 'number') {
			const n = Number(String(raw).replace(',', '.'));
			v = Number.isFinite(n) ? n : 0;
		} else if (type === 'bool') {
			v = raw === 'true' || raw === '1';
		}
		const cells = { ...row.cells, [colId]: v };
		void saveTableRow({ ...row, cells });
	}

	async function ensureCaptureForm() {
		if (formsForTable.length) {
			void goto(`/capture/${formsForTable[0].id}`);
			return;
		}
		const fields = (table.columns || []).map((c) => ({
			column_key: c.key,
			required: true,
			default: c.type === 'date' ? 'today' : undefined
		}));
		const created = await saveCaptureForm(
			{
				title: `Log · ${table.title}`,
				table_id: table.id,
				enterprise_id: table.enterprise_id ?? null,
				fields
			},
			true
		);
		void goto(`/capture/${created.id}`);
	}
</script>

<header class="detail-top desktop-head">
	<span class="detail-top-label">Table</span>
	<div class="detail-top-actions">
		{#if saving}<span class="save-hint">Saving…</span>{/if}
		{#if err}<span class="save-hint err">{err}</span>{/if}
		<button type="button" class="linkish" onclick={() => void ensureCaptureForm()}>Capture</button>
		<button type="button" class="icon-hit" aria-label="Close" onclick={clearSelection}>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>
	</div>
</header>

<div class="body">
	<input
		class="title-input"
		value={table.title ?? ''}
		placeholder="Table title"
		oninput={(e) => void persist({ title: e.currentTarget.value })}
	/>
	<div class="meta">
		<label>
			<span>Key</span>
			<input
				value={table.key ?? ''}
				placeholder="egg_actuals"
				oninput={(e) => void persist({ key: e.currentTarget.value })}
			/>
		</label>
		<label>
			<span>Enterprise</span>
			<select
				value={table.enterprise_id ?? ''}
				onchange={(e) =>
					void persist({ enterprise_id: e.currentTarget.value || null })
				}
			>
				<option value="">—</option>
				{#each enterprises as ent (ent.id)}
					<option value={ent.id}>{ent.title}</option>
				{/each}
			</select>
		</label>
	</div>

	<section class="block">
		<div class="block-head">
			<h3>Columns</h3>
			<button type="button" class="add" onclick={addColumn}>+ Column</button>
		</div>
		{#each table.columns || [] as col, i (col.id)}
			<div class="col-row">
				<input value={col.label} oninput={(e) => setCol(i, 'label', e.currentTarget.value)} />
				<input value={col.key} oninput={(e) => setCol(i, 'key', e.currentTarget.value)} />
				<select value={col.type} onchange={(e) => setCol(i, 'type', e.currentTarget.value)}>
					<option value="number">number</option>
					<option value="text">text</option>
					<option value="date">date</option>
					<option value="bool">bool</option>
					<option value="select">select</option>
				</select>
				<button type="button" class="rm" aria-label="Remove" onclick={() => removeCol(i)}>×</button>
			</div>
		{/each}
	</section>

	<section class="block">
		<div class="block-head">
			<h3>Rows ({rows.length})</h3>
			<button type="button" class="add" onclick={() => void addRow()}>+ Row</button>
		</div>
		{#if !(table.columns || []).length}
			<p class="hint">Add columns first.</p>
		{:else if rows.length === 0}
			<p class="hint">No rows — add here or use Capture on phone.</p>
		{:else}
			<div class="grid-wrap">
				<table class="grid">
					<thead>
						<tr>
							<th>When</th>
							{#each table.columns as c (c.id)}
								<th>{c.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.id)}
							<tr>
								<td class="muted">{row.occurred_on || row.created_at?.slice(0, 10) || ''}</td>
								{#each table.columns as c (c.id)}
									<td>
										<input
											class="cell"
											value={row.cells?.[c.id] ?? ''}
											onchange={(e) => setCell(row, c.id, e.currentTarget.value, c.type)}
										/>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.detail-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		height: 48px;
		padding: 0 8px 0 16px;
	}
	.detail-top-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
	}
	.detail-top-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.save-hint {
		font-size: 11px;
		color: var(--fg-33);
	}
	.save-hint.err {
		color: #b44;
	}
	.linkish {
		border: 0;
		background: var(--fg-8);
		color: var(--fg);
		height: 28px;
		padding: 0 10px;
		border-radius: 8px;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.icon-hit {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg-66);
		cursor: pointer;
	}
	.body {
		padding: 8px 16px 32px;
		overflow: auto;
	}
	.title-input {
		width: 100%;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--fg);
		margin: 0 0 12px;
		outline: none;
	}
	.meta {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-bottom: 18px;
	}
	.meta label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.meta input,
	.meta select {
		height: 34px;
		border: 1px solid var(--fg-8);
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		padding: 0 10px;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}
	.block {
		margin-bottom: 20px;
	}
	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.block-head h3 {
		margin: 0;
		font-size: 13px;
		font-weight: 650;
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
	.col-row {
		display: grid;
		grid-template-columns: 1.2fr 1fr 0.8fr 28px;
		gap: 6px;
		margin-bottom: 6px;
	}
	.col-row input,
	.col-row select {
		height: 32px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 12px;
		padding: 0 8px;
	}
	.rm {
		border: 0;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
		font-size: 16px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--fg-33);
	}
	.grid-wrap {
		overflow: auto;
	}
	.grid {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	.grid th,
	.grid td {
		padding: 4px 6px;
		border-bottom: 1px solid var(--fg-8);
		text-align: left;
	}
	.grid th {
		color: var(--fg-33);
		font-weight: 600;
	}
	.cell {
		width: 100%;
		min-width: 64px;
		border: 0;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 12px;
		padding: 4px 0;
	}
	.muted {
		color: var(--fg-33);
		white-space: nowrap;
	}
</style>
