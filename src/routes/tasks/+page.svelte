<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import TaskCard from '$lib/components/TaskCard.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { moments, openComposer, selectEntity, tasks, ui } from '$lib/workspace.svelte.js';

	/** @param {string} taskId */
	function momentAssigneeEmails(taskId) {
		moments.length;
		/** @type {string[]} */
		const out = [];
		const seen = new Set();
		for (const m of moments) {
			if (m.task_id !== taskId || m.status === 'canceled') continue;
			for (const raw of m.assignees || []) {
				const e = String(raw || '')
					.trim()
					.toLowerCase();
				if (!e || seen.has(e)) continue;
				seen.add(e);
				out.push(e);
			}
		}
		return out;
	}

	const STATUS_ORDER = [
		'inReview',
		'inProgress',
		'planned',
		'open',
		'backlog',
		'closed',
		'canceled'
	];
	/** @type {Record<string, string>} */
	const STATUS_LABEL_KEYS = {
		inReview: 'tasks.groupInReview',
		inProgress: 'tasks.groupInProgress',
		planned: 'tasks.groupPlanned',
		open: 'tasks.groupOpen',
		backlog: 'tasks.groupBacklog',
		closed: 'tasks.groupClosed',
		canceled: 'tasks.groupCanceled'
	};
	const DONE = new Set(['closed', 'canceled']);

	const groups = $derived.by(() => {
		locale.value;
		/** @type {Map<string, typeof tasks>} */
		const map = new Map();
		const f = ui.listFilter;
		const sorted = [...tasks]
			.filter((t) => {
				const st = STATUS_ORDER.includes(t.status) ? t.status : 'open';
				if (f === 'open') return !DONE.has(st);
				if (f === 'done') return DONE.has(st);
				return true;
			})
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
		for (const task of sorted) {
			const key = STATUS_ORDER.includes(task.status) ? task.status : 'open';
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(task);
		}
		return STATUS_ORDER.filter((key) => (map.get(key)?.length ?? 0) > 0).map((key) => ({
			key,
			label: t(STATUS_LABEL_KEYS[key]),
			items: map.get(key)
		}));
	});
</script>

<svelte:head><title>{t('tasks.title')}</title></svelte:head>

<div class="feed">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if !appBoot.listsReady && tasks.length === 0}
		<FeedSkeleton rows={8} />
	{:else if tasks.length === 0}
		<p class="empty">{t('tasks.empty')}</p>
	{:else if groups.length === 0}
		<p class="empty">{t('tasks.emptyFilter')}</p>
	{:else}
		{#each groups as group (group.key)}
			<div class="task-group-header">
				<span class="eyebrow-label-xs">{group.label}</span>
				<span class="task-group-count">{group.items.length}</span>
				<button
					type="button"
					class="task-group-add-btn"
					aria-label="{t('projects.addTask')}: {group.label}"
					onclick={() => openComposer('task', undefined, group.key)}
				>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>
			</div>
			<div class="card-stack">
				{#each group.items as task (task.id)}
					<TaskCard
						id={task.id}
						title={task.title}
						status={task.status}
						priority={task.priority}
						author={task.author}
						assignees={task.assignees ?? []}
						momentAssignees={momentAssigneeEmails(task.id)}
						fromMail={Boolean(task.mail_thread_id || task._drive?.mail_thread_id)}
						onclick={() => selectEntity('task', task.id)}
						selected={ui.selection?.kind === 'task' && ui.selection.id === task.id}
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

	.banner a {
		color: var(--fg);
		text-underline-offset: 2px;
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
		margin: 0 10px;
		padding: 6px 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		width: auto;
		box-sizing: border-box;
	}

	@media (max-width: 767px) {
		.task-group-header {
			margin: 0 14px;
		}
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 0;
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
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 500;
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		color: var(--fg-33);
	}

	.task-group-add-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: transparent;
		border: none;
		color: var(--fg-33);
		cursor: pointer;
		flex-shrink: 0;
		padding: 0;
	}

	.task-group-add-btn:hover,
	.task-group-add-btn:active {
		background: transparent;
		color: var(--fg-66);
	}
</style>
