<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		appendTableRow,
		captureForms,
		dataTables,
		tableRows
	} from '$lib/workspace.svelte.js';
	import { activePerson } from '$lib/actor.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';

	const formId = $derived($page.params.id);
	const form = $derived(captureForms.find((f) => f.id === formId));
	const table = $derived(form ? dataTables.find((t) => t.id === form.table_id) : null);

	/** @type {Record<string, string>} */
	let values = $state({});
	let saving = $state(false);
	let savedFlash = $state(false);
	/** @type {string | null} */
	let error = $state(null);

	$effect(() => {
		const f = form;
		const t = table;
		if (!f || !t) return;
		/** @type {Record<string, string>} */
		const next = {};
		for (const field of f.fields || []) {
			const col = (t.columns || []).find((c) => c.key === field.column_key);
			if (!col) continue;
			if (field.default === 'today' || col.type === 'date') {
				next[col.id] = new Date().toISOString().slice(0, 10);
			} else if (col.type === 'number') {
				next[col.id] = '';
			} else {
				next[col.id] = field.default != null ? String(field.default) : '';
			}
		}
		values = next;
	});

	const recent = $derived(
		form ? tableRows.filter((r) => r.table_id === form.table_id).slice(0, 8) : []
	);

	async function submit() {
		if (!form || !table || saving) return;
		error = null;
		/** @type {Record<string, unknown>} */
		const cells = {};
		let occurred = new Date().toISOString().slice(0, 10);
		for (const field of form.fields || []) {
			const col = (table.columns || []).find((c) => c.key === field.column_key);
			if (!col) continue;
			const raw = values[col.id] ?? '';
			if (field.required && String(raw).trim() === '') {
				error = `${col.label} is required`;
				return;
			}
			if (col.type === 'number') {
				const n = Number(String(raw).replace(',', '.'));
				cells[col.id] = Number.isFinite(n) ? n : 0;
			} else if (col.type === 'bool') {
				cells[col.id] = raw === 'true' || raw === '1' || raw === 'on';
			} else {
				cells[col.id] = String(raw);
			}
			if (col.type === 'date' && raw) occurred = String(raw);
		}
		saving = true;
		try {
			await appendTableRow({
				table_id: table.id,
				cells,
				occurred_on: form.occurred_on_field !== false ? occurred : undefined,
				author: activePerson().email || undefined
			});
			savedFlash = true;
			setTimeout(() => (savedFlash = false), 1600);
			for (const field of form.fields || []) {
				const col = (table.columns || []).find((c) => c.key === field.column_key);
				if (!col) continue;
				if (col.type === 'number') values[col.id] = '';
				else if (col.type === 'date' || field.default === 'today') {
					values[col.id] = new Date().toISOString().slice(0, 10);
				}
			}
			values = { ...values };
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>{form?.title || 'Capture'}</title></svelte:head>

<div class="capture">
	<header class="top">
		<button type="button" class="back" onclick={() => goto('/entreprises')}>←</button>
		<h1>{form?.title || 'Capture'}</h1>
	</header>

	{#if driveSession.error}
		<p class="err">{driveSession.error}</p>
	{/if}
	{#if !appBoot.listsReady && !form}
		<p class="hint">Loading…</p>
	{:else if !form}
		<p class="err">Form not found</p>
	{:else if !table}
		<p class="err">Table missing for this form</p>
	{:else}
		<form
			class="card"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			{#each form.fields || [] as field (field.column_key)}
				{@const col = (table.columns || []).find((c) => c.key === field.column_key)}
				{#if col}
					<label class="field">
						<span>{col.label}{#if col.unit} ({col.unit}){/if}</span>
						{#if col.type === 'bool'}
							<input
								type="checkbox"
								checked={values[col.id] === 'true' || values[col.id] === '1'}
								onchange={(e) => {
									values[col.id] = e.currentTarget.checked ? 'true' : 'false';
									values = { ...values };
								}}
							/>
						{:else if col.type === 'date'}
							<input type="date" bind:value={values[col.id]} required={field.required !== false} />
						{:else if col.type === 'number'}
							<input
								type="number"
								inputmode="decimal"
								step="any"
								bind:value={values[col.id]}
								required={field.required !== false}
							/>
						{:else}
							<input type="text" bind:value={values[col.id]} required={field.required !== false} />
						{/if}
					</label>
				{/if}
			{/each}
			{#if error}<p class="err">{error}</p>{/if}
			<button type="submit" class="submit" disabled={saving}>
				{saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}
			</button>
		</form>

		<section class="recent">
			<h2>Recent</h2>
			{#if recent.length === 0}
				<p class="hint">No rows yet</p>
			{:else}
				<ul>
					{#each recent as row (row.id)}
						<li>
							<span class="when">{row.occurred_on || row.created_at?.slice(0, 10)}</span>
							<span class="vals">
								{#each table.columns || [] as c (c.id)}
									{c.label}: {row.cells?.[c.id] ?? '—'}{' '}
								{/each}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
	.capture {
		min-height: 100dvh;
		padding: 12px 16px calc(24px + env(safe-area-inset-bottom));
		background: var(--shell, var(--bg));
		color: var(--fg);
		box-sizing: border-box;
	}

	.top {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 16px;
		padding-top: env(safe-area-inset-top, 0px);
	}

	.back {
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg);
		font-size: 1.125rem;
		cursor: pointer;
	}

	h1 {
		margin: 0;
		font-size: 1.375rem;
		font-weight: 700;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px;
		border-radius: 16px;
		background: var(--fg-4);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--fg-66);
	}

	.field input[type='text'],
	.field input[type='number'],
	.field input[type='date'] {
		height: 48px;
		border: 0;
		border-radius: 12px;
		background: var(--bg, #111);
		color: var(--fg);
		font: inherit;
		font-size: 1.125rem;
		font-weight: 500;
		padding: 0 14px;
	}

	.submit {
		height: 52px;
		border: 0;
		border-radius: 14px;
		background: var(--button-primary-bg, var(--fg-8));
		color: var(--button-primary-fg, var(--fg));
		font: inherit;
		font-size: 1rem;
		font-weight: 650;
		cursor: pointer;
		margin-top: 4px;
	}

	.submit:disabled {
		opacity: 0.55;
	}

	.err {
		color: #b44;
		font-size: 0.8125rem;
		margin: 0;
	}

	.hint {
		color: var(--fg-33);
		font-size: 0.8125rem;
	}

	.recent {
		margin-top: 28px;
	}

	.recent h2 {
		margin: 0 0 10px;
		font-size: 0.875rem;
		font-weight: 650;
		color: var(--fg-66);
	}

	.recent ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.recent li {
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--fg-4);
		font-size: 0.8125rem;
	}

	.when {
		display: block;
		color: var(--fg-33);
		font-size: 0.6875rem;
		margin-bottom: 2px;
	}

	.vals {
		color: var(--fg-66);
		line-height: 1.35;
	}
</style>
