<script>
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { projects, selectEntity, ui } from '$lib/workspace.svelte.js';
</script>

<svelte:head><title>Projects</title></svelte:head>

{#if driveSession.loading}
	<p class="muted">Loading…</p>
{:else if projects.length === 0}
	<p class="empty">No projects yet. Create one to label tasks and files.</p>
{:else}
	<ul class="card-stack">
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
	.muted,
	.empty {
		padding: 2rem 1rem;
		color: var(--fg-66);
	}

	.card-stack {
		list-style: none;
		margin: 0;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		width: 100%;
		padding: 0.85rem 0.9rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
	}

	.title {
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
	}

	.sum {
		font-size: 13px;
		color: var(--fg-66);
	}

	.meta {
		font-size: 11px;
		color: var(--fg-33);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
	}
</style>
