<script>
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { openComposer, projects, selectEntity, ui } from '$lib/workspace.svelte.js';
</script>

<svelte:head><title>Projects</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Projects</h1>
		<p>
			{#if ui.source === 'drive'}
				On Drive — create here; optional <code>home/</code> for docs. Files elsewhere can wear many
				project labels.
			{:else}
				Demo list — <a href="/settings">connect Drive</a> to create for real.
			{/if}
		</p>
	</div>
	<button type="button" class="new-btn" onclick={() => openComposer('project')}>New project</button>
</header>

{#if driveSession.loading}
	<p class="muted">Loading…</p>
{:else if projects.length === 0}
	<p class="empty">No projects yet. Create one to label tasks and files.</p>
{:else}
	<ul class="list">
		{#each projects as project (project.id)}
			<li>
				<button
					type="button"
					class="row"
					class:on={ui.selection?.kind === 'project' && ui.selection.id === project.id}
					onclick={() => selectEntity('project', project.id)}
				>
					<span class="title">{project.title}</span>
					{#if project.summary}
						<span class="sum">{project.summary}</span>
					{/if}
					<span class="meta">{project.slug ?? project.id}</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.page-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1rem 0.75rem;
	}

	.page-head p {
		margin: 0.35rem 0 0;
		font-size: 13px;
		color: var(--white66);
		max-width: 36rem;
	}

	.page-head a {
		color: var(--white);
	}

	.page-head code {
		font-size: 12px;
		color: var(--white33);
	}

	.new-btn {
		flex-shrink: 0;
		height: 2.25rem;
		padding: 0 1rem;
		border: 0;
		border-radius: 10px;
		background: var(--white);
		color: var(--black);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.muted,
	.empty {
		padding: 2rem 1rem;
		color: var(--white66);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		width: 100%;
		padding: 0.85rem 1rem;
		border: 0;
		border-bottom: 1.4px solid var(--white11);
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--white4);
	}

	.row.on {
		background: var(--white8);
	}

	.title {
		font-size: 15px;
		font-weight: 600;
		color: var(--white);
	}

	.sum {
		font-size: 13px;
		color: var(--white66);
	}

	.meta {
		font-size: 11px;
		color: var(--white33);
		font-family: ui-monospace, monospace;
	}
</style>
