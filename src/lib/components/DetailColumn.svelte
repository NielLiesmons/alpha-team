<script>
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import StatusBox from './StatusBox.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import LabelStack from './LabelStack.svelte';
	import NoteEditor from './NoteEditor.svelte';
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

	const typeLabel = $derived.by(() => {
		if (task) return 'Task';
		if (project) return 'Project';
		if (note) return 'Note';
		if (selection?.kind === 'mail') return 'Mail';
		if (selection?.kind === 'chat') return 'Chat';
		return 'Detail';
	});

	const open = $derived(Boolean(task || project || note));

	const emptyCopy = $derived.by(() => {
		const path = typeof window !== 'undefined' ? window.location.pathname : '';
		if (path.startsWith('/tasks')) return { title: 'No task selected', body: 'Pick a task from the list to read it here.' };
		if (path.startsWith('/projects')) return { title: 'No project selected', body: 'Open a project to see its summary and notes.' };
		if (path.startsWith('/notes')) return { title: 'No note selected', body: 'Choose a note to read it beside the list.' };
		if (path.startsWith('/mail')) return { title: 'No message selected', body: 'Mail will open here when it’s wired up.' };
		if (path.startsWith('/chat')) return { title: 'No chat selected', body: 'Conversations will open here when chat is ready.' };
		return { title: 'Nothing open', body: 'Select a task, project, note, mail, or chat to view it here.' };
	});

	let menuOpen = $state(false);

	function editCurrent() {
		menuOpen = false;
		if (!selection) return;
		if (selection.kind === 'task' || selection.kind === 'project' || selection.kind === 'note') {
			openComposer(selection.kind, selection.id);
		}
	}

	function close() {
		menuOpen = false;
		clearSelection();
	}
</script>

<aside class="detail" class:open aria-label="Detail" class:empty={!open}>
	{#if open}
		<header class="mobile-bar">
			<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path
						d="M11.5 3.5 6 9l5.5 5.5"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<span class="type-label">{typeLabel}</span>
			<div class="menu-wrap">
				<button
					type="button"
					class="icon-hit"
					aria-label="More"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
				>
					<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<circle cx="9" cy="4" r="1.35" fill="currentColor" />
						<circle cx="9" cy="9" r="1.35" fill="currentColor" />
						<circle cx="9" cy="14" r="1.35" fill="currentColor" />
					</svg>
				</button>
				{#if menuOpen}
					<button type="button" class="menu-scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}
					></button>
					<div class="more-menu" role="menu">
						<button type="button" role="menuitem" onclick={editCurrent}>Edit</button>
						<button type="button" role="menuitem" onclick={close}>Close</button>
					</div>
				{/if}
			</div>
		</header>
	{/if}

	{#if task}
		<header class="head desktop-head">
			<div class="head-main">
				<TaskBox state={task.status} size={22} />
				<h2 class="title">{task.title}</h2>
				<PriorityBox priority={task.priority} size={20} />
			</div>
			<div class="head-actions">
				<button type="button" class="ghost" onclick={editCurrent}>Edit</button>
				<button type="button" class="ghost" onclick={close} aria-label="Close">Close</button>
			</div>
		</header>
		<div class="body">
			<div class="mobile-title-row">
				<TaskBox state={task.status} size={22} />
				<h2 class="title">{task.title}</h2>
				<PriorityBox priority={task.priority} size={20} />
			</div>
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
		<header class="head desktop-head">
			<div class="head-main">
				<StatusBox state={project.status} size={22} />
				<h2 class="title">{project.title}</h2>
			</div>
			<div class="head-actions">
				<button type="button" class="ghost" onclick={editCurrent}>Edit</button>
				<button type="button" class="ghost" onclick={close} aria-label="Close">Close</button>
			</div>
		</header>
		<div class="body">
			<div class="mobile-title-row">
				<StatusBox state={project.status} size={22} />
				<h2 class="title">{project.title}</h2>
			</div>
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
		<header class="head desktop-head">
			<div class="head-main">
				<h2 class="title">{note.title}</h2>
			</div>
			<div class="head-actions">
				<button type="button" class="ghost" onclick={editCurrent}>Edit</button>
				<button type="button" class="ghost" onclick={close} aria-label="Close">Close</button>
			</div>
		</header>
		<div class="body">
			<div class="mobile-title-row">
				<h2 class="title">{note.title}</h2>
			</div>
			{#key note.id}
				<NoteEditor value={note.body ?? ''} editable={false} />
			{/key}
		</div>
	{:else}
		<div class="empty desktop-empty">
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

	.mobile-bar {
		display: none;
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

	.mobile-title-row {
		display: none;
	}

	.menu-wrap {
		position: relative;
	}

	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
	}

	.more-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 50;
		min-width: 140px;
		padding: 4px;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
	}

	.more-menu button {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--white66);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.more-menu button:hover {
		background: var(--white8);
		color: var(--white);
	}

	@media (max-width: 767px) {
		.detail {
			position: fixed;
			inset: 0;
			z-index: 55;
			width: 100%;
			background: var(--bg);
			transform: translateX(100%);
			transition: transform 0.32s var(--ease);
			pointer-events: none;
		}

		.detail.open {
			transform: translateX(0);
			pointer-events: auto;
		}

		.detail.empty {
			display: none;
		}

		.mobile-bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			height: 52px;
			padding: 0 10px;
			border-bottom: 1px solid var(--hairline);
			flex-shrink: 0;
			box-sizing: border-box;
			background: var(--bg);
		}

		.type-label {
			flex: 1;
			text-align: center;
			font-family: var(--font);
			font-size: 15px;
			font-weight: 650;
			color: var(--white);
		}

		.icon-hit {
			width: 36px;
			height: 36px;
			display: grid;
			place-items: center;
			border: 0;
			border-radius: 10px;
			background: transparent;
			color: var(--white66);
			padding: 0;
			cursor: pointer;
		}

		.icon-hit:hover {
			color: var(--white);
			background: var(--white4);
		}

		.desktop-head,
		.desktop-empty {
			display: none;
		}

		.mobile-title-row {
			display: flex;
			align-items: center;
			gap: 10px;
			min-width: 0;
		}

		.body {
			padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
