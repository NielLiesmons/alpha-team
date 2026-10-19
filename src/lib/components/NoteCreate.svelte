<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
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
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	let saving = $state(false);
	let saveError = $state('');
	/** @type {null | 'projects'} */
	let bottomMenu = $state(null);

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
		tick().then(() => titleInput?.focus());
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

<CreateSheet {open} label={editing ? 'Edit note' : 'New note'} onclose={closeComposer}>
	<div class="sheet-title-row">
		<input bind:this={titleInput} class="sheet-input" placeholder="Note title" bind:value={title} />
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
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					aria-label="Projects"
					aria-expanded={bottomMenu === 'projects'}
					onclick={() => (bottomMenu = bottomMenu === 'projects' ? null : 'projects')}
				>
					<ProjectPillsDisplay {projectIds} />
				</button>
				{#if bottomMenu === 'projects'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#if projects.length === 0}
							<p class="menu-empty">No projects yet</p>
						{:else}
							{#each projects as project (project.id)}
								{@const on = projectIds.includes(project.id)}
								<button
									type="button"
									class="option"
									class:active={on}
									onclick={() => toggleProject(project.id)}
								>
									<ProjectBox
										state={deriveProjectStatus(project.id, tasks)}
										icon={project.icon}
										size={18}
									/>
									<span>{project.title}</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
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
		align-items: center;
		gap: 8px;
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

	.menu-empty {
		margin: 0;
		padding: 10px 12px;
		font-size: 13px;
		color: var(--fg-33);
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
	}

	.publish-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
