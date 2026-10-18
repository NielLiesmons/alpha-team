<script>
	import { onMount } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import {
		campaigns,
		mailSettings,
		pubsUi,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { getAdminToken } from '$lib/mail-api.js';
	import { openComposer, selectEntity, ui } from '$lib/workspace.svelte.js';

	onMount(() => {
		refreshPublications();
	});

	/** @param {number | string | undefined} ts */
	function formatWhen(ts) {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Publications</title></svelte:head>

<div class="feed">
	{#if !getAdminToken()}
		<p class="banner">
			Add the Publications API token in <a href="/settings">Settings</a> to load welcome +
			newsletters.
		</p>
	{:else if pubsUi.error}
		<p class="banner err" role="alert">
			{pubsUi.error}
			<button type="button" class="linkish" onclick={() => refreshPublications()}>Retry</button>
		</p>
	{:else if pubsUi.loading && campaigns.length === 0}
		<FeedSkeleton rows={5} />
	{/if}

	<div class="card-stack">
		<button
			type="button"
			class="row welcome"
			class:on={ui.selection?.kind === 'welcome'}
			onclick={() => selectEntity('welcome', 'welcome')}
			ondblclick={() => openComposer('welcome')}
		>
			<span class="title-row">
				<span class="title">Welcome message</span>
				<span class="meta">{mailSettings.welcome.enabled ? 'On' : 'Off'}</span>
			</span>
			<span class="preview">
				{mailSettings.welcome.subject_fr || mailSettings.welcome.subject_en || 'Sent when someone joins the list'}
			</span>
		</button>

		{#each campaigns as c (c.id)}
			<button
				type="button"
				class="row"
				class:on={ui.selection?.kind === 'newsletter' && ui.selection.id === c.id}
				onclick={() => selectEntity('newsletter', c.id)}
				ondblclick={() => openComposer('newsletter', c.id)}
			>
				<span class="title-row">
					<span class="title">{c.subject}</span>
					<span class="meta"
						>{c.status}{#if c.sent_at}
							· {formatWhen(c.sent_at)}{/if}</span
					>
				</span>
				<span class="preview">{(c.body || '').slice(0, 140)}</span>
			</button>
		{/each}

		{#if !pubsUi.loading && campaigns.length === 0 && getAdminToken() && !pubsUi.error}
			<p class="empty soft">No newsletters yet — use + to write one.</p>
		{/if}
	</div>
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
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

	.empty {
		padding: 48px 16px;
		color: var(--fg-66);
	}

	.empty.soft {
		padding: 16px 12px 8px;
		font-size: 13px;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(0.2rem + 2px);
		width: 100%;
		padding: calc(0.85rem - 4px) 0.9rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
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
