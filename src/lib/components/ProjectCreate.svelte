<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
	import { closeComposer, projects, saveProject, tasks, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let description = $state('');
	/** @type {string | null} */
	let icon = $state(null);
	let iconOpen = $state(false);
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

	function onBaseClose() {
		if (iconOpen) {
			iconOpen = false;
			return;
		}
		closeComposer();
	}
</script>

<CreateSheet
	{open}
	sheetId="project-create"
	label={editing ? 'Edit project' : 'New project'}
	onclose={onBaseClose}
>
	<div class="sheet-title-row">
		<button
			type="button"
			class="bare"
			aria-label="Project icon"
			onclick={() => (iconOpen = true)}
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

<CreateSheet
	open={iconOpen}
	nested
	sheetId="project-emoji"
	label="Choose emoji"
	onclose={() => (iconOpen = false)}
>
	<div class="nested-head">
		<span class="nested-title">Emoji</span>
	</div>
	<div class="form-divider"></div>
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
</CreateSheet>

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

	.nested-head {
		display: flex;
		align-items: center;
		padding: 14px 16px 6px;
	}

	.nested-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
	}
</style>
