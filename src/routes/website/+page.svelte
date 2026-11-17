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

	/** @param {string} href */
	function openSection(href) {
		if (href === '/website/activity') {
			void refreshPublications();
			selectEntity('pubs', 'activity');
			return;
		}
		goto(href);
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
		if (labelKey === 'nav.shop') return t('web.shopPreview');
		if (labelKey === 'nav.content') return t('web.contentPreview');
		return '';
	}

	/** @param {string} labelKey */
	function metricFor(labelKey) {
		if (labelKey === 'nav.activity' && visits7 != null) return visits7.toLocaleString();
		if (labelKey === 'nav.activity' && uniques7 != null) return uniques7.toLocaleString();
		if (labelKey === 'nav.publications') return publicPosts.length ? String(publicPosts.length) : '';
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
		<div class="hub">
			{#each websiteChildren as item (item.href)}
				{@const metric = metricFor(item.labelKey)}
				<button
					type="button"
					class="section"
					class:on={rowOn(item.href)}
					onclick={() => openSection(item.href)}
				>
					<span class="section-main">
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

	.hub {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--fg-8);
	}

	.section {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		width: 100%;
		padding: 16px 16px 18px;
		border: 0;
		border-bottom: 1px solid var(--fg-8);
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.section:hover,
	.section.on {
		background: var(--fg-4);
	}

	.section-main {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		flex: 1;
	}

	.eyebrow {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.preview {
		font-size: 13px;
		font-weight: 500;
		color: var(--fg);
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.metric {
		flex-shrink: 0;
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--fg);
		font-variant-numeric: tabular-nums;
		padding-right: 2px;
	}

	.hint {
		margin: 24px 16px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
	}
</style>
