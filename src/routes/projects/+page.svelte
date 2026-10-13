<script>
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { projects, selectEntity, ui } from '$lib/workspace.svelte.js';
</script>

<svelte:head><title>Projects</title></svelte:head>

{#if ui.source === 'demo'}
	<p class="banner">
		Demo projects — connect Drive in <a href="/settings">Settings</a>
	</p>
{/if}

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
	.banner {
		margin: 0;
		padding: 10px 16px;
		font-size: 13px;
		color: var(--white66);
		border-bottom: 1px solid var(--white11);
	}

	.banner a {
		color: var(--white);
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
