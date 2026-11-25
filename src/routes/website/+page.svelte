<script>
	import { onMount } from 'svelte';
	import {
		audiences,
		moderationComments,
		publicPosts,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { fetchAnalyticsSummary, getAdminToken } from '$lib/mail-api.js';
	import { activeWebsite, websiteChildren, websites } from '$lib/sections.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const site = $derived(activeWebsite());

	let visits7 = $state(/** @type {number | null} */ (null));
	let uniques7 = $state(/** @type {number | null} */ (null));

	onMount(() => {
		void refreshPublications();
		if (!getAdminToken()) {
			visits7 = 0;
			uniques7 = 0;
			return;
		}
		void (async () => {
			try {
				const s = await fetchAnalyticsSummary(7);
				visits7 = Number(s?.pageviews) || 0;
				uniques7 = Number(s?.uniques) || 0;
			} catch {
				visits7 = 0;
				uniques7 = 0;
			}
		})();
	});

	const latestPubTitle = $derived.by(() => {
		const posts = [...publicPosts];
		if (!posts.length) return '';
		posts.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
		return String(posts[0]?.title || '').trim();
	});

	const commentCount = $derived(moderationComments.length);

	/**
	 * Open Website deeper pages in the detail column (never replace this feed).
	 * @param {(typeof websiteChildren)[number]} item
	 */
	function openSection(item) {
		const id = item.selectionId;
		if (id === 'hub' || id === 'activity' || id === 'audiences') void refreshPublications();
		selectEntity('pubs', id);
	}

	/**
	 * Compact preview copy — metrics when known, never marketing blurbs.
	 * @param {string} labelKey
	 */
	function previewFor(labelKey) {
		if (labelKey === 'nav.activity') {
			const v = visits7 == null ? '—' : visits7.toLocaleString();
			const parts = [t('web.visitsPreview', { n: v })];
			if (commentCount > 0) parts.push(t('web.commentsPreview', { n: String(commentCount) }));
			return parts.join(' · ');
		}
		if (labelKey === 'nav.publications') {
			return latestPubTitle || t('web.pubsPreview');
		}
		if (labelKey === 'nav.audiences') {
			const n = audiences.length;
			return n ? t('web.audiencesPreview', { n: String(n) }) : t('web.audiencesPreviewEmpty');
		}
		if (labelKey === 'nav.shop') return t('web.shopPreview');
		if (labelKey === 'nav.content') return t('web.contentPreview');
		return '';
	}

	/** @param {string} labelKey */
	function metricFor(labelKey) {
		if (labelKey === 'nav.activity' && visits7 != null) return visits7.toLocaleString();
		if (labelKey === 'nav.activity' && uniques7 != null) return uniques7.toLocaleString();
		if (labelKey === 'nav.publications') return publicPosts.length ? String(publicPosts.length) : '';
		if (labelKey === 'nav.audiences' && audiences.length) return String(audiences.length);
		return '';
	}

	/** @param {(typeof websiteChildren)[number]} item */
	function rowOn(item) {
		const sel = ui.selection;
		if (!sel) return false;
		if (item.selectionId === 'hub') {
			return (
				(sel.kind === 'pubs' && sel.id === 'hub') ||
				sel.kind === 'newsletter' ||
				sel.kind === 'welcome'
			);
		}
		return sel.kind === 'pubs' && sel.id === item.selectionId;
	}
</script>

<svelte:head><title>{site?.host || t('nav.website')}</title></svelte:head>

<nav class="feed" aria-label={site?.host || t('nav.website')}>
	{#if websites.length === 0}
		<p class="hint">{t('web.noSite')}</p>
	{:else}
		<div class="bento">
			{#each websiteChildren as item (item.selectionId)}
				{@const metric = metricFor(item.labelKey)}
				<button
					type="button"
					class="panel"
					class:on={rowOn(item)}
					onclick={() => openSection(item)}
				>
					<span class="panel-main">
						<span class="eyebrow">{t(item.labelKey)}</span>
						<span class="preview">{previewFor(item.labelKey)}</span>
					</span>
					{#if metric}
						<span class="metric" aria-hidden="true">{metric}</span>
					{/if}
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

	.bento {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		padding: 0 12px 8px;
		box-sizing: border-box;
	}

	.panel {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		min-width: 0;
		min-height: 96px;
		padding: 14px 14px 16px;
		border: 0;
		border-radius: 16px;
		background: var(--fg-4);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.panel:hover,
	.panel.on {
		background: var(--fg-8);
	}

	.panel-main {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.eyebrow {
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.preview {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg);
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.metric {
		flex-shrink: 0;
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--fg);
		font-variant-numeric: tabular-nums;
		padding-top: 2px;
	}

	.hint {
		margin: 24px 16px;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
	}

	@media (max-width: 520px) {
		.bento {
			grid-template-columns: 1fr;
		}
	}
</style>
