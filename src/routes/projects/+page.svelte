<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { deriveProjectStatus, projectDisplayIcon } from '$lib/project-status.js';
	import {
		enterprises,
		notes,
		openComposer,
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

	const groups = $derived.by(() => {
		/** @type {Map<string, typeof projects>} */
		const map = new Map();
		const sorted = [...projects].sort((a, b) => String(a.title).localeCompare(String(b.title)));
		for (const project of sorted) {
			const key = deriveProjectStatus(project.id, tasks);
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(project);
		}
		return STATUS_ORDER.filter((key) => (map.get(key)?.length ?? 0) > 0).map((key) => ({
			key,
			label: STATUS_LABELS[key],
			items: map.get(key)
		}));
	});

	const NEW_WINDOW_MS = 7 * 86_400_000;

	/** @param {string | undefined | null} iso */
	function isRecent(iso) {
		if (!iso) return false;
		const t = Date.parse(iso);
		if (!Number.isFinite(t)) return false;
		return Date.now() - t < NEW_WINDOW_MS;
	}

	/** @param {string} projectId */
	function newCount(projectId) {
		let n = 0;
		for (const t of tasks) {
			const ids = t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? [];
			if (ids.includes(projectId) && isRecent(t.created_at ?? t._drive?.created_at)) n += 1;
		}
		for (const note of notes) {
			if (
				(note.project_ids ?? []).includes(projectId) &&
				isRecent(note.created_at ?? note._drive?.created_at)
			) {
				n += 1;
			}
		}
		return n;
	}

	/** @param {string} projectId */
	function assigneesFor(projectId) {
		/** @type {Map<string, { email?: string, name?: string }>} */
		const map = new Map();
		for (const t of tasks) {
			const ids = t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? [];
			if (!ids.includes(projectId)) continue;
			for (const a of t.assignees ?? []) {
				const key = (a.email || a.name || '').toLowerCase();
				if (key && !map.has(key)) map.set(key, a);
			}
		}
		return [...map.values()];
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
					aria-label="Add project"
					onclick={() => openComposer('project')}
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
						status={deriveProjectStatus(project.id, tasks)}
						icon={projectDisplayIcon(project, enterprises)}
						newCount={newCount(project.id)}
						assignees={assigneesFor(project.id)}
						onclick={() => selectEntity('project', project.id)}
						selected={ui.selection?.kind === 'project' && ui.selection.id === project.id}
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
		color: var(--fg-66);
	}
</style>
