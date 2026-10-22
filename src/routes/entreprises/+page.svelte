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

	const NEW_WINDOW_MS = 7 * 86_400_000;

	const sorted = $derived(
		[...enterprises].sort(
			(a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.title).localeCompare(String(b.title))
		)
	);

	/** @param {string} enterpriseId */
	function projectIdsFor(enterpriseId) {
		return projects.filter((p) => primaryEnterpriseId(p) === enterpriseId).map((p) => p.id);
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
		<div class="card-stack">
			{#each sorted as ent (ent.id)}
				<EnterpriseCard
					id={ent.id}
					title={ent.title}
					status={ent.status ?? 'active'}
					icon={ent.icon}
					newCount={newCount(ent.id)}
					onclick={() => selectEntity('enterprise', ent.id)}
					selected={ui.selection?.kind === 'enterprise' && ui.selection.id === ent.id}
				/>
			{/each}
		</div>
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

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 6px 10px;
		box-sizing: border-box;
	}
</style>
