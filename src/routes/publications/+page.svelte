<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import Pen from '$lib/components/icons/Pen.svelte';
	import Trash from '$lib/components/icons/Trash.svelte';
	import {
		buildPubsFeed,
		campaigns,
		persistDeleteCampaign,
		persistDeletePost,
		pubsUi,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { getAdminToken } from '$lib/mail-api.js';
	import { clearSelection, selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let actionBusy = $state(false);

	onMount(() => {
		void refreshPublications();
	});

	const kindFilter = $derived($page.url.searchParams.get('kind') || 'all');
	const feed = $derived(buildPubsFeed());

	const filtered = $derived.by(() => {
		if (kindFilter === 'blog') return feed.filter((x) => x.bucket === 'blog');
		if (kindFilter === 'post') return feed.filter((x) => x.bucket === 'post');
		if (kindFilter === 'event') return feed.filter((x) => x.bucket === 'event');
		if (kindFilter === 'draft') {
			return feed.filter(
				(x) => x.status === 'draft' || x.status === 'failed' || x.status === 'scheduled'
			);
		}
		if (kindFilter === 'sent') return feed.filter((x) => x.status === 'sent');
		return feed;
	});

	/** @param {number | string | undefined} ts */
	function formatWhen(ts) {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** @param {string} bucket */
	function bucketLabel(bucket) {
		if (bucket === 'blog' || bucket === 'letter') return t('pub.blog');
		if (bucket === 'event') return t('pub.event');
		if (bucket === 'post') return t('pub.post');
		return bucket;
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	function selectionId(item) {
		if (item.source === 'campaign') return item.id;
		if (item.slug) return `post:${item.slug}`;
		return '';
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	function isOn(item) {
		if (ui.selection?.kind !== 'newsletter') return false;
		return ui.selection.id === selectionId(item);
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	function openItem(item) {
		const id = selectionId(item);
		if (id) selectEntity('newsletter', id);
		else if (item.siteUrl) window.open(item.siteUrl, '_blank', 'noopener,noreferrer');
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	async function deleteItem(item) {
		const label = item.title || t('common.untitled');
		if (!confirm(t('pub.deleteConfirm', { label }))) return;
		actionBusy = true;
		try {
			if (item.source === 'campaign') {
				await persistDeleteCampaign(item.id);
				if (ui.selection?.kind === 'newsletter' && ui.selection.id === item.id) clearSelection();
			} else if (item.slug) {
				await persistDeletePost(item.slug);
				if (
					ui.selection?.kind === 'newsletter' &&
					String(ui.selection.id) === `post:${item.slug}`
				) {
					clearSelection();
				}
			}
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			actionBusy = false;
		}
	}
</script>

<svelte:head><title>{t('nav.publications')}</title></svelte:head>

<div class="feed">
	{#if !getAdminToken()}
		<p class="banner">
			{t('pub.addToken')}
		</p>
	{:else if pubsUi.error}
		<p class="banner" role="alert">
			{pubsUi.error}
			<button type="button" class="linkish" onclick={() => refreshPublications()}>{t('common.retry')}</button>
		</p>
	{:else if pubsUi.loading && campaigns.length === 0 && feed.length === 0}
		<FeedSkeleton rows={5} />
	{/if}

	<div class="filters" role="tablist" aria-label={t('filter.all')}>
		{#each [
			{ id: 'all', label: t('pub.all') },
			{ id: 'blog', label: t('pub.blog') },
			{ id: 'post', label: t('pub.posts') },
			{ id: 'event', label: t('pub.events') },
			{ id: 'draft', label: t('pub.drafts') }
		] as f (f.id)}
			<a
				class="chip"
				class:on={kindFilter === f.id}
				href={`/publications?kind=${f.id}`}
			>
				{f.label}
			</a>
		{/each}
	</div>

	<div class="card-stack">
		{#each filtered as item (item.key)}
			<div class="row-wrap" class:on={isOn(item)}>
				<button type="button" class="row" onclick={() => openItem(item)}>
					<span class="title-row">
						<span class="title">{item.title}</span>
						<span class="meta"
							>{bucketLabel(item.bucket)}{#if item.status && item.source === 'campaign'}
								· {item.status}{/if}{#if item.when}
								· {formatWhen(item.when)}{/if}</span
						>
					</span>
					{#if item.preview}
						<span class="preview">{item.preview}</span>
					{/if}
				</button>
				<div class="row-actions">
					<button
						type="button"
						class="icon-pill"
						aria-label={t('common.edit')}
						disabled={actionBusy}
						onclick={() => openItem(item)}
					>
						<Pen size={14} />
					</button>
					<button
						type="button"
						class="icon-pill"
						aria-label={t('common.delete')}
						disabled={actionBusy}
						onclick={() => void deleteItem(item)}
					>
						<Trash size={14} />
					</button>
				</div>
			</div>
		{/each}

		{#if !pubsUi.loading && filtered.length === 0 && getAdminToken() && !pubsUi.error}
			<p class="empty">{t('pub.nothingYet')}</p>
		{/if}
	</div>
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		gap: 6px;
		padding-top: var(--feed-pad-top, 48px);
		padding-bottom: var(--feed-pad-bottom, 40px);
		box-sizing: border-box;
	}

	.banner {
		margin: 8px 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--fg-4);
		font-size: 13px;
		color: var(--fg-66);
		line-height: 1.4;
	}

	.linkish {
		margin-left: 8px;
		border: 0;
		background: none;
		cursor: pointer;
		font: inherit;
		font-weight: 600;
		color: var(--fg);
		text-decoration: underline;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 4px 12px 8px;
	}

	.chip {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
	}

	.chip.on {
		background: var(--fg-4);
		color: var(--fg);
	}

	.empty {
		padding: 16px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--fg-33);
		text-align: center;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 6px;
		box-sizing: border-box;
	}

	.row-wrap {
		display: flex;
		align-items: stretch;
		gap: 2px;
		border-radius: 12px;
	}

	.row-wrap:hover,
	.row-wrap.on {
		background: var(--fg-4);
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
		flex: 1;
		min-width: 0;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.row-actions {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		padding: 6px 8px 6px 0;
		opacity: 0;
	}

	.row-wrap:hover .row-actions,
	.row-wrap.on .row-actions {
		opacity: 1;
	}

	.icon-pill {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		cursor: pointer;
		padding: 0;
	}

	.icon-pill:hover:not(:disabled) {
		color: var(--fg);
	}

	.icon-pill:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.title-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-width: 0;
	}

	.title {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		flex-shrink: 0;
		padding-right: 2px;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.preview {
		display: block;
		font-size: 13px;
		line-height: 1.35;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
