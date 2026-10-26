<script>
	import { goto } from '$app/navigation';
	import {
		clearSelection,
		dataTables,
		enterprises,
		saveCaptureForm
	} from '$lib/workspace.svelte.js';

	/** @type {{ form: any }} */
	let { form } = $props();

	const table = $derived(dataTables.find((t) => t.id === form.table_id));

	async function persist(patch) {
		Object.assign(form, patch);
		if (patch.fields) form.fields = [...patch.fields];
		await saveCaptureForm({ ...form }, false);
	}

	function syncFieldsFromTable() {
		if (!table) return;
		void persist({
			fields: (table.columns || []).map((c) => ({
				column_key: c.key,
				required: true,
				default: c.type === 'date' ? 'today' : undefined
			}))
		});
	}
</script>

<header class="detail-top desktop-head">
	<span class="detail-top-label">Capture form</span>
	<div class="actions">
		<button type="button" class="linkish" onclick={() => goto(`/capture/${form.id}`)}>Open</button>
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
		value={form.title ?? ''}
		placeholder="Log eggs"
		oninput={(e) => void persist({ title: e.currentTarget.value })}
	/>
	<label class="field">
		<span>Table</span>
		<select
			value={form.table_id ?? ''}
			onchange={(e) => void persist({ table_id: e.currentTarget.value })}
		>
			{#each dataTables as t (t.id)}
				<option value={t.id}>{t.title}</option>
			{/each}
		</select>
	</label>
	<label class="field">
		<span>Enterprise</span>
		<select
			value={form.enterprise_id ?? ''}
			onchange={(e) => void persist({ enterprise_id: e.currentTarget.value || null })}
		>
			<option value="">—</option>
			{#each enterprises as ent (ent.id)}
				<option value={ent.id}>{ent.title}</option>
			{/each}
		</select>
	</label>
	<div class="block-head">
		<span class="label">Fields</span>
		<button type="button" class="add" onclick={syncFieldsFromTable}>Sync from table</button>
	</div>
	<ul class="fields">
		{#each form.fields || [] as f, i (f.column_key + i)}
			<li>{f.column_key}{#if f.required} · required{/if}</li>
		{/each}
	</ul>
	<p class="hint">Phone: open Capture — same Drive rows appear in the table editor.</p>
</div>

<style>
	.detail-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 48px;
		padding: 0 8px 0 16px;
	}
	.detail-top-label {
		font-size: 13px;
		color: var(--fg-33);
	}
	.actions {
		display: flex;
		gap: 6px;
		align-items: center;
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
	}
	.title-input {
		width: 100%;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 1.35rem;
		font-weight: 700;
		margin-bottom: 14px;
		outline: none;
		color: var(--fg);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.field select {
		height: 34px;
		border: 1px solid var(--fg-8);
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 400;
		text-transform: none;
		padding: 0 10px;
	}
	.block-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 8px 0;
	}
	.label {
		font-size: 13px;
		font-weight: 650;
		color: var(--fg);
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
	.fields {
		margin: 0;
		padding-left: 18px;
		color: var(--fg-66);
		font-size: 13px;
	}
	.hint {
		margin-top: 16px;
		font-size: 12px;
		color: var(--fg-33);
	}
</style>
