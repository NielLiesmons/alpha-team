<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import {
		buildPubsFeed,
		campaigns,
		mailSettings,
		persistDeleteCampaign,
		persistDeletePost,
		pubsUi,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { getAdminToken } from '$lib/mail-api.js';
	import { clearSelection, openComposer, selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let actionBusy = $state(false);

	onMount(() => {
		refreshPublications();
		/* Hub opens in the third column (like an Entreprise). */
		selectEntity('pubs', 'hub');
	});

	const kindFilter = $derived($page.url.searchParams.get('kind') || 'all');
	const feed = $derived(buildPubsFeed());

	const filtered = $derived.by(() => {
		if (kindFilter === 'general') return [];
		if (kindFilter === 'blog') return feed.filter((x) => x.bucket === 'blog');
		if (kindFilter === 'post') return feed.filter((x) => x.bucket === 'post');
		if (kindFilter === 'event') return feed.filter((x) => x.bucket === 'event');
		if (kindFilter === 'draft') {
			return feed.filter((x) => x.status === 'draft' || x.status === 'failed');
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
	function openItem(item) {
		if (item.source === 'campaign') {
			selectEntity('newsletter', item.id);
			return;
		}
		if (item.slug) {
			selectEntity('newsletter', `post:${item.slug}`);
			return;
		}
		if (item.siteUrl) window.open(item.siteUrl, '_blank', 'noopener,noreferrer');
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	function editItem(item) {
		if (item.source === 'campaign') openComposer('newsletter', item.id);
		else if (item.slug) openComposer('newsletter', `post:${item.slug}`);
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	async function deleteItem(item) {
		const label = item.title || 'this publication';
		if (
			!confirm(
				`Delete “${label}”? This removes it from the public site${item.source === 'campaign' ? ' and the letter record' : ''}.`
			)
		)
			return;
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
			Add the Publications API token in <a href="/settings">Settings</a> to load welcome + letters.
		</p>
	{:else if pubsUi.error}
		<p class="banner err" role="alert">
			{pubsUi.error}
			<button type="button" class="linkish" onclick={() => refreshPublications()}>{t('common.retry')}</button>
		</p>
	{:else if pubsUi.loading && campaigns.length === 0 && feed.length === 0}
		<FeedSkeleton rows={5} />
	{/if}

	<div class="top-bar">
		<div class="filters" role="tablist" aria-label="Filter">
			{#each [
				{ id: 'all', label: t('pub.all') },
				{ id: 'blog', label: t('pub.blog') },
				{ id: 'post', label: t('pub.posts') },
				{ id: 'event', label: t('pub.events') },
				{ id: 'draft', label: t('pub.drafts') }
			] as f (f.id)}
				<a
					class="chip"
					class:on={kindFilter === f.id || (f.id === 'all' && kindFilter === 'all')}
					href={`/publications?kind=${f.id}`}
					onclick={() => selectEntity('pubs', 'hub')}
				>
					{f.label}
				</a>
			{/each}
		</div>
		<button
			type="button"
			class="geek"
			aria-label={t('detail.mailSettings')}
			title={t('pub.welcomeFooter')}
			onclick={() => openComposer('welcome')}
		>
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4" />
				<path
					d="M8 2.2v1.3M8 12.5v1.3M2.2 8h1.3M12.5 8h1.3M3.8 3.8l.9.9M11.3 11.3l.9.9M3.8 12.2l.9-.9M11.3 4.7l.9-.9"
					stroke="currentColor"
					stroke-width="1.3"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>

	{#if kindFilter === 'general'}
		<div class="card-stack">
			<button
				type="button"
				class="row"
				class:on={ui.selection?.kind === 'welcome'}
				onclick={() => selectEntity('welcome', 'welcome')}
				ondblclick={() => openComposer('welcome')}
			>
				<span class="title-row">
					<span class="title">{t('pub.welcomeMessage')}</span>
					<span class="meta">{mailSettings.welcome.enabled ? t('pub.on') : t('pub.off')}</span>
				</span>
				<span class="preview">Sent when someone joins the list · footer lives here too</span>
			</button>
		</div>
	{:else}
		<div class="card-stack">
			{#each filtered as item (item.key)}
				<div
					class="row-wrap"
					class:on={ui.selection?.kind === 'newsletter' &&
						((item.source === 'campaign' && ui.selection.id === item.id) ||
							(item.slug && ui.selection.id === `post:${item.slug}`))}
				>
					<button
						type="button"
						class="row"
						onclick={() => openItem(item)}
						ondblclick={() => editItem(item)}
					>
						<span class="title-row">
							<span class="title">{item.title}</span>
							<span class="meta"
								>{bucketLabel(item.bucket)}{#if item.updatedAt}
									· {t('pub.edited')}{/if}{#if item.status && item.source === 'campaign'}
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
							class="act"
							disabled={actionBusy}
							onclick={() => editItem(item)}>{t('common.edit')}</button
						>
						<button
							type="button"
							class="act danger"
							disabled={actionBusy}
							onclick={() => void deleteItem(item)}>{t('common.delete')}</button
						>
					</div>
				</div>
			{/each}

			{#if !pubsUi.loading && filtered.length === 0 && getAdminToken() && !pubsUi.error}
				<p class="empty soft">Nothing in this filter — New to publish a letter.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		gap: 6px;
		padding-bottom: 12px;
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

	.banner.err {
		color: var(--accent);
	}

	.banner a,
	.linkish {
		color: var(--fg);
		font-weight: 600;
	}

	.linkish {
		margin-left: 8px;
		border: 0;
		background: none;
		cursor: pointer;
		font: inherit;
		text-decoration: underline;
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px 4px;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-width: 0;
	}

	.geek {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: var(--fg-4);
		color: var(--fg-66);
		cursor: pointer;
	}

	.geek:hover {
		color: var(--fg);
	}

	.chip {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font-size: 12px;
		font-weight: 650;
		text-decoration: none;
	}

	.chip.on {
		background: var(--selection);
		color: var(--fg);
	}

	.empty.soft {
		padding: 8px 16px 12px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--fg-33);
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

	.row-wrap:hover {
		background: var(--fg-4);
	}

	.row-wrap.on {
		background: var(--selection);
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(0.2rem + 2px);
		flex: 1;
		min-width: 0;
		padding: calc(0.85rem - 4px) 0.9rem;
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
		gap: 2px;
		padding: 6px 8px 6px 0;
		opacity: 0.55;
	}

	.row-wrap:hover .row-actions {
		opacity: 1;
	}

	.act {
		padding: 4px 8px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 11px;
		font-weight: 650;
		cursor: pointer;
		white-space: nowrap;
	}

	.act:hover:not(:disabled) {
		color: var(--fg);
	}

	.act.danger:hover:not(:disabled) {
		color: #b44;
	}

	.act:disabled {
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
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
