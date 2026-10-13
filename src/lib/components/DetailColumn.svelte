<script>
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import StatusBox from './StatusBox.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import LabelStack from './LabelStack.svelte';
	import {
		clearSelection,
		notes,
		openComposer,
		projects,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const selection = $derived(ui.selection);

	const task = $derived(
		selection?.kind === 'task' ? tasks.find((t) => t.id === selection.id) : null
	);
	const project = $derived(
		selection?.kind === 'project' ? projects.find((p) => p.id === selection.id) : null
	);
	const note = $derived(
		selection?.kind === 'note' ? notes.find((n) => n.id === selection.id) : null
	);

	const emptyCopy = $derived.by(() => {
		const path = typeof window !== 'undefined' ? window.location.pathname : '';
		if (path.startsWith('/tasks')) return { title: 'No task selected', body: 'Pick a task from the list to read it here.' };
		if (path.startsWith('/projects')) return { title: 'No project selected', body: 'Open a project to see its summary and notes.' };
		if (path.startsWith('/notes')) return { title: 'No note selected', body: 'Choose a note to read it beside the list.' };
		if (path.startsWith('/mail')) return { title: 'No message selected', body: 'Mail will open here when it’s wired up.' };
		if (path.startsWith('/chat')) return { title: 'No chat selected', body: 'Conversations will open here when chat is ready.' };
		return { title: 'Nothing open', body: 'Select a task, project, note, mail, or chat to view it here.' };
	});

	function editCurrent() {
		if (!selection) return;
		if (selection.kind === 'task' || selection.kind === 'project' || selection.kind === 'note') {
			openComposer(selection.kind, selection.id);
		}
	}
</script>

<aside class="detail" aria-label="Detail">
	{#if task}
		<header class="head">
			<div class="head-main">
				<TaskBox state={task.status} size={22} />
				<h2 class="title">{task.title}</h2>
				<PriorityBox priority={task.priority} size={20} />
			</div>
			<div class="head-actions">
				<button type="button" class="ghost" onclick={editCurrent}>Edit</button>
				<button type="button" class="ghost" onclick={clearSelection} aria-label="Close">Close</button>
			</div>
		</header>
		<div class="body">
			{#if task.body}
				<p class="prose">{task.body}</p>
			{:else}
				<p class="muted">No description.</p>
			{/if}
			{#if task.labels?.length}
				<div class="block">
					<span class="label">Labels</span>
					<LabelStack labels={task.labels} />
				</div>
			{/if}
			{#if task.assignees?.length || task.author}
				<div class="block">
					<span class="label">People</span>
					<ProfilePicStack
						profiles={[task.author, ...(task.assignees ?? [])].filter(Boolean)}
						text=""
						size="sm"
					/>
				</div>
			{/if}
			{#if task.targets?.length}
				<div class="block">
					<span class="label">Projects</span>
					<p class="prose">{task.targets.map((t) => t.label).join(', ')}</p>
				</div>
			{/if}
		</div>
	{:else if project}
		<header class="head">
			<div class="head-main">
				<StatusBox state={project.status} size={22} />
				<h2 class="title">{project.title}</h2>
			</div>
			<div class="head-actions">
				<button type="button" class="ghost" onclick={editCurrent}>Edit</button>
				<button type="button" class="ghost" onclick={clearSelection} aria-label="Close">Close</button>
			</div>
		</header>
		<div class="body">
			{#if project.summary}
				<p class="summary">{project.summary}</p>
			{/if}
			{#if project.body}
				<p class="prose">{project.body}</p>
			{:else}
				<p class="muted">No project notes yet.</p>
			{/if}
		</div>
	{:else if note}
		<header class="head">
			<div class="head-main">
				<h2 class="title">{note.title}</h2>
				{#if note.targets?.length}
					<p class="summary">{note.targets.map((t) => t.label).join(' · ')}</p>
				{/if}
			</div>
			<div class="head-actions">
				<button type="button" class="ghost" onclick={editCurrent}>Edit</button>
				<button type="button" class="ghost" onclick={clearSelection} aria-label="Close">Close</button>
			</div>
		</header>
		<div class="body">
			<pre class="note-body">{note.body}</pre>
		</div>
	{:else}
		<div class="empty">
			<p class="empty-title">{emptyCopy.title}</p>
			<p class="empty-body">{emptyCopy.body}</p>
		</div>
	{/if}
</aside>

<style>
	.detail {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: transparent;
		overflow: hidden;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px 12px;
		border-bottom: 1px solid var(--shell-border);
		flex-shrink: 0;
	}

	.head-main {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.title {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-family: var(--font);
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.25;
		color: var(--white);
	}

	.head-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}

	.ghost {
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--white66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.ghost:hover {
		color: var(--white);
		background: var(--white4);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.prose,
	.summary {
		margin: 0;
		font-size: 15px;
		line-height: 1.55;
		color: var(--white66);
		white-space: pre-wrap;
	}

	.summary {
		color: var(--white);
		font-weight: 500;
	}

	.muted {
		margin: 0;
		font-size: 14px;
		color: var(--white33);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.note-body {
		margin: 0;
		font: inherit;
		font-size: 14px;
		line-height: 1.55;
		color: var(--white66);
		white-space: pre-wrap;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1.5rem;
		text-align: center;
	}

	.empty-title {
		margin: 0;
		font-family: var(--font);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--white);
	}

	.empty-body {
		margin: 0.55rem 0 0;
		max-width: 16rem;
		font-size: 14px;
		line-height: 1.5;
		color: var(--white33);
	}

	@media (max-width: 767px) {
		.detail {
			display: none;
		}
	}
</style>
