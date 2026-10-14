<script>
	import CreateSheet from './CreateSheet.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import { closeComposer, notes, projects, saveNote, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let body = $state('');
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {string | null} */
	let seededFor = $state(null);

	const editing = $derived(
		ui.composer?.kind === 'note' && ui.composer.id
			? notes.find((n) => n.id === ui.composer.id)
			: null
	);
	const open = $derived(ui.composer?.kind === 'note');
	const editorKey = $derived(`${open ? '1' : '0'}-${editing?.id ?? 'new'}`);

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		const key = editing?.id ?? '__new__';
		if (seededFor === key) return;
		seededFor = key;
		title = editing?.title ?? '';
		body = editing?.body ?? '';
		projectIds = [...(editing?.project_ids ?? [])];
	});

	/** @param {string} id */
	function toggleProject(id) {
		if (projectIds.includes(id)) projectIds = projectIds.filter((p) => p !== id);
		else projectIds = [...projectIds, id];
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		const draft = {
			id: editing?.id,
			title: nextTitle,
			body,
			labels: editing?.labels ?? [],
			targets: projectIds.map((id) => ({
				id,
				label: projects.find((p) => p.id === id)?.title ?? id
			})),
			project_ids: projectIds,
			_drive: editing?._drive
		};
		try {
			await saveNote(draft, !editing);
			closeComposer();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<CreateSheet {open} label={editing ? 'Edit note' : 'New note'} onclose={closeComposer}>
	<div class="title-row">
		<input class="sheet-input" placeholder="Note title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	{#key editorKey}
		{#if open}
			<NoteEditor
				value={body}
				placeholder="Write…  (## for a heading)"
				onChange={(html) => (body = html)}
			/>
		{/if}
	{/key}
	<div class="form-divider"></div>
	{#if projects.length > 0}
		<div class="project-pick">
			<span class="pick-label">Projects</span>
			<div class="pick-chips">
				{#each projects as project (project.id)}
					<button
						type="button"
						class="pick-chip"
						class:on={projectIds.includes(project.id)}
						onclick={() => toggleProject(project.id)}
					>
						{project.title}
					</button>
				{/each}
			</div>
		</div>
		<div class="form-divider"></div>
	{/if}
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>
			{editing ? 'Save' : 'Create'}
		</button>
	</div>
</CreateSheet>

<style>
	.project-pick {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
	}

	.pick-label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.pick-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.pick-chip {
		border: 1px solid var(--white22);
		background: transparent;
		color: var(--white66);
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 13px;
		cursor: pointer;
	}

	.pick-chip.on {
		border-color: var(--white66);
		background: var(--white8);
		color: var(--white);
	}
</style>
