<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		notes,
		openComposer,
		patchProject,
		projects,
		selectEntity,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const STATUS_ORDER = ['inProgress', 'planned', 'backlog', 'closed', 'canceled'];
	const STATUS_LABELS = {
		inProgress: 'IN PROGRESS',
		planned: 'PLANNED',
		backlog: 'BACKLOG',
		closed: 'COMPLETED',
		canceled: 'CANCELED'
	};

	const STATUS_CYCLE = ['backlog', 'planned', 'inProgress', 'closed', 'canceled'];

	const groups = $derived.by(() => {
		/** @type {Map<string, typeof projects>} */
		const map = new Map();
		const sorted = [...projects].sort((a, b) => String(a.title).localeCompare(String(b.title)));
		for (const project of sorted) {
			const key = STATUS_ORDER.includes(project.status) ? project.status : 'planned';
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(project);
		}
		return STATUS_ORDER.filter((key) => (map.get(key)?.length ?? 0) > 0).map((key) => ({
			key,
			label: STATUS_LABELS[key],
			items: map.get(key)
		}));
	});

	/** @param {string} projectId */
	function taskCount(projectId) {
		return tasks.filter((t) => (t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? []).includes(projectId)).length;
	}

	/** @param {string} projectId */
	function noteCount(projectId) {
		return notes.filter((n) => (n.project_ids ?? []).includes(projectId)).length;
	}

	/** @param {any} project */
	async function cycleStatus(project) {
		const cur = STATUS_CYCLE.includes(project.status) ? project.status : 'planned';
		const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
		try {
			await patchProject(project.id, { status: next });
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<svelte:head><title>Projects</title></svelte:head>

<div class="feed">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if !appBoot.listsReady && projects.length === 0}
		<FeedSkeleton rows={6} />
	{:else if projects.length === 0}
		<p class="empty">No Projects yet</p>
	{:else}
		{#each groups as group (group.key)}
			<div class="task-group-header">
				<span class="eyebrow-label-xs">{group.label}</span>
				<span class="task-group-count">{group.items.length}</span>
				<button
					type="button"
					class="task-group-add-btn"
					aria-label="Add project with status {group.label}"
					onclick={() => openComposer('project', undefined, group.key)}
				>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>
			</div>
			<div class="card-stack">
				{#each group.items as project (project.id)}
					<ProjectCard
						id={project.id}
						title={project.title}
						status={project.status}
						summary={project.summary}
						milestones={project.milestones ?? []}
						taskCount={taskCount(project.id)}
						noteCount={noteCount(project.id)}
						onclick={() => selectEntity('project', project.id)}
						selected={ui.selection?.kind === 'project' && ui.selection.id === project.id}
						onStatusClick={() => cycleStatus(project)}
					/>
				{/each}
			</div>
		{/each}
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		}

	.banner {
		margin: 0;
		padding: 10px 16px;
		font-size: 13px;
		color: var(--fg-66);
	}

	.banner .err {
		color: var(--fg-66);
	}

	.empty {
		padding: 48px 16px;
		color: var(--fg-66);
	}

	.task-group-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 6px;
		padding: 6px 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		width: auto;
		box-sizing: border-box;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 6px 10px;
		box-sizing: border-box;
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.task-group-count {
		font-family: var(--font);
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.task-group-add-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
	}

	.task-group-add-btn:hover {
		color: var(--fg);
		background: var(--fg-8);
	}
</style>
