<script>
	import EnterpriseCard from '$lib/components/EnterpriseCard.svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { primaryEnterpriseId } from '$lib/project-status.js';
	import {
		enterprises,
		notes,
		openComposer,
		projects,
		selectEntity,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const STATUS_ORDER = ['active', 'draft', 'paused', 'closed'];
	const STATUS_LABELS = {
		active: 'ACTIVE',
		draft: 'DRAFT',
		paused: 'PAUSED',
		closed: 'CLOSED'
	};

	const NEW_WINDOW_MS = 7 * 86_400_000;

	const groups = $derived.by(() => {
		/** @type {Map<string, typeof enterprises>} */
		const map = new Map();
		const sorted = [...enterprises].sort(
			(a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.title).localeCompare(String(b.title))
		);
		for (const ent of sorted) {
			const key = STATUS_ORDER.includes(ent.status) ? ent.status : 'active';
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(ent);
		}
		return STATUS_ORDER.filter((key) => (map.get(key)?.length ?? 0) > 0).map((key) => ({
			key,
			label: STATUS_LABELS[key],
			items: map.get(key)
		}));
	});

	/** @param {string} enterpriseId */
	function projectIdsFor(enterpriseId) {
		return projects
			.filter((p) => primaryEnterpriseId(p) === enterpriseId)
			.map((p) => p.id);
	}

	/** @param {string | undefined | null} iso */
	function isRecent(iso) {
		if (!iso) return false;
		const t = Date.parse(iso);
		if (!Number.isFinite(t)) return false;
		return Date.now() - t < NEW_WINDOW_MS;
	}

	/** @param {string} enterpriseId */
	function newCount(enterpriseId) {
		const ids = new Set(projectIdsFor(enterpriseId));
		if (ids.size === 0) return 0;
		let n = 0;
		for (const t of tasks) {
			const pids = t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? [];
			if (pids.some((id) => ids.has(id)) && isRecent(t.created_at ?? t._drive?.created_at)) n += 1;
		}
		for (const note of notes) {
			if (
				(note.project_ids ?? []).some((id) => ids.has(id)) &&
				isRecent(note.created_at ?? note._drive?.created_at)
			) {
				n += 1;
			}
		}
		return n;
	}

	/** @param {string} enterpriseId */
	function assigneesFor(enterpriseId) {
		const ids = new Set(projectIdsFor(enterpriseId));
		/** @type {Map<string, { email?: string, name?: string }>} */
		const map = new Map();
		for (const t of tasks) {
			const pids = t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? [];
			if (!pids.some((id) => ids.has(id))) continue;
			for (const a of t.assignees ?? []) {
				const key = (a.email || a.name || '').toLowerCase();
				if (key && !map.has(key)) map.set(key, a);
			}
		}
		return [...map.values()];
	}
</script>

<svelte:head><title>Entreprises</title></svelte:head>

<div class="feed">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if !appBoot.listsReady && enterprises.length === 0}
		<FeedSkeleton rows={6} />
	{:else if enterprises.length === 0}
		<p class="empty">No Entreprises yet</p>
		<button type="button" class="empty-add" onclick={() => openComposer('enterprise')}>
			Create enterprise
		</button>
	{:else}
		{#each groups as group (group.key)}
			<div class="task-group-header">
				<span class="eyebrow-label-xs">{group.label}</span>
				<span class="task-group-count">{group.items.length}</span>
				<button
					type="button"
					class="task-group-add-btn"
					aria-label="Add enterprise"
					onclick={() => openComposer('enterprise')}
				>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>
			</div>
			<div class="card-stack">
				{#each group.items as ent (ent.id)}
					<EnterpriseCard
						id={ent.id}
						title={ent.title}
						status={ent.status ?? 'active'}
						icon={ent.icon}
						newCount={newCount(ent.id)}
						assignees={assigneesFor(ent.id)}
						onclick={() => selectEntity('enterprise', ent.id)}
						selected={ui.selection?.kind === 'enterprise' && ui.selection.id === ent.id}
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
		padding: 48px 16px 12px;
		color: var(--fg-66);
		margin: 0;
	}

	.empty-add {
		margin: 0 16px 24px;
		height: 36px;
		padding: 0 16px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
		align-self: flex-start;
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
