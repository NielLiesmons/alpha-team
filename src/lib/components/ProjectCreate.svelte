<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
	import { closeComposer, projects, saveProject, tasks, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let description = $state('');
	/** @type {string | null} */
	let icon = $state(null);
	let iconOpen = $state(false);
	/** @type {HTMLButtonElement | undefined} */
	let iconBtn = $state();
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();

	const editing = $derived(
		ui.composer?.kind === 'project' ? projects.find((item) => item.id === ui.composer.id) : null
	);
	const open = $derived(ui.composer?.kind === 'project');
	const previewStatus = $derived(editing ? deriveProjectStatus(editing.id, tasks) : 'planned');

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		description = editing?.description ?? editing?.summary ?? editing?.body ?? '';
		icon = editing?.icon ?? null;
		iconOpen = false;
		tick().then(() => titleInput?.focus());
	});

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		try {
			await saveProject(
				{
					id: editing?.id,
					title: nextTitle,
					description,
					icon,
					milestones: editing?.milestones ?? [],
					status: editing?.status ?? 'planned'
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
	label={editing ? 'Edit project' : 'New project'}
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
			aria-label="Project icon"
			aria-expanded={iconOpen}
			onclick={() => (iconOpen = !iconOpen)}
		>
			<ProjectBox state={previewStatus} {icon} size={28} />
		</button>
		<input bind:this={titleInput} class="sheet-input" placeholder="Project title" bind:value={title} />
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
		padding: 0;
		display: grid;
		place-items: center;
		cursor: pointer;
		flex-shrink: 0;
	}
</style>
