<script>
	/**
	 * Publications detail hub — single feed (letters + site posts/events).
	 * Geeky settings (welcome / footer / branding) live behind one top control.
	 * View All FAB → full /publications list.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		buildPubsFeed,
		campaigns,
		mailSettings,
		moderationComments,
		persistApproveComment,
		persistBanComment,
		persistDeleteCampaign,
		persistDeletePost,
		persistRejectComment,
		pubsUi,
		refreshPublications
	} from '$lib/publications.svelte.js';
	import { getAdminToken } from '$lib/mail-api.js';
	import { clearSelection, openComposer, selectEntity, ui } from '$lib/workspace.svelte.js';

	/** @type {{ filterKind?: string | null, onViewAll?: () => void }} */
	let { filterKind = null, onViewAll } = $props();

	let settingsOpen = $state(false);
	let commentsOpen = $state(true);
	let actionBusy = $state(false);
	let commentBusy = $state('');

	onMount(() => {
		void refreshPublications();
	});

	const feed = $derived(buildPubsFeed());

	const items = $derived.by(() => {
		const kind = filterKind;
		if (!kind || kind === 'all') return feed;
		if (kind === 'blog' || kind === 'letter') {
			return feed.filter((x) => x.bucket === 'blog' || x.bucket === 'letter');
		}
		if (kind === 'post') return feed.filter((x) => x.bucket === 'post');
		if (kind === 'event') return feed.filter((x) => x.bucket === 'event');
		if (kind === 'draft') return feed.filter((x) => x.status === 'draft' || x.status === 'failed');
		if (kind === 'sent') return feed.filter((x) => x.status === 'sent');
		if (kind === 'general') return [];
		return feed;
	});

	function viewAll() {
		onViewAll?.();
		goto('/publications');
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
		if (item.siteUrl && typeof window !== 'undefined') {
			window.open(item.siteUrl, '_blank', 'noopener,noreferrer');
		}
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	function editItem(item) {
		if (item.source === 'campaign') {
			openComposer('newsletter', item.id);
			return;
		}
		if (item.slug) openComposer('newsletter', `post:${item.slug}`);
	}

	/** @param {ReturnType<typeof buildPubsFeed>[number]} item */
	async function deleteItem(item) {
		const label = item.title || 'this publication';
		if (
			!confirm(
				`Delete “${label}”? This removes it from the public site${item.source === 'campaign' ? ' and the letter record' : ''}. Subscribers are not emailed.`
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

	/** @param {number | string | undefined} ts */
	function formatWhen(ts) {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** @param {string} bucket */
	function bucketLabel(bucket) {
		if (bucket === 'blog' || bucket === 'letter') return 'Blog';
		if (bucket === 'event') return 'Event';
		if (bucket === 'post') return 'Post';
		return bucket;
	}

	/** @param {string} id */
	async function approve(id) {
		commentBusy = id;
		try {
			await persistApproveComment(id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			commentBusy = '';
		}
	}

	/** @param {string} id */
	async function reject(id) {
		commentBusy = id;
		try {
			await persistRejectComment(id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			commentBusy = '';
		}
	}

	/** @param {string} id */
	async function ban(id) {
		if (!confirm('Reject this comment and ban the email from commenting on this project?')) return;
		commentBusy = id;
		try {
			await persistBanComment(id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			commentBusy = '';
		}
	}

	const pendingCount = $derived(
		moderationComments.filter((c) => c.status === 'pending').length
	);
</script>

<div class="hub">
	<div class="hub-bar">
		<p class="lede">
			Letters, posts, and events in one place. Blog letters mail subscribers and land on the site.
		</p>
		<div class="hub-actions">
			<button
				type="button"
				class="geek"
				aria-label="Mail & comments settings"
				aria-expanded={settingsOpen}
				title="Welcome, footer, branding, comments"
				onclick={() => (settingsOpen = !settingsOpen)}
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
			<button
				type="button"
				class="add"
				aria-label="New letter"
				onclick={() => openComposer('newsletter')}
			>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		</div>
	</div>

	{#if settingsOpen}
		<div class="settings-sheet" role="group" aria-label="Mail settings">
			<button
				type="button"
				class="row"
				onclick={() => {
					settingsOpen = false;
					selectEntity('welcome', 'welcome');
				}}
				ondblclick={() => {
					settingsOpen = false;
					openComposer('welcome');
				}}
			>
				<span class="row-title">Welcome message</span>
				<span class="row-meta">{mailSettings.welcome.enabled ? 'On' : 'Off'}</span>
			</button>
			<button
				type="button"
				class="row muted"
				onclick={() => {
					settingsOpen = false;
					openComposer('welcome');
				}}
			>
				<span class="row-title">Footer & branding</span>
				<span class="row-meta">Shared</span>
			</button>
			<button
				type="button"
				class="row"
				onclick={() => {
					settingsOpen = false;
					commentsOpen = true;
				}}
			>
				<span class="row-title">Comments moderation</span>
				<span class="row-meta"
					>{pendingCount > 0 ? `${pendingCount} pending` : 'Reject / ban'}</span
				>
			</button>
		</div>
	{/if}

	{#if commentsOpen}
		<section class="pending" aria-label="Comments moderation">
			<button type="button" class="pending-label as-btn" onclick={() => (commentsOpen = false)}>
				Comments · {moderationComments.length}{#if pendingCount > 0}
					· {pendingCount} pending{/if}
			</button>
			<p class="pending-hint">
				Confirmed subscribers publish live. Reject or ban here for takedown.
			</p>
			{#if moderationComments.length === 0}
				<p class="pending-empty">No comments yet.</p>
			{:else}
				{#each moderationComments as c (c.id)}
					<div class="pending-card" class:is-pending={c.status === 'pending'}>
						<p class="pending-meta">
							<span class="status" data-status={c.status}>{c.status}</span>
							{c.author_email || c.author_display}
							{#if c.commenter_banned}<span class="trusted">banned</span>
							{:else if c.commenter_trusted}<span class="trusted">trusted</span>{/if}
							· {c.post_slug}
							{#if c.created_at}· {formatWhen(c.created_at)}{/if}
						</p>
						<p class="pending-body">{c.body}</p>
						{#if c.status !== 'rejected'}
							<div class="pending-actions">
								{#if c.status === 'pending'}
									<button
										type="button"
										class="act"
										disabled={commentBusy === c.id}
										onclick={() => void approve(c.id)}>Approve</button
									>
								{/if}
								<button
									type="button"
									class="act danger"
									disabled={commentBusy === c.id}
									onclick={() => void reject(c.id)}>Reject</button
								>
								<button
									type="button"
									class="act danger"
									disabled={commentBusy === c.id || c.commenter_banned}
									onclick={() => void ban(c.id)}>Ban email</button
								>
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</section>
	{:else}
		<button type="button" class="comments-chip" onclick={() => (commentsOpen = true)}>
			Comments{#if pendingCount > 0}
				· {pendingCount} pending{/if}
		</button>
	{/if}

	{#if !getAdminToken()}
		<p class="empty">Add the Publications API token in Settings to load the feed.</p>
	{:else if pubsUi.error}
		<p class="empty err" role="alert">{pubsUi.error}</p>
	{:else if pubsUi.loading && campaigns.length === 0 && feed.length === 0}
		<p class="empty">Loading…</p>
	{:else if items.length === 0}
		<p class="empty">Nothing published yet — + to compose a letter.</p>
	{:else}
		<div class="feed">
			{#each items as item (item.key)}
				<div class="row-wrap">
					<button
						type="button"
						class="row"
						onclick={() => openItem(item)}
						ondblclick={() => editItem(item)}
					>
						<span class="row-title">{item.title}</span>
						<span class="row-meta"
							>{bucketLabel(item.bucket)}{#if item.updatedAt}
								· edited{/if}{#if item.status}
								· {item.status}{/if}{#if item.when}
								· {formatWhen(item.when)}{/if}</span
						>
					</button>
					<div class="row-actions">
						<button
							type="button"
							class="act"
							disabled={actionBusy}
							aria-label="Edit"
							title="Edit"
							onclick={() => editItem(item)}>Edit</button
						>
						<button
							type="button"
							class="act danger"
							disabled={actionBusy}
							aria-label="Delete"
							title="Delete"
							onclick={() => void deleteItem(item)}>Del</button
						>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<button type="button" class="view-all-fab" onclick={viewAll}>View all</button>
</div>

<style>
	.hub {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		box-sizing: border-box;
	}

	.hub-bar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.lede {
		margin: 0;
		flex: 1;
		min-width: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
	}

	.hub-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.geek,
	.add {
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

	.geek:hover,
	.add:hover {
		color: var(--fg);
	}

	.settings-sheet {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
		border-radius: 12px;
		background: var(--fg-4);
	}

	.pending {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border-radius: 12px;
		background: var(--fg-4);
	}

	.pending-label {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-66);
	}

	.pending-label.as-btn {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		text-align: left;
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-66);
		cursor: pointer;
	}

	.pending-hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--fg-33);
	}

	.pending-empty {
		margin: 0;
		font-size: 13px;
		color: var(--fg-33);
	}

	.comments-chip {
		align-self: flex-start;
		padding: 6px 10px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.comments-chip:hover {
		color: var(--fg);
	}

	.pending-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--bg, #fff);
	}

	.pending-card.is-pending {
		outline: 1px solid color-mix(in srgb, var(--accent, #b44) 35%, transparent);
	}

	.pending-meta {
		margin: 0;
		font-size: 12px;
		color: var(--fg-66);
		word-break: break-word;
	}

	.status {
		display: inline-block;
		margin-right: 4px;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--fg-8, rgba(0, 0, 0, 0.06));
		color: var(--fg-66);
	}

	.status[data-status='pending'] {
		color: #a45;
		background: color-mix(in srgb, #a45 12%, transparent);
	}

	.status[data-status='approved'] {
		color: #2a6;
		background: color-mix(in srgb, #2a6 12%, transparent);
	}

	.status[data-status='rejected'] {
		color: var(--fg-33);
	}

	.trusted {
		display: inline-block;
		margin-left: 4px;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--fg-8, rgba(0, 0, 0, 0.06));
		color: var(--fg-66);
	}

	.pending-body {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.pending-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.feed {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 0;
	}

	.row-wrap {
		display: flex;
		align-items: stretch;
		gap: 2px;
		border-radius: 10px;
	}

	.row-wrap:hover {
		background: var(--fg-4);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		padding: 8px 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		padding-right: 4px;
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
	}

	.act:hover:not(:disabled) {
		background: var(--fg-8, var(--fg-4));
		color: var(--fg);
	}

	.act.danger:hover:not(:disabled) {
		color: #b44;
	}

	.act:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.row.muted .row-title {
		color: var(--fg-66);
	}

	.row-title {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 550;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-meta {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-33);
	}

	.empty {
		margin: 0;
		padding: 8px 4px 12px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--fg-33);
	}

	.empty.err {
		color: var(--accent);
	}

	/* Overlay FAB — floats on hub; clearance via last-row pad (no glass/stroke/hover). */
	.view-all-fab {
		position: absolute;
		right: 4px;
		bottom: 4px;
		z-index: 2;
		padding: 6px 11px;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 92%, transparent);
		box-shadow: none;
		color: var(--fg-66);
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
	}

	.view-all-fab:hover,
	.view-all-fab:focus-visible {
		color: var(--fg-66);
		background: color-mix(in srgb, var(--bg) 92%, transparent);
	}

	.feed > .row-wrap:last-child,
	.empty {
		padding-right: 5.75rem;
		box-sizing: border-box;
	}
</style>
