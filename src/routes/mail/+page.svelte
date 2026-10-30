<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import { actor } from '$lib/actor.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		formatMailWhen,
		isUnreadFor,
		mailAuthorLabel,
		mailMessages,
		mailPreview,
		mailThreadsForCurrentFolder,
		mailUi,
		refreshMail
	} from '$lib/mail.svelte.js';
	import { MAIL_FOLDER_LABELS, mailView } from '$lib/mail-view.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';

	$effect(() => {
		mailView.folder;
		void refreshMail();
	});

	const threadsList = $derived.by(() => {
		actor.email;
		mailView.folder;
		mailMessages.length;
		mailUi.loading;
		return mailThreadsForCurrentFolder();
	});
</script>

<svelte:head><title>{MAIL_FOLDER_LABELS[mailView.folder]} · Mail</title></svelte:head>

<div class="feed mail">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if mailUi.error}
		<p class="banner"><span class="err">{mailUi.error}</span></p>
	{/if}

	{#if !appBoot.listsReady || (mailUi.loading && threadsList.length === 0)}
		<FeedSkeleton rows={6} />
	{:else if !actor.email}
		<p class="empty">
			Choose who you are
			<span class="hint">Settings → your mailbox email.</span>
		</p>
	{:else if threadsList.length === 0}
		<p class="empty">
			{MAIL_FOLDER_LABELS[mailView.folder]} is empty
			<span class="hint">For {actor.email}. Use + to compose.</span>
		</p>
	{:else}
		<div class="card-stack">
			{#each threadsList as t (t.id)}
				{@const unread = isUnreadFor(t)}
				{@const author = mailAuthorLabel(t)}
				{@const snippet = mailPreview(t)}
				<button
					type="button"
					class="row"
					class:on={ui.selection?.kind === 'mail' && ui.selection.id === t.id}
					class:unread
					onclick={() => selectEntity('mail', t.id)}
				>
					<span class="meta">
						<span class="author">{author}</span>
						<span class="time">{formatMailWhen(t.created_at)}</span>
					</span>
					<span class="subject">
						{t.subject || '(no subject)'}
						{#if t.count > 1}
							<span class="count">{t.count}</span>
						{/if}
					</span>
					{#if snippet}
						<span class="snippet">{snippet}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.mail {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.banner {
		margin: 0 12px 8px;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--fg-4);
		font-size: 13px;
	}

	.err {
		color: var(--accent);
	}

	.empty {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 32px 20px;
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg-66);
	}

	.hint {
		font-size: 13px;
		font-weight: 400;
		line-height: 1.4;
		color: var(--fg-33);
		max-width: 28rem;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1px;
		width: 100%;
		padding: 10px 14px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
		line-height: 1.25;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
	}

	.meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
	}

	.author {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 650;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row.unread .author {
		font-weight: 750;
	}

	.time {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.subject {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.count {
		flex-shrink: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
	}

	/* Do not use class "preview" — app.css .preview adds 16px padding for editors */
	.snippet {
		display: block;
		margin: 0;
		padding: 0;
		font-size: 12px;
		font-weight: 400;
		line-height: 1.3;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
