<script>
	import CreateSheet from './CreateSheet.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import Spinner from './Spinner.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
	import { closeComposer, notes, projects, saveNote, tasks, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let body = $state('');
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {string | null} */
	let seededFor = $state(null);
	let saving = $state(false);
	let saveError = $state('');
	/** @type {null | 'projects'} */
	let bottomMenu = $state(null);
	/** @type {HTMLButtonElement | undefined} */
	let projectsBtn = $state();

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
			saving = false;
			saveError = '';
			bottomMenu = null;
			return;
		}
		const key = editing?.id ?? '__new__';
		if (seededFor === key) return;
		seededFor = key;
		title = editing?.title ?? '';
		body = editing?.body ?? '';
		projectIds = [...(editing?.project_ids ?? [])];
		saving = false;
		saveError = '';
		bottomMenu = null;
		/* No autofocus — avoids PWA keyboard scroll jumping the sheet. */
	});

	/** @param {string} id */
	function toggleProject(id) {
		if (projectIds.includes(id)) projectIds = projectIds.filter((p) => p !== id);
		else projectIds = [...projectIds, id];
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle || saving) return;
		const isNew = !editing;
		saving = true;
		saveError = '';
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
			const pending = saveNote(draft, isNew);
			closeComposer();
			await pending;
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
			alert(saveError);
		} finally {
			saving = false;
		}
	}
</script>

<CreateSheet
	{open}
	label={editing ? 'Edit note' : 'New note'}
	onclose={() => {
		if (bottomMenu) {
			bottomMenu = null;
			return;
		}
		closeComposer();
	}}
>
	<div class="sheet-title-row">
		<input class="sheet-input" placeholder="Note title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<div class="note-scroll">
		{#key editorKey}
			{#if open}
				<NoteEditor
					value={body}
					placeholder="Write…  (## for a heading)"
					onChange={(html) => (body = html)}
				/>
			{/if}
		{/key}
	</div>
	<div class="form-divider"></div>
	<div class="task-bottom-row">
		<div class="bottom-pills">
			<div class="pill-wrap">
				<button
					bind:this={projectsBtn}
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					aria-label="Projects"
					aria-expanded={bottomMenu === 'projects'}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => (bottomMenu = bottomMenu === 'projects' ? null : 'projects')}
				>
					<ProjectPillsDisplay {projectIds} />
				</button>
			</div>
		</div>

		<button
			type="button"
			class="publish-btn"
			disabled={!title.trim() || saving}
			onclick={save}
		>
			{#if saving}
				<Spinner size={14} label="Saving" />
			{/if}
			{editing ? 'Save' : 'Create'}
		</button>
	</div>
</CreateSheet>

<FloatPanel
	open={bottomMenu === 'projects'}
	anchor={projectsBtn}
	placement="above"
	width={240}
	maxHeight={280}
	onclose={() => (bottomMenu = null)}
>
	<div class="float-list" role="listbox">
		{#if projects.length === 0}
			<p class="menu-empty">No projects yet</p>
		{:else}
			{#each projects as project (project.id)}
				{@const on = projectIds.includes(project.id)}
				<button type="button" class="option" class:active={on} onclick={() => toggleProject(project.id)}>
					<ProjectBox
						state={deriveProjectStatus(project.id, tasks)}
						icon={project.icon}
						size={18}
					/>
					<span class="option-text">{project.title}</span>
					{#if on}
						<svg class="option-check" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M3.2 8.2 L6.4 11.3 L12.8 4.5"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</FloatPanel>

<style>
	.sheet-title-row {
		flex-shrink: 0;
	}

	.note-scroll {
		flex: 1 1 auto;
		min-height: 0;
		max-height: min(48svh, 420px);
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		/* Match TaskCreate .task-body padding */
		padding: 10px 16px;
		box-sizing: border-box;
		-webkit-overflow-scrolling: touch;
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
		height: var(--ctrl-h);
		max-width: 200px;
		padding: 0 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		box-sizing: border-box;
	}

	.meta-pill.empty {
		color: var(--fg-33);
	}

	.meta-pill[aria-expanded='true'] {
		background: var(--float-trigger-on);
	}

	.pill-names {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		color: var(--fg);
	}

	.pill-projects {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.pill-project {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		font-size: 13px;
		color: var(--fg);
	}

	.float-list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 4px 0;
	}

	.menu-empty {
		margin: 0;
		padding: 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

	.option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}

	.option:hover {
		background: var(--fg-8);
	}

	.option-text {
		flex: 1;
		min-width: 0;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option.active .option-text {
		color: var(--fg);
		font-weight: 600;
	}

	.option-check {
		flex-shrink: 0;
		color: var(--fg-66);
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
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition: transform 0.2s var(--ease);
	}

	.publish-btn:hover:not(:disabled) {
		transform: scale(1.015);
	}

	.publish-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.publish-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
