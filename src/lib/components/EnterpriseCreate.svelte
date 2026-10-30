<script>
	import CreateSheet from './CreateSheet.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import { closeComposer, enterprises, saveEnterprise, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let description = $state('');
	/** @type {string | null} */
	let icon = $state(null);
	let iconOpen = $state(false);
	/** @type {HTMLButtonElement | undefined} */
	let iconBtn = $state();

	const editing = $derived(
		ui.composer?.kind === 'enterprise'
			? enterprises.find((item) => item.id === ui.composer.id)
			: null
	);
	const open = $derived(ui.composer?.kind === 'enterprise');

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		description = editing?.description ?? '';
		icon = editing?.icon ?? null;
		iconOpen = false;
	});

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		try {
			await saveEnterprise(
				{
					id: editing?.id,
					title: nextTitle,
					description,
					icon,
					status: editing?.status ?? 'active',
					kind: editing?.kind ?? 'activity',
					sort: editing?.sort ?? 100,
					project_ids: editing?.project_ids ?? [],
					fixed_costs: editing?.fixed_costs ?? [],
					variable_costs: editing?.variable_costs ?? [],
					sales: editing?.sales ?? [],
					expected_output_units: editing?.expected_output_units ?? 0,
					output_unit_label: editing?.output_unit_label ?? '',
					currency: editing?.currency ?? 'EUR',
					labels: editing?.labels ?? [],
					created_at: editing?.created_at
				},
				!editing
			);
			closeComposer();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<CreateSheet
	{open}
	label={editing ? 'Edit enterprise' : 'New enterprise'}
	onclose={() => {
		if (iconOpen) {
			iconOpen = false;
			return;
		}
		closeComposer();
	}}
>
	<div class="sheet-title-row">
		<button
			bind:this={iconBtn}
			type="button"
			class="bare"
			class:on={iconOpen}
			aria-label="Enterprise icon"
			aria-expanded={iconOpen}
			onpointerdown={(e) => e.preventDefault()}
			onclick={() => (iconOpen = !iconOpen)}
		>
			<EnterpriseBox state="active" {icon} size={36} />
		</button>
		<input class="sheet-input" placeholder="Enterprise (e.g. Eggs, Sheep, General)" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="Description" bind:value={description}></textarea>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>
			{editing ? 'Save' : 'Publish'}
		</button>
	</div>
</CreateSheet>

<FloatPanel
	open={iconOpen}
	anchor={iconBtn}
	placement="below"
	width={292}
	maxHeight={360}
	onclose={() => (iconOpen = false)}
>
	<EmojiPicker
		value={icon}
		onselect={(emoji) => {
			icon = emoji;
			iconOpen = false;
		}}
		onclear={() => {
			icon = null;
			iconOpen = false;
		}}
	/>
</FloatPanel>

<style>
	.bare {
		border: 0;
		background: transparent;
		padding: 4px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.bare.on {
		background: var(--float-trigger-on);
	}

	.sheet-bottom {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 12px 16px 0;
	}

	.publish-btn {
		height: 36px;
		padding: 0 18px;
		border: 1px solid transparent;
		border-radius: 9999px;
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.publish-btn:disabled {
		opacity: 0.5;
	}
</style>
