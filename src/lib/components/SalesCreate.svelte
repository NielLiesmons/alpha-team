<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import Spinner from './Spinner.svelte';
	import { closeComposer, saveSalesLine, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let price = $state('');
	let unitLabel = $state('');
	let channel = $state('farmgate');
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	let saving = $state(false);
	/** @type {null | 'channel'} */
	let bottomMenu = $state(null);

	const CHANNELS = [
		{ id: 'farmgate', label: 'Farm gate' },
		{ id: 'market', label: 'Market' },
		{ id: 'boutique', label: 'Boutique' },
		{ id: 'csa', label: 'CSA' },
		{ id: 'pro', label: 'Pro' },
		{ id: 'web', label: 'Web' }
	];

	const open = $derived(ui.composer?.kind === 'sales');

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
		price = '';
		unitLabel = '';
		channel = 'farmgate';
		tick().then(() => titleInput?.focus());
	});

	function eurosToCents(raw) {
		const cleaned = String(raw).trim().replace(',', '.').replace(/[^\d.]/g, '');
		if (!cleaned) return 0;
		const n = Number(cleaned);
		if (!Number.isFinite(n) || n < 0) return 0;
		return Math.round(n * 100);
	}

	async function save() {
		if (!title.trim() || !eurosToCents(price) || saving) return;
		saving = true;
		try {
			const pending = saveSalesLine(
				{
					title: title.trim(),
					price_cents: eurosToCents(price),
					unit_label: unitLabel.trim(),
					channel
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

<CreateSheet {open} sheetId="sales-create" label="New sales line" onclose={closeComposer}>
	<div class="sheet-title-row">
		<input bind:this={titleInput} class="sheet-input" placeholder="Sales line title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<div class="amount-row">
		<span class="currency">€</span>
		<input class="sheet-input amount" placeholder="0.00" inputmode="decimal" bind:value={price} />
		<span class="per">/</span>
		<input class="unit" placeholder="unit" bind:value={unitLabel} />
	</div>
	<div class="form-divider"></div>
	<div class="task-bottom-row">
		<div class="pill-wrap">
			<button
				type="button"
				class="meta-pill"
				onclick={() => (bottomMenu = bottomMenu === 'channel' ? null : 'channel')}
			>
				{CHANNELS.find((c) => c.id === channel)?.label ?? 'Channel'}
			</button>
			{#if bottomMenu === 'channel'}
				<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
				></button>
				<div class="bottom-menu">
					{#each CHANNELS as c (c.id)}
						<button
							type="button"
							class="option"
							class:active={channel === c.id}
							onclick={() => {
								channel = c.id;
								bottomMenu = null;
							}}>{c.label}</button
						>
					{/each}
				</div>
			{/if}
		</div>
		<button
			type="button"
			class="publish-btn"
			disabled={!title.trim() || !eurosToCents(price) || saving}
			onclick={save}
		>
			{#if saving}<Spinner size={14} label="Saving" />{/if}
			Add
		</button>
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
		font-size: 20px;
		font-weight: 600;
		color: var(--fg-33);
	}
	.amount {
		font-size: 20px !important;
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
		font-size: 14px;
	}
	.task-bottom-row {
		--ctrl-h: 36px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px 0;
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
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
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
