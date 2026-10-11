<script>
	import StatusBox from '$lib/components/StatusBox.svelte';
	import { openComposer, projects, ui } from '$lib/workspace.svelte.js';

	const project = $derived(projects.find((item) => item.id === ui.projectId) ?? projects[0] ?? null);

	const statusLabel = {
		backlog: 'Backlog',
		planned: 'Planned',
		inProgress: 'In progress',
		closed: 'Completed'
	};
</script>

<svelte:head><title>{project?.title ?? 'Projects'}</title></svelte:head>

<div class="fill">
	{#if project}
		<div class="head">
			<StatusBox state={project.status} size={22} />
			<div>
				<h1>{project.title}</h1>
				<p>{statusLabel[project.status] ?? project.status}</p>
			</div>
			<button type="button" class="edit" onclick={() => openComposer('project', project.id)}>Edit</button>
		</div>
		{#if project.summary}
			<p class="summary">{project.summary}</p>
		{/if}
		{#if project.body}
			<p class="body">{project.body}</p>
		{/if}
	{:else}
		<p class="empty">No projects yet.</p>
	{/if}
</div>

<style>
	.fill {
		padding: 20px 24px 40px;
		overflow: auto;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	h1 {
		font-size: 22px;
		font-weight: 650;
		letter-spacing: -0.03em;
	}

	.head p,
	.summary,
	.body,
	.empty {
		color: var(--white66);
		font-size: 15px;
	}

	.summary {
		margin-top: 18px;
	}

	.body {
		margin-top: 8px;
		white-space: pre-wrap;
	}

	.edit {
		margin-left: auto;
		height: 32px;
		padding: 0 14px;
		border: 0;
		border-radius: 8px;
		background: var(--white8);
		color: var(--white);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}
</style>
