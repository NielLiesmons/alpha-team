<script>
	import FeedEmpty from '$lib/components/FeedEmpty.svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { projectDisplayIcon, projectLifecycle } from '$lib/project-status.js';
	import {
		enterprises,
		notes,
		projects,
		selectEntity,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const NEW_WINDOW_MS = 7 * 86_400_000;

	const sorted = $derived.by(() => {
		const f = ui.listFilter;
		let list = [...projects];
		if (f === 'active' || f === 'archived') {
			list = list.filter((p) => projectLifecycle(p, tasks) === f);
		}
		return list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
	});

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
</script>

<svelte:head><title>{t('projects.title')}</title></svelte:head>

<div class="feed">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if (!appBoot.listsReady || !ui.entitiesReady) && projects.length === 0}
		<FeedSkeleton rows={6} />
	{:else if projects.length === 0}
		<FeedEmpty title={t('projects.empty')} body={t('projects.emptyBody')} />
	{:else if sorted.length === 0}
		<FeedEmpty title={t('projects.emptyFilter')} body={t('projects.emptyFilterBody')} />
	{:else}
		<div class="card-stack">
			{#each sorted as project (project.id)}
				<ProjectCard
					id={project.id}
					title={project.title}
					status={projectLifecycle(project, tasks)}
					icon={projectDisplayIcon(project, enterprises)}
					newCount={newCount(project.id)}
					onclick={() => selectEntity('project', project.id)}
					selected={ui.selection?.kind === 'project' && ui.selection.id === project.id}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.banner {
		margin: 0;
		padding: 10px 16px;
		font-size: 0.8125rem;
		color: var(--fg-66);
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 4px 6px 10px;
		box-sizing: border-box;
	}
</style>
