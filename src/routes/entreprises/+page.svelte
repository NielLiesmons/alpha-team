<script>
	import { onMount } from 'svelte';
	import EnterpriseCard from '$lib/components/EnterpriseCard.svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		applyEntreprisesUrl,
		openEntreprisesEntity,
		syncEntreprisesUrl
	} from '$lib/entity-routes.js';
	import { primaryEnterpriseId } from '$lib/project-status.js';
	import { t } from '$lib/i18n.svelte.js';
	import {
		dataTables,
		dataViews,
		enterprises,
		metrics,
		notes,
		openComposer,
		projects,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const NEW_WINDOW_MS = 7 * 86_400_000;

	/** Closed / muted enterprise statuses (match EnterpriseBox). */
	const CLOSED = new Set(['draft', 'paused', 'closed', 'archived']);

	const sortedEnterprises = $derived.by(() => {
		const f = ui.listFilter;
		let list = [...enterprises];
		if (f === 'active') {
			list = list.filter((e) => !CLOSED.has(String(e.status ?? 'active').toLowerCase()));
		} else if (f === 'closed') {
			list = list.filter((e) => CLOSED.has(String(e.status ?? 'active').toLowerCase()));
		}
		return list.sort(
			(a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.title).localeCompare(String(b.title))
		);
	});

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

	onMount(() => {
		applyEntreprisesUrl();
		const onPop = () => applyEntreprisesUrl();
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	});

	/* Re-resolve deep links once Drive lists hydrate (keys → ids). */
	$effect(() => {
		enterprises.length;
		dataTables.length;
		metrics.length;
		dataViews.length;
		if (typeof location !== 'undefined' && location.search) applyEntreprisesUrl();
	});

	$effect(() => {
		ui.selection;
		syncEntreprisesUrl();
	});
</script>

<svelte:head><title>{t('ent.title')}</title></svelte:head>

<div class="feed">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}

	{#if !appBoot.listsReady && enterprises.length === 0 && dataTables.length === 0}
		<FeedSkeleton rows={6} />
	{:else if enterprises.length === 0}
		<p class="empty">{t('ent.empty')}</p>
		<button type="button" class="empty-add" onclick={() => openComposer('enterprise')}
			>{t('ent.create')}</button
		>
	{:else if sortedEnterprises.length === 0}
		<p class="empty">{t('ent.emptyFilter')}</p>
	{:else}
		<div class="card-stack">
			{#each sortedEnterprises as ent (ent.id)}
				<EnterpriseCard
					id={ent.id}
					title={ent.title}
					status={ent.status ?? 'active'}
					icon={ent.icon}
					newCount={newCount(ent.id)}
					onclick={() => openEntreprisesEntity('enterprise', ent.id)}
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

	.err {
		color: #b44;
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
		gap: 0;
		padding: 4px 6px 10px;
		box-sizing: border-box;
	}
</style>
