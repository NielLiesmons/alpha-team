<script>
	import CreateSheet from './CreateSheet.svelte';
	import StatusBox from './StatusBox.svelte';
	import { closeComposer, projects, saveProject, ui } from '$lib/workspace.svelte.js';

	const statuses = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'planned', label: 'Planned' },
		{ value: 'inProgress', label: 'In progress' },
		{ value: 'closed', label: 'Completed' }
	];

	let title = $state('');
	let summary = $state('');
	let body = $state('');
	let status = $state('planned');
	let statusOpen = $state(false);

	const editing = $derived(
		ui.composer?.kind === 'project' ? projects.find((item) => item.id === ui.composer.id) : null
	);
	const open = $derived(ui.composer?.kind === 'project');

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		summary = editing?.summary ?? '';
		body = editing?.body ?? '';
		status = editing?.status ?? 'planned';
		statusOpen = false;
	});

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		try {
			await saveProject(
				{
					id: editing?.id,
					title: nextTitle,
					summary,
					body,
					status
				},
				!editing
			);
			closeComposer();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<CreateSheet {open} label={editing ? 'Edit project' : 'New project'} onclose={closeComposer}>
	<div class="title-row">
		<div class="menu-anchor">
			<button type="button" class="bare" aria-label="Status" onclick={() => (statusOpen = !statusOpen)}>
				<StatusBox state={status} size={24} />
			</button>
			{#if statusOpen}
				<div class="menu">
					{#each statuses as opt (opt.value)}
						<button type="button" class:on={status === opt.value} onclick={() => { status = opt.value; statusOpen = false; }}>
							<StatusBox state={opt.value} size={16} />
							{opt.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<input class="sheet-input" placeholder="Project title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<input class="summary" placeholder="Short summary" bind:value={summary} />
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="What is this project?" bind:value={body}></textarea>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>
			{editing ? 'Save' : 'Publish'}
		</button>
	</div>
</CreateSheet>

<style>
	.bare {
		border: 0;
		background: transparent;
		padding: 0;
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.menu-anchor {
		position: relative;
	}

	.menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 5;
		min-width: 168px;
		background: var(--gray);
		border: 0.33px solid var(--white33);
		border-radius: 12px;
		overflow: hidden;
	}

	.menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-bottom: 0.33px solid var(--white8);
		background: transparent;
		color: var(--white66);
		font-size: 15px;
		font-weight: 500;
		text-align: left;
	}

	.menu button.on {
		color: var(--white);
		font-weight: 600;
	}

	.summary {
		width: 100%;
		padding: 10px 12px;
		border: 0;
		background: transparent;
		outline: none;
		color: var(--white66);
		font-size: 15px;
	}

	.summary::placeholder {
		color: var(--white33);
	}
</style>
