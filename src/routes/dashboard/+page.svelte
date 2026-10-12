<script>
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { openComposer, projects, tasks, ui } from '$lib/workspace.svelte.js';

	const openTasks = $derived(
		tasks.filter((t) => !['closed', 'canceled'].includes(t.status)).length
	);
	const urgent = $derived(tasks.filter((t) => t.priority === 'urgent').length);
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Dashboard</h1>
		<p>
			{#if ui.source === 'drive'}
				Space overview — live from Drive.
			{:else}
				Demo data — <a href="/settings">connect Drive</a> for the real Space.
			{/if}
		</p>
	</div>
</header>

<div class="grid">
	<a class="cell" href="/tasks">
		<span class="cell-k">Tasks open</span>
		<span class="cell-v">{openTasks}</span>
		<span class="cell-h">of {tasks.length} total</span>
	</a>
	<a class="cell" href="/tasks">
		<span class="cell-k">Urgent</span>
		<span class="cell-v">{urgent}</span>
		<span class="cell-h">priority</span>
	</a>
	<a class="cell" href="/projects">
		<span class="cell-k">Projects</span>
		<span class="cell-v">{projects.length}</span>
		<span class="cell-h">in Space</span>
	</a>
	<div class="cell">
		<span class="cell-k">Drive</span>
		<span class="cell-v drive-state">{driveSession.connected ? 'On' : 'Off'}</span>
		<span class="cell-h">{driveSession.connected ? 'encrypted' : 'local demo'}</span>
	</div>
	<button type="button" class="cell action" onclick={() => openComposer('task')}>
		<span class="cell-k">Quick</span>
		<span class="cell-v sm">New task</span>
		<span class="cell-h">opens composer</span>
	</button>
	<button type="button" class="cell action" onclick={() => openComposer('project')}>
		<span class="cell-k">Quick</span>
		<span class="cell-v sm">New project</span>
		<span class="cell-h">opens composer</span>
	</button>
	<a class="cell span2" href="/drive">
		<span class="cell-k">Drive layout</span>
		<span class="cell-v sm">Content-type folders + project labels</span>
		<span class="cell-h">Browse and upload</span>
	</a>
</div>

<style>
	.page-head {
		padding: 1rem 1rem 0;
	}

	.page-head p {
		margin: 0.35rem 0 0;
		font-size: 13px;
		color: var(--white66);
	}

	.page-head a {
		color: var(--white);
	}

	/* Lined grid — square cells, hairlines, no rounded bento */
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-top: 1px solid var(--white11);
		border-left: 1px solid var(--white11);
		margin: 1rem;
	}

	@media (min-width: 768px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.cell {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		min-height: 7.5rem;
		padding: 1rem 1.1rem;
		border: 0;
		border-right: 1px solid var(--white11);
		border-bottom: 1px solid var(--white11);
		background: transparent;
		color: inherit;
		text-decoration: none;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}

	.cell:hover {
		background: var(--white4);
	}

	.cell.span2 {
		grid-column: span 2;
	}

	.cell-k {
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.cell-v {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--white);
		line-height: 1.1;
	}

	.cell-v.sm {
		font-size: 1.25rem;
	}

	.cell-v.drive-state {
		font-size: 1.75rem;
	}

	.cell-h {
		margin-top: auto;
		font-size: 12px;
		color: var(--white66);
	}
</style>
