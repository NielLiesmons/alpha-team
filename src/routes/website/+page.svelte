<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import {
		moderationComments,
		publicPosts,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { fetchAnalyticsSummary, getAdminToken } from '$lib/mail-api.js';
	import { activeWebsite, websiteChildren, websites } from '$lib/sections.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const site = $derived(activeWebsite());
	const path = $derived($page.url.pathname);

	let visits7 = $state(/** @type {number | null} */ (null));

	onMount(() => {
		void refreshPublications();
		if (!getAdminToken()) return;
		void (async () => {
			try {
				const s = await fetchAnalyticsSummary(7);
				visits7 = Number(s?.pageviews) || 0;
			} catch {
				visits7 = null;
			}
		})();
	});

	const latestPubTitle = $derived.by(() => {
		const posts = [...publicPosts];
		if (!posts.length) return '';
		posts.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
		return String(posts[0]?.title || '').trim();
	});

	/** @param {string} href */
	function openSection(href) {
		if (href === '/website/activity') {
			void refreshPublications();
			selectEntity('pubs', 'activity');
			return;
		}
		goto(href);
	}

	/** @param {string} labelKey */
	function previewFor(labelKey) {
		if (labelKey === 'nav.activity') {
			const parts = [];
			if (visits7 != null) {
				parts.push(
					t('web.visitsPreview', { n: visits7.toLocaleString() })
				);
			}
			const n = moderationComments.length;
			if (n > 0) parts.push(t('web.commentsPreview', { n: String(n) }));
			if (parts.length) return parts.join(' · ');
			return t('web.activityPreview');
		}
		if (labelKey === 'nav.publications') {
			return latestPubTitle || t('web.pubsPreview');
		}
		if (labelKey === 'nav.shop') return t('web.shopPreview');
		if (labelKey === 'nav.content') return t('web.contentPreview');
		return '';
	}

	/** @param {string} href */
	function rowOn(href) {
		if (href === '/website/activity') return ui.selection?.kind === 'pubs' && ui.selection?.id === 'activity';
		return path === href || path.startsWith(`${href}/`);
	}
</script>

<svelte:head><title>{site?.host || t('nav.website')}</title></svelte:head>

<nav class="feed" aria-label={site?.host || t('nav.website')}>
	{#if websites.length === 0}
		<p class="hint">{t('web.noSite')}</p>
	{:else}
		<div class="card-stack">
			{#each websiteChildren as item (item.href)}
				<button
					type="button"
					class="row"
					class:on={rowOn(item.href)}
					onclick={() => openSection(item.href)}
				>
					<span class="row-main">
						<span class="title">{t(item.labelKey)}</span>
						<span class="preview">{previewFor(item.labelKey)}</span>
					</span>
				</button>
			{/each}
		</div>
	{/if}
</nav>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding-top: var(--feed-pad-top, 48px);
		padding-bottom: var(--feed-pad-bottom, 40px);
		box-sizing: border-box;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 6px;
	}

	.row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.row:hover,
	.row.on {
		background: var(--fg-4);
	}

	.row-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.title {
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
		line-height: 1.3;
	}

	.preview {
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-66);
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hint {
		margin: 24px 16px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
	}
</style>
