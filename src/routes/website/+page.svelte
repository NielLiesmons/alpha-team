<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { refreshPublications } from '$lib/publications.svelte.js';
	import { activeWebsite, websiteChildren, websites } from '$lib/sections.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const site = $derived(activeWebsite());
	const path = $derived($page.url.pathname);

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
		if (labelKey === 'nav.publications') return t('web.pubsPreview');
		if (labelKey === 'nav.activity') return t('web.activityPreview');
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
					<span class="row-ico" aria-hidden="true">
						<NavIcon name={item.icon} size={18} />
					</span>
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

	.row-ico {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		margin-top: 2px;
		color: var(--fg-66);
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
	}

	.hint {
		margin: 24px 16px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
	}
</style>
