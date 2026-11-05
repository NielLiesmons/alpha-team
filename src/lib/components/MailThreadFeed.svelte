<script>
	/**
	 * Missive-style mail thread: mail panels + private chat bubbles + status lines
	 * in one chronological feed. Comment FAB posts into the same stream.
	 */
	import ChatFeedCard from './ChatFeedCard.svelte';
	import ChatStatusLine from './ChatStatusLine.svelte';
	import CommentThread from './CommentThread.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		commentsByKey,
		loadComments,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { formatMailWhen, mailAuthorLabel, threadMessages } from '$lib/mail.svelte.js';
	import { mailView } from '$lib/mail-view.svelte.js';
	import { openComposer } from '$lib/workspace.svelte.js';

	/**
	 * @type {{
	 *   mailMsg: any,
	 *   replyTo?: string,
	 *   menuOpen?: boolean,
	 *   onMore?: () => void
	 * }}
	 */
	let { mailMsg, replyTo = '', menuOpen = false, onMore = () => {} } = $props();

	const threadId = $derived(String(mailMsg?.id || ''));
	const me = $derived((activePerson().email || '').trim().toLowerCase());
	const mails = $derived(threadMessages(mailMsg));
	const comments = $derived(visibleChatMessages(commentsByKey[`mail:${threadId}`] ?? []));

	$effect(() => {
		const id = threadId;
		if (!id) return;
		void loadComments('mail', id).catch(() => {});
	});

	/**
	 * Unified timeline: mail panels, chat bubbles, status lines.
	 * @returns {{ type: 'mail' | 'chat' | 'status', id: string, at: string, mail?: any, msg?: any, text?: string, email?: string, name?: string }[]}
	 */
	const timeline = $derived.by(() => {
		/** @type {{ type: 'mail' | 'chat' | 'status', id: string, at: string, mail?: any, msg?: any, text?: string, email?: string, name?: string }[]} */
		const items = [];
		for (const m of mails) {
			items.push({
				type: 'mail',
				id: `mail-${m.id}`,
				at: String(m.created_at || ''),
				mail: m
			});
		}
		for (const c of comments) {
			if (c?.kind === 'event') {
				const author = String(c.author || '').toLowerCase();
				items.push({
					type: 'status',
					id: `status-${c.id}`,
					at: String(c.created_at || ''),
					text: String(c.body || '').trim() || 'Updated this conversation',
					email: author,
					name: displayNameFromEmail(c.author)
				});
				continue;
			}
			items.push({
				type: 'chat',
				id: `chat-${c.id}`,
				at: String(c.created_at || ''),
				msg: c
			});
		}
		items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
		return items;
	});

	/** @param {any} m */
	function isDraft(m) {
		return Boolean(m?.draft || m?.keywords?.$draft || mailView.folder === 'drafts');
	}
</script>

<div class="mail-feed">
	{#each timeline as item (item.id)}
		{#if item.type === 'status'}
			<ChatStatusLine text={item.text || ''} email={item.email || ''} name={item.name || ''} />
		{:else if item.type === 'chat' && item.msg}
			<div class="chat-row">
				<ChatFeedCard msg={item.msg} when={formatMailWhen(item.msg.created_at)} />
			</div>
		{:else if item.type === 'mail' && item.mail}
			{@const m = item.mail}
			{@const fromEmail = String(m.from || '').toLowerCase()}
			{@const fromName = mailAuthorLabel(m) || displayNameFromEmail(m.from)}
			{@const toLine = (m.to || []).map(displayNameFromEmail).filter(Boolean).join(', ')}
			<article class="mail-panel" class:draft={isDraft(m)}>
				<header class="mail-panel-head">
					<span class="mail-panel-who">
						<ProfilePic
							name={fromName}
							email={fromEmail}
							pictureUrl={pictureUrlFor(fromEmail)}
							size={36}
						/>
						<span class="mail-panel-id">
							<span class="mail-panel-name">{fromName}</span>
							<span class="mail-panel-email">{fromEmail}</span>
						</span>
					</span>
					<span class="mail-panel-actions">
						<button
							type="button"
							class="icon-hit"
							aria-label="Reply"
							onclick={() =>
								openComposer('mail', undefined, undefined, {
									to: fromEmail === me ? m.to?.[0] || replyTo : fromEmail || replyTo
								})
							}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M6.5 3.5 2.5 7.5l4 4"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<path
									d="M2.5 7.5h7.2c2.1 0 3.8 1.5 3.8 3.4V13"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
						<button
							type="button"
							class="icon-hit"
							aria-label="More"
							aria-expanded={menuOpen}
							onclick={onMore}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<circle cx="3.2" cy="8" r="1.35" fill="currentColor" />
								<circle cx="8" cy="8" r="1.35" fill="currentColor" />
								<circle cx="12.8" cy="8" r="1.35" fill="currentColor" />
							</svg>
						</button>
					</span>
				</header>
				{#if toLine}
					<p class="mail-panel-to">To: {toLine}</p>
				{/if}
				<p class="mail-panel-when">{formatMailWhen(m.created_at)}</p>
				<pre class="mail-panel-body">{m.body || ''}</pre>
			</article>
		{/if}
	{/each}
</div>

{#if threadId}
	<CommentThread type="mail" entityId={threadId} />
{/if}

<style>
	.mail-feed {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-bottom: 72px;
	}

	.chat-row {
		display: flex;
		flex-direction: column;
		padding: 0 4px;
	}

	.mail-panel {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 14px 16px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--fg) 4.5%, transparent);
		border: 0;
	}

	.mail-panel.draft {
		background: color-mix(in srgb, var(--fg) 3%, transparent);
		outline: 1px dashed color-mix(in srgb, var(--fg) 12%, transparent);
		outline-offset: -1px;
	}

	.mail-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.mail-panel-who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1;
	}

	.mail-panel-id {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.mail-panel-name {
		font-size: 14px;
		font-weight: 650;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mail-panel-email {
		font-size: 12px;
		font-weight: 450;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mail-panel-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
		margin-top: -2px;
	}

	.mail-panel-to {
		margin: 0;
		padding-left: 46px;
		font-size: 12px;
		font-weight: 450;
		color: var(--fg-33);
		line-height: 1.35;
	}

	.mail-panel-when {
		margin: 0;
		padding-left: 46px;
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.mail-panel-body {
		margin: 4px 0 0;
		padding: 0 0 0 46px;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 14px;
		line-height: 1.55;
		color: var(--fg-66);
		white-space: pre-wrap;
		word-break: break-word;
	}

	@media (max-width: 767px) {
		.mail-panel-to,
		.mail-panel-when,
		.mail-panel-body {
			padding-left: 0;
		}
	}
</style>
