<script>
	import { onMount } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import DropdownMenu from '$lib/components/DropdownMenu.svelte';
	import MoreDots from '$lib/components/icons/MoreDots.svelte';
	import {
		buildPubsFeed,
		campaigns,
		persistDeleteCampaign,
		persistDeletePost,
		pubsUi,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { getAdminToken } from '$lib/mail-api.js';
	import { clearSelection, openComposer, selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let actionBusy = $state(false);
	let menuOpen = $state(false);
	/** @type {HTMLElement | null} */
	let menuAnchor = $state(null);
	/** @type {ReturnType<typeof buildPubsFeed>[number] | null} */
	let menuItem = $state(null);

	onMount(() => {
		void refreshPublications();
	});

	const kindFilter = $derived(ui.listFilter || 'all');
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
	function editItem(item) {
		const id = selectionId(item);
		if (id) openComposer('newsletter', id);
	}

	/** @param {MouseEvent} e @param {ReturnType<typeof buildPubsFeed>[number]} item */
	function openRowMenu(e, item) {
		e.preventDefault();
		e.stopPropagation();
		menuAnchor = /** @type {HTMLElement} */ (e.currentTarget);
		menuItem = item;
		menuOpen = true;
	}

	function closeRowMenu() {
		menuOpen = false;
		menuItem = null;
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

	const menuItems = $derived.by(() => {
		const item = menuItem;
		if (!item) return [];
		return [
			{
				id: 'edit',
				label: t('common.edit'),
				onclick: () => {
					closeRowMenu();
					editItem(item);
				}
			},
			{
				id: 'delete',
				label: t('common.delete'),
				danger: true,
				disabled: actionBusy,
				onclick: () => {
					closeRowMenu();
					void deleteItem(item);
				}
			}
		];
	});
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

	<div class="card-stack">
		{#each filtered as item (item.key)}
			{@const cover = item.imageUrl || ''}
			<div class="card" class:on={isOn(item)}>
				<button type="button" class="card-main" onclick={() => openItem(item)}>
					<span
						class="cover"
						class:empty={!cover}
						style:--cover={cover ? `url(${cover})` : 'none'}
						aria-hidden="true"
					></span>
					<span class="copy">
						<span class="title">{item.title}</span>
						<span class="snippet"
							>{#if item.preview}{item.preview}{:else}{bucketLabel(item.bucket)}{#if item.when}
									· {formatWhen(item.when)}{/if}{/if}</span
						>
					</span>
				</button>
				<button
					type="button"
					class="more"
					aria-label={t('common.more')}
					aria-expanded={menuOpen && menuItem?.key === item.key}
					onclick={(e) => openRowMenu(e, item)}
				>
					<MoreDots size={14} />
				</button>
			</div>
		{/each}

		{#if !pubsUi.loading && filtered.length === 0 && getAdminToken() && !pubsUi.error}
			<p class="empty">{t('pub.nothingYet')}</p>
		{/if}
	</div>
</div>

<DropdownMenu
	open={menuOpen}
	anchor={menuAnchor}
	placement="below"
	align="end"
	width={180}
	items={menuItems}
	onclose={closeRowMenu}
/>

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
		gap: 10px;
		padding: 0 6px;
		box-sizing: border-box;
	}

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		border-radius: 14px;
		overflow: hidden;
		background: transparent;
	}

	.card:hover,
	.card.on {
		background: var(--fg-4);
	}

	.card-main {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.cover {
		display: block;
		aspect-ratio: 1.91 / 1;
		min-height: 120px;
		width: 100%;
		background:
			var(--cover) center / cover no-repeat,
			radial-gradient(120% 80% at 30% 20%, var(--fg-8), transparent 55%),
			linear-gradient(160deg, var(--fg-4), var(--fg-8));
	}

	.cover.empty {
		background:
			radial-gradient(120% 80% at 30% 20%, var(--fg-8), transparent 55%),
			linear-gradient(160deg, var(--fg-4), var(--fg-8));
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px 12px;
		box-sizing: border-box;
	}

	.title {
		font-size: 14px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-right: 36px;
	}

	.snippet {
		font-size: 13px;
		font-weight: 500;
		line-height: 1.35;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-right: 36px;
	}

	.more {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		color: var(--fg-66);
		cursor: pointer;
		padding: 0;
		z-index: 1;
	}

	.more:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--bg) 88%, transparent);
	}
</style>
