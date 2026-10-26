<script>
	import { onMount } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import { actor } from '$lib/actor.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		formatMailWhen,
		isUnreadFor,
		mailForFolder,
		mailPreview,
		mailUi,
		refreshMail
	} from '$lib/mail.svelte.js';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';

	/** @type {'inbox' | 'sent'} */
	let folder = $state('inbox');

	onMount(() => {
		void refreshMail();
	});

	const messages = $derived.by(() => {
		actor.email;
		return mailForFolder(folder);
	});
</script>

<svelte:head><title>Mail</title></svelte:head>

<div class="feed mail">
	<div class="folders" role="tablist" aria-label="Mail folders">
		<button
			type="button"
			class="folder"
			class:on={folder === 'inbox'}
			role="tab"
			aria-selected={folder === 'inbox'}
			onclick={() => (folder = 'inbox')}>Inbox</button
		>
		<button
			type="button"
			class="folder"
			class:on={folder === 'sent'}
			role="tab"
			aria-selected={folder === 'sent'}
			onclick={() => (folder = 'sent')}>Sent</button
		>
	</div>

	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if mailUi.error}
		<p class="banner"><span class="err">{mailUi.error}</span></p>
	{/if}

	{#if !appBoot.listsReady || (mailUi.loading && messages.length === 0)}
		<FeedSkeleton rows={6} />
	{:else if !actor.email}
		<p class="empty">
			Choose who you are
			<span class="hint">Settings → your mailbox email. Inbox and Sent are filtered for that address.</span>
		</p>
	{:else if messages.length === 0}
		<p class="empty">
			{folder === 'inbox' ? 'Inbox is empty' : 'No sent mail yet'}
			<span class="hint"
				>Personal messages for {actor.email} — stored on Drive for this Space. Use + to compose.
				Internet SMTP / IMAP still TODO.</span
			>
		</p>
	{:else}
		<div class="card-stack">
			{#each messages as m (m.id)}
				{@const unread = folder === 'inbox' && isUnreadFor(m)}
				{@const party =
					folder === 'sent'
						? (m.to || []).map(displayNameFromEmail).join(', ') || '—'
						: displayNameFromEmail(m.from)}
				<button
					type="button"
					class="row"
					class:on={ui.selection?.kind === 'mail' && ui.selection.id === m.id}
					class:unread
					onclick={() => selectEntity('mail', m.id)}
				>
					<span class="title-row">
						<span class="title">{m.subject || '(no subject)'}</span>
						<span class="time">{formatMailWhen(m.created_at)}</span>
					</span>
					<span class="preview">{party} — {mailPreview(m) || 'No body'}</span>
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

	.folders {
		display: flex;
		gap: 4px;
		margin: 0 12px 4px;
		padding: 4px;
		max-width: 220px;
		border-radius: 12px;
		background: var(--fg-4);
		flex-shrink: 0;
	}

	.folder {
		flex: 1;
		height: 32px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
	}

	.folder.on {
		background: var(--fg-8);
		color: var(--fg);
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
		gap: 4px;
		width: 100%;
		padding: 12px 14px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
	}

	.row.unread .title {
		font-weight: 700;
	}

	.row.unread .preview {
		color: var(--fg);
	}

	.title-row {
		display: flex;
		gap: 8px;
		align-items: center;
		min-width: 0;
	}

	.title {
		flex: 1;
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.time {
		font-size: 12px;
		color: var(--fg-33);
	}

	.preview {
		font-size: 13px;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
