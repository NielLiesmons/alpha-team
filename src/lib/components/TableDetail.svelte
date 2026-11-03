<script>
	import { goto } from '$app/navigation';
	import FloatPanel from './FloatPanel.svelte';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import Pen from './icons/Pen.svelte';
	import { parentEnterpriseId } from '$lib/entity-routes.js';
	import { unitSuffix } from '$lib/format-value.js';
	import {
		appendTableRow,
		captureForms,
		clearSelection,
		enterprises,
		saveCaptureForm,
		saveDataTable,
		saveTableRow,
		selectEntity,
		tableRows,
		ui
	} from '$lib/workspace.svelte.js';

	/** @type {{ table: any }} */
	let { table } = $props();

	let saving = $state(false);
	/** @type {string | null} */
	let err = $state(null);
	/** @type {null | 'key' | 'enterprise'} */
	let menu = $state(null);
	/** @type {number | null} */
	let editIdx = $state(null);
	let draftLabel = $state('');
	let draftKey = $state('');
	let draftType = $state('text');
	let draftUnit = $state('');
	let keyDraft = $state('');

	/** @type {HTMLButtonElement | undefined} */
	let keyBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let entBtn = $state();

	const rows = $derived(tableRows.filter((r) => r.table_id === table.id));
	const formsForTable = $derived(captureForms.filter((f) => f.table_id === table.id));
	const parentId = $derived(table.enterprise_id || parentEnterpriseId(ui.selection));
	const enterprise = $derived(
		enterprises.find((e) => String(e.id) === String(table.enterprise_id)) ?? null
	);

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

	function openFieldEdit(/** @type {number} */ i) {
		const c = (table.columns || [])[i];
		if (!c) return;
		editIdx = i;
		draftLabel = c.label || '';
		draftKey = c.key || '';
		draftType = c.type || 'text';
		draftUnit = c.unit || '';
	}

	function closeFieldEdit() {
		editIdx = null;
	}

	async function saveFieldEdit() {
		if (editIdx == null) return;
		const i = editIdx;
		const cols = (table.columns || []).map((c, idx) => {
			if (idx !== i) return c;
			return {
				...c,
				label: draftLabel.trim() || c.label,
				key:
					draftKey.trim() ||
					String(draftLabel)
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '_')
						.replace(/^_|_$/g, '') ||
					c.key,
				type: draftType,
				unit: draftUnit.trim()
			};
		});
		await persist({ columns: cols });
		closeFieldEdit();
	}

	async function removeField() {
		if (editIdx == null) return;
		const i = editIdx;
		closeFieldEdit();
		await persist({ columns: (table.columns || []).filter((_, idx) => idx !== i) });
	}

	async function addField() {
		const id = crypto.randomUUID().slice(0, 8);
		const n = (table.columns || []).length + 1;
		await persist({
			columns: [
				...(table.columns || []),
				{ id, key: `field_${n}`, label: `Field ${n}`, type: 'number', unit: '' }
			]
		});
		openFieldEdit((table.columns || []).length - 1);
	}

	async function addEntry() {
		/** @type {Record<string, unknown>} */
		const cells = {};
		for (const c of table.columns || []) {
			cells[c.id] = c.type === 'number' ? 0 : c.type === 'bool' ? false : '';
			if (c.key) cells[c.key] = cells[c.id];
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
		const col = (table.columns || []).find((c) => c.id === colId || c.key === colId);
		const cells = { ...row.cells, [colId]: v };
		if (col?.id) cells[col.id] = v;
		if (col?.key) cells[col.key] = v;
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

	function backToEnterprise() {
		if (parentId) selectEntity('enterprise', parentId);
		else clearSelection();
	}

	function openKeyMenu() {
		keyDraft = table.key ?? '';
		menu = menu === 'key' ? null : 'key';
	}

	async function commitKey() {
		const next = keyDraft.trim();
		menu = null;
		if (next && next !== table.key) await persist({ key: next });
	}

	async function setEnterprise(/** @type {string | null} */ id) {
		menu = null;
		await persist({ enterprise_id: id });
	}
</script>

<header class="detail-top desktop-head">
	<div class="detail-top-start">
		{#if parentId}
			<button type="button" class="icon-hit" aria-label="Back to enterprise" onclick={backToEnterprise}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M10 3.5 5.5 8 10 12.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		{/if}
		<span class="detail-top-label">Table</span>
	</div>
	<div class="detail-top-actions">
		{#if saving}<span class="save-hint">Saving…</span>{/if}
		{#if err}<span class="save-hint err">{err}</span>{/if}
		<button type="button" class="linkish" onclick={() => void ensureCaptureForm()}>Capture</button>
		<button type="button" class="linkish" onclick={() => void addField()}>+ Field</button>
		<button type="button" class="linkish" onclick={() => void addEntry()}>+ Entry</button>
	</div>
</header>

<div class="body">
	<input
		class="title-input"
		value={table.title ?? ''}
		placeholder="Untitled"
		oninput={(e) => void persist({ title: e.currentTarget.value })}
	/>

	<div class="meta-row" role="list">
		<div class="meta-item" role="listitem">
			<button
				bind:this={keyBtn}
				type="button"
				class="meta-pill"
				class:empty={!table.key}
				aria-label="Key"
				aria-expanded={menu === 'key'}
				onclick={openKeyMenu}
			>
				<span class="pill-k">Key</span>
				<span class="pill-v">{table.key || '—'}</span>
			</button>
		</div>
		<div class="meta-item" role="listitem">
			<button
				bind:this={entBtn}
				type="button"
				class="meta-pill"
				class:empty={!enterprise}
				aria-label="Enterprise"
				aria-expanded={menu === 'enterprise'}
				onclick={() => (menu = menu === 'enterprise' ? null : 'enterprise')}
			>
				{#if enterprise}
					<EnterpriseBox state={enterprise.status ?? 'active'} icon={enterprise.icon} size={18} />
					<span class="pill-v">{enterprise.title}</span>
				{:else}
					<span class="pill-v muted">Enterprise</span>
				{/if}
			</button>
		</div>
	</div>

	{#if !(table.columns || []).length}
		<p class="hint">Add a field to start logging.</p>
	{:else}
		<div class="grid-wrap">
			<table class="grid">
				<thead>
					<tr>
						<th class="when">When</th>
						{#each table.columns as c, ci (c.id || c.key || ci)}
							<th>
								<button type="button" class="th-btn" onclick={() => openFieldEdit(ci)}>
									<span class="th-label">{c.label}{unitSuffix(c.unit)}</span>
									<span class="th-pen" aria-hidden="true"><Pen size={12} /></span>
								</button>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if rows.length === 0}
						<tr>
							<td class="empty-cell" colspan={(table.columns || []).length + 1}
								>Nothing logged yet</td
							>
						</tr>
					{:else}
						{#each rows as row (row.id)}
							<tr>
								<td class="muted">{row.occurred_on || row.created_at?.slice(0, 10) || ''}</td>
								{#each table.columns as c, ci (c.id || c.key || ci)}
									<td>
										<input
											class="cell"
											value={row.cells?.[c.id] ?? row.cells?.[c.key] ?? ''}
											onchange={(e) =>
												setCell(row, c.id || c.key, e.currentTarget.value, c.type)}
										/>
									</td>
								{/each}
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<FloatPanel
	open={menu === 'key'}
	anchor={keyBtn}
	placement="below"
	width={260}
	maxHeight={160}
	onclose={() => (menu = null)}
>
	<div class="key-edit">
		<label>
			<span>Key</span>
			<input
				bind:value={keyDraft}
				placeholder="egg_actuals"
				onkeydown={(e) => e.key === 'Enter' && void commitKey()}
			/>
		</label>
		<button type="button" class="done" onclick={() => void commitKey()}>Done</button>
	</div>
</FloatPanel>

<FloatPanel
	open={menu === 'enterprise'}
	anchor={entBtn}
	placement="below"
	width={260}
	maxHeight={280}
	onclose={() => (menu = null)}
>
	<div class="float-list" role="listbox">
		<button type="button" class="option" onclick={() => void setEnterprise(null)}>
			<span class="option-text muted">None</span>
		</button>
		{#each enterprises as ent (ent.id)}
			<button
				type="button"
				class="option"
				class:active={String(table.enterprise_id) === String(ent.id)}
				onclick={() => void setEnterprise(ent.id)}
			>
				<EnterpriseBox state={ent.status ?? 'active'} icon={ent.icon} size={18} />
				<span class="option-text">{ent.title}</span>
			</button>
		{/each}
	</div>
</FloatPanel>

{#if editIdx !== null}
	<div class="modal-scrim" role="presentation" onclick={closeFieldEdit}></div>
	<div class="field-modal" role="dialog" aria-label="Edit field">
		<h3>Edit field</h3>
		<label>
			<span>Label</span>
			<input bind:value={draftLabel} />
		</label>
		<label>
			<span>Key</span>
			<input bind:value={draftKey} />
		</label>
		<label>
			<span>Type</span>
			<select bind:value={draftType}>
				<option value="number">number</option>
				<option value="text">text</option>
				<option value="date">date</option>
				<option value="bool">bool</option>
				<option value="select">select</option>
			</select>
		</label>
		<label>
			<span>Unit</span>
			<input bind:value={draftUnit} placeholder="EUR, %, g…" />
		</label>
		<div class="modal-actions">
			<button type="button" class="danger" onclick={() => void removeField()}>Remove</button>
			<button type="button" class="ghost" onclick={closeFieldEdit}>Cancel</button>
			<button type="button" class="primary" onclick={() => void saveFieldEdit()}>Save</button>
		</div>
	</div>
{/if}

<style>
	.body {
		padding: 48px 20px 48px;
		overflow: auto;
		min-height: 0;
		flex: 1;
	}

	@media (min-width: 768px) {
		.body {
			padding-left: 24px;
			padding-right: 24px;
		}
	}
	.title-input {
		width: 100%;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 22px;
		font-weight: 650;
		color: var(--fg);
		padding: 0;
		margin: 0 0 10px;
	}
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0 0 16px;
	}
	.meta-item {
		display: flex;
	}
	.meta-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.meta-pill:hover,
	.meta-pill[aria-expanded='true'] {
		background: var(--fg-8);
		color: var(--fg);
	}
	.meta-pill.empty {
		color: var(--fg-33);
	}
	.pill-k {
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}
	.pill-v {
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pill-v.muted,
	.muted {
		color: var(--fg-33);
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
		font-size: 13px;
	}
	.grid th {
		text-align: left;
		padding: 0;
		border-bottom: 1px solid var(--fg-8);
	}
	.grid th.when {
		padding: 8px 8px 8px 0;
		font-size: 11px;
		font-weight: 650;
		color: var(--fg-33);
		white-space: nowrap;
	}
	.th-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 8px;
		border: 0;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 11px;
		font-weight: 650;
		text-align: left;
		cursor: pointer;
	}
	.th-btn:hover {
		color: var(--fg);
	}
	.th-pen {
		opacity: 0;
		display: inline-flex;
		color: var(--fg-66);
	}
	.th-btn:hover .th-pen {
		opacity: 1;
	}
	.grid td {
		padding: 4px 6px;
		border-bottom: 1px solid var(--fg-4);
	}
	.grid td.muted {
		padding-left: 0;
		white-space: nowrap;
	}
	.empty-cell {
		padding: 16px 0 !important;
		color: var(--fg-33);
		font-size: 13px;
	}
	.cell {
		width: 100%;
		min-width: 64px;
		border: 0;
		background: transparent;
		color: var(--fg);
		font: inherit;
		padding: 4px;
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
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.linkish:hover {
		color: var(--fg);
	}
	.key-edit {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
	}
	.key-edit label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}
	.key-edit input {
		height: 32px;
		padding: 0 8px;
		border: 1px solid var(--fg-8);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
	}
	.done {
		align-self: flex-end;
		height: 30px;
		padding: 0 12px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.float-list {
		display: flex;
		flex-direction: column;
		padding: 6px;
	}
	.option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}
	.option:hover,
	.option.active {
		background: var(--fg-8);
	}
	.option-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.modal-scrim {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: color-mix(in srgb, var(--fg) 20%, transparent);
	}
	.field-modal {
		position: fixed;
		z-index: 71;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 32px));
		padding: 18px 18px 14px;
		border-radius: 14px;
		background: var(--popover, var(--bg));
		border: 1px solid var(--fg-8);
		box-shadow: 0 16px 48px var(--shadow, rgba(0, 0, 0, 0.25));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field-modal h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		color: var(--fg);
	}
	.field-modal label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}
	.field-modal input,
	.field-modal select {
		height: 34px;
		padding: 0 10px;
		border: 1px solid var(--fg-8);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
	}
	.modal-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	.modal-actions .danger {
		margin-right: auto;
		border: 0;
		background: transparent;
		color: var(--destructive, #b44);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.modal-actions .ghost,
	.modal-actions .primary {
		height: 32px;
		padding: 0 12px;
		border: 0;
		border-radius: 8px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.modal-actions .ghost {
		background: transparent;
		color: var(--fg-66);
	}
	.modal-actions .primary {
		background: var(--fg);
		color: var(--bg);
	}
</style>
