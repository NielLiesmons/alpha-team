<script>
	/**
	 * 3rd-column Website Insights: visits chart, countries, comments — bento panels.
	 */
	import { onMount } from 'svelte';
	import SiteCountryBars from '$lib/components/website/SiteCountryBars.svelte';
	import SiteVisitsChart from '$lib/components/website/SiteVisitsChart.svelte';
	import {
		moderationComments,
		persistApproveComment,
		persistBanComment,
		persistRejectComment,
		pubsUi,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { fetchAnalyticsSummary, getAdminToken } from '$lib/mail-api.js';
	import { t } from '$lib/i18n.svelte.js';

	let busy = $state('');
	let days = $state(7);
	let loading = $state(true);
	/** @type {any} */
	let summary = $state(null);
	let analyticsError = $state('');

	async function loadAnalytics() {
		if (!getAdminToken()) {
			summary = null;
			loading = false;
			return;
		}
		loading = true;
		analyticsError = '';
		try {
			summary = await fetchAnalyticsSummary(days);
		} catch (e) {
			analyticsError = e instanceof Error ? e.message : String(e);
			summary = null;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void refreshPublications();
	});

	$effect(() => {
		days;
		void loadAnalytics();
	});

	const pageviewsTotal = $derived(Number(summary?.pageviews) || 0);
	const series = $derived(Array.isArray(summary?.series) ? summary.series : []);
	const countries = $derived(Array.isArray(summary?.countries) ? summary.countries : []);

	/** @param {string} id */
	async function approve(id) {
		busy = id;
		try {
			await persistApproveComment(id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			busy = '';
		}
	}

	/** @param {string} id */
	async function reject(id) {
		busy = id;
		try {
			await persistRejectComment(id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			busy = '';
		}
	}

	/** @param {string} id */
	async function ban(id) {
		if (!confirm(t('pub.rejectBanConfirm'))) return;
		busy = id;
		try {
			await persistBanComment(id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			busy = '';
		}
	}

	/** @param {number | string | undefined} ts */
	function formatWhen(ts) {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="bento">
	<section class="panel visits">
		<div class="panel-head">
			<div class="metric-block">
				<span class="eyebrow">{t('web.visits')}</span>
				<span class="metric">{pageviewsTotal.toLocaleString()}</span>
			</div>
			<div class="timeframes" role="group" aria-label={t('web.timeframe')}>
				<button type="button" class="tf" class:on={days === 7} onclick={() => (days = 7)}>
					{t('web.days7')}
				</button>
				<button type="button" class="tf" class:on={days === 30} onclick={() => (days = 30)}>
					{t('web.days30')}
				</button>
			</div>
		</div>
		{#if !getAdminToken()}
			<p class="hint">{t('pub.addToken')}</p>
		{:else if analyticsError}
			<p class="hint">{analyticsError}</p>
		{:else if !loading && pageviewsTotal === 0}
			<p class="hint">{t('web.noVisits')}</p>
		{/if}
		<SiteVisitsChart {series} {loading} />
	</section>

	<section class="panel countries">
		<div class="panel-head">
			<span class="eyebrow">{t('web.byCountry')}</span>
		</div>
		<SiteCountryBars rows={countries} {loading} emptyLabel={t('web.noCountries')} />
	</section>

	<section class="panel comments">
		<div class="panel-head">
			<span class="eyebrow">{t('web.comments')}</span>
			<span class="count">{moderationComments.length}</span>
		</div>
		{#if !getAdminToken()}
			<p class="hint">{t('pub.addToken')}</p>
		{:else if pubsUi.error}
			<p class="hint">
				{pubsUi.error}
				<button type="button" class="linkish" onclick={() => refreshPublications()}>{t('common.retry')}</button>
			</p>
		{:else if moderationComments.length === 0}
			<p class="hint">{t('web.activityEmpty')}</p>
		{:else}
			<ul class="list">
				{#each moderationComments as c (c.id)}
					<li class="card">
						<div class="head">
							<span class="who">{c.author_display || c.author_name || c.author_email || '—'}</span>
							<span class="when">{formatWhen(c.created_at)}</span>
						</div>
						<p class="body">{c.body}</p>
						<div class="trail">
							{#if c.post_slug}<span>{c.post_slug}</span>{/if}
							{#if c.status}<span>{c.status}</span>{/if}
						</div>
						<div class="acts">
							{#if c.status !== 'approved'}
								<button
									type="button"
									class="pill"
									disabled={busy === c.id}
									onclick={() => void approve(c.id)}>{t('pub.approve')}</button
								>
							{/if}
							<button
								type="button"
								class="pill"
								disabled={busy === c.id}
								onclick={() => void reject(c.id)}>{t('pub.reject')}</button
							>
							<button
								type="button"
								class="pill"
								disabled={busy === c.id}
								onclick={() => void ban(c.id)}>{t('pub.banEmail')}</button
							>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.bento {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		box-sizing: border-box;
	}

	.panel {
		min-width: 0;
		padding: 14px 14px 16px;
		border-radius: 16px;
		background: var(--fg-4);
		box-sizing: border-box;
	}

	.panel.visits,
	.panel.countries,
	.panel.comments {
		grid-column: 1 / -1;
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}

	.metric-block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.eyebrow {
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.metric {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.15;
		color: var(--fg);
		font-variant-numeric: tabular-nums;
	}

	.count {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--fg-33);
		font-variant-numeric: tabular-nums;
		padding-top: 2px;
	}

	.timeframes {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.tf {
		height: 28px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tf.on,
	.tf:hover {
		background: var(--fg-8);
		color: var(--fg);
	}

	.hint {
		margin: 0 0 10px;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--fg-33);
	}

	.linkish {
		margin-left: 6px;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 600;
		color: var(--fg);
		text-decoration: underline;
		cursor: pointer;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px;
		border-radius: 12px;
		background: var(--fg-8);
		box-sizing: border-box;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.who {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--fg);
	}

	.when {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-33);
		padding-right: 2px;
	}

	.body {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--fg-66);
		white-space: pre-wrap;
	}

	.trail {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--fg-33);
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 2px;
	}

	.pill {
		height: 28px;
		padding: 0 12px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.pill:hover:not(:disabled) {
		color: var(--fg);
	}

	.pill:disabled {
		opacity: 0.45;
		cursor: default;
	}

	@media (max-width: 899px) {
		.bento {
			grid-template-columns: 1fr;
		}
	}
</style>
