<script>
	/**
	 * Visitor social activity — comments moderation (grayscale chrome).
	 */
	import {
		moderationComments,
		persistApproveComment,
		persistBanComment,
		persistRejectComment,
		pubsUi,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { getAdminToken } from '$lib/mail-api.js';
	import { t } from '$lib/i18n.svelte.js';

	let busy = $state('');

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

<div class="activity">
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
						<span class="who">{c.author_display || c.author_email || '…'}</span>
						<span class="when">{formatWhen(c.created_at)}</span>
					</div>
					<p class="body">{c.body}</p>
					<div class="trail">
						<span class="status">{c.status}{#if c.commenter_banned} · {t('pub.banned')}{/if}</span>
						{#if c.post_slug}
							<span class="slug">{c.post_slug}</span>
						{/if}
					</div>
					<div class="acts">
						{#if c.status === 'pending'}
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
</div>

<style>
	.activity {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 14px 24px;
		box-sizing: border-box;
	}

	.hint {
		margin: 24px 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
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
		padding: 12px 0;
		border-bottom: 1px solid var(--fg-8);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.who {
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
	}

	.when {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
		padding-right: 2px;
	}

	.body {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-66);
		white-space: pre-wrap;
	}

	.trail {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 11px;
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
		font-size: 12px;
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
</style>
