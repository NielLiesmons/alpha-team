<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import Spinner from './Spinner.svelte';
	import { closeComposer, projects, saveActivity, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let description = $state('');
	let unitLabel = $state('units');
	let fixed = $state('');
	let variable = $state('');
	let price = $state('');
	let units = $state('');
	let channel = $state('farmgate');
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	let saving = $state(false);
	/** @type {null | 'projects' | 'channel'} */
	let bottomMenu = $state(null);

	const CHANNELS = [
		{ id: 'farmgate', label: 'Farm gate' },
		{ id: 'market', label: 'Market' },
		{ id: 'boutique', label: 'Boutique' },
		{ id: 'csa', label: 'CSA' },
		{ id: 'pro', label: 'Pro' },
		{ id: 'web', label: 'Web' }
	];

	const open = $derived(ui.composer?.kind === 'activity');

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
		title = '';
		description = '';
		unitLabel = 'units';
		fixed = '';
		variable = '';
		price = '';
		units = '';
		channel = 'farmgate';
		projectIds = [];
		saving = false;
		bottomMenu = null;
		tick().then(() => titleInput?.focus());
	});

	/** @param {string} id */
	function toggleProject(id) {
		if (projectIds.includes(id)) projectIds = projectIds.filter((p) => p !== id);
		else projectIds = [...projectIds, id];
	}

	function eurosToCents(raw) {
		const cleaned = String(raw).trim().replace(',', '.').replace(/[^\d.]/g, '');
		if (!cleaned) return 0;
		const n = Number(cleaned);
		if (!Number.isFinite(n) || n < 0) return 0;
		if (!cleaned.includes('.')) return Math.round(n * 100);
		return Math.round(n * 100);
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle || saving) return;
		saving = true;
		try {
			const pending = saveActivity(
				{
					title: nextTitle,
					description: description.trim(),
					status: 'draft',
					project_ids: projectIds,
					fixed_cost_cents_month: eurosToCents(fixed),
					variable_cost_per_unit_cents: eurosToCents(variable),
					price_per_unit_cents: eurosToCents(price),
					expected_units_month: Number(String(units).replace(',', '.')) || 0,
					unit_label: unitLabel.trim() || 'units',
					channels: channel ? [channel] : [],
					currency: 'EUR'
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

<CreateSheet {open} label="New activity" onclose={closeComposer}>
	<div class="sheet-title-row">
		<input
			bind:this={titleInput}
			class="sheet-input"
			placeholder="Activity title (e.g. Laying hens)"
			bind:value={title}
		/>
	</div>
	<div class="form-divider"></div>
	<div class="fields">
		<label class="field">
			<span class="field-label">Fixed € / month</span>
			<input class="field-input" inputmode="decimal" placeholder="0" bind:value={fixed} />
		</label>
		<label class="field">
			<span class="field-label">Variable € / unit</span>
			<input class="field-input" inputmode="decimal" placeholder="0" bind:value={variable} />
		</label>
		<label class="field">
			<span class="field-label">Price € / unit</span>
			<input class="field-input" inputmode="decimal" placeholder="0" bind:value={price} />
		</label>
		<label class="field">
			<span class="field-label">Units / month</span>
			<input class="field-input" inputmode="decimal" placeholder="0" bind:value={units} />
		</label>
		<label class="field wide">
			<span class="field-label">Unit label</span>
			<input class="field-input" placeholder="dozen, litre, kg…" bind:value={unitLabel} />
		</label>
		<label class="field wide">
			<span class="field-label">Notes</span>
			<input class="field-input" placeholder="Optional" bind:value={description} />
		</label>
	</div>
	<div class="form-divider"></div>
	<div class="task-bottom-row">
		<div class="bottom-pills">
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
						{#each projects as project (project.id)}
							{@const on = projectIds.includes(project.id)}
							<button type="button" class="option" class:active={on} onclick={() => toggleProject(project.id)}>
								<span>{project.title}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
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
		</div>
		<button type="button" class="publish-btn" disabled={!title.trim() || saving} onclick={save}>
			{#if saving}
				<Spinner size={14} label="Saving" />
			{/if}
			Create
		</button>
	</div>
</CreateSheet>

<style>
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px 12px;
		padding: 12px 16px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.field.wide {
		grid-column: 1 / -1;
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
		outline: none;
		box-sizing: border-box;
	}

	.field-input::placeholder {
		color: var(--fg-33);
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
	}

	.meta-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: var(--ctrl-h);
		padding: 0 14px 0 10px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		font-size: 14px;
		font-weight: 500;
		color: var(--fg-66);
		cursor: pointer;
		font-family: inherit;
	}

	.meta-pill.empty {
		color: var(--fg-33);
		padding-left: 12px;
	}

	.meta-pill:hover {
		background: var(--fg-8);
	}

	.pill-names {
		color: var(--fg);
	}

	.pill-projects {
		display: flex;
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
		min-width: 180px;
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

	.publish-btn {
		height: var(--ctrl-h);
		min-height: var(--ctrl-h);
		padding: 0 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 1px solid transparent;
		border-radius: 9999px;
		background:
			var(--button-primary-bg) padding-box,
			var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		flex-shrink: 0;
		margin-left: auto;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition: transform 0.2s var(--ease);
	}

	.publish-btn:hover:not(:disabled) {
		transform: scale(1.015);
	}

	.publish-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
