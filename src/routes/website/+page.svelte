<script>
	import { goto } from '$app/navigation';
	import { refreshPublications } from '$lib/publications.svelte.js';
	import { space, websiteChildren, websites } from '$lib/sections.js';
	import { selectEntity } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @param {string} href */
	function openSection(href) {
		if (href === '/publications') {
			/* Stay on /website — hub opens in the 3rd column (Entreprise-style).
			 * Do not goto('/publications'): AppShell clears selection on path change. */
			void refreshPublications();
			selectEntity('pubs', 'hub');
			return;
		}
		goto(href);
	}

	/** @param {string} url */
	function hostLabel(url) {
		return String(url || '')
			.replace(/^https?:\/\//, '')
			.replace(/\/$/, '');
	}
</script>

<svelte:head><title>{t('nav.website')}</title></svelte:head>

<nav class="feed" aria-label={t('nav.website')}>
	<div class="card-stack">
		{#each websites as site (site.id)}
			<article class="site-card">
				<div class="site-hero">
					{#if site.ogImage}
						<img class="site-og" src={site.ogImage} alt="" loading="lazy" />
					{:else}
						<div class="site-og-fallback" aria-hidden="true"></div>
					{/if}
					<div class="site-fade">
						<h2 class="site-name">{site.name}</h2>
						{#if site.siteUrl}
							<a
								class="site-url"
								href={site.siteUrl}
								target="_blank"
								rel="noopener noreferrer">{hostLabel(site.siteUrl)}</a
							>
						{:else if site.tagline}
							<p class="site-url">{site.tagline}</p>
						{/if}
					</div>
				</div>
				<div class="site-links" role="group" aria-label={t('detail.sectionsOf', { name: site.name })}>
					{#each websiteChildren as item (item.href)}
						<button type="button" class="site-link" onclick={() => openSection(item.href)}>
							{item.label}
						</button>
					{/each}
				</div>
			</article>
		{/each}
	</div>
	{#if websites.length === 0}
		<p class="hint">{t('pub.noSite')}</p>
	{:else}
		<p class="hint">
			{space.name}: publications, shop, and public content{space.siteUrl
				? ` for ${hostLabel(space.siteUrl)}`
				: ''}.
		</p>
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
		gap: 14px;
		padding: 6px;
	}

	.site-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0;
		border: 0;
		border-radius: 16px;
		overflow: hidden;
		background: transparent;
		box-sizing: border-box;
	}

	.site-hero {
		position: relative;
		aspect-ratio: 1.91 / 1;
		min-height: 140px;
		border-radius: 16px;
		overflow: hidden;
		background: var(--fg-8);
	}

	.site-og {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.site-og-fallback {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(120% 80% at 30% 20%, var(--fg-8), transparent 55%),
			linear-gradient(160deg, var(--fg-4), var(--fg-8));
	}

	.site-fade {
		position: absolute;
		inset: auto 0 0;
		padding: 36px 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: linear-gradient(
			to top,
			color-mix(in srgb, var(--bg) 78%, transparent) 0%,
			color-mix(in srgb, var(--bg) 42%, transparent) 55%,
			transparent 100%
		);
		pointer-events: none;
	}

	.site-name {
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 17px;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--fg);
	}

	.site-url {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
		text-decoration: none;
		pointer-events: auto;
		width: fit-content;
	}

	.site-links {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0 4px;
	}

	.site-link {
		display: block;
		width: 100%;
		padding: 5px 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.35;
		text-align: left;
		cursor: pointer;
	}

	.site-link:hover,
	.site-link:focus-visible {
		color: var(--fg-33);
		background: transparent;
	}

	.hint {
		margin: 12px 16px 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
	}
</style>
