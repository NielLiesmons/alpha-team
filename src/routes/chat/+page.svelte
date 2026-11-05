<script>
	import { page } from '$app/stores';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		chatChannels,
		chatFeed,
		chatEventLabel,
		ensureChatFeedOpen,
		setActiveChannel,
		unreadCountForChannel,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';

	/**
	 * Keep a chat channel open when nothing is selected.
	 * Do not steal mail/task tip selections opened from the feed.
	 */
	$effect(() => {
		const onChat = $page.url.pathname.startsWith('/chat');
		if (!onChat) return;
		const sel = ui.selection;
		chatChannels.length;
		if (sel) return;
		ensureChatFeedOpen();
	});

	/** @param {string} id */
	function openChat(id) {
		setActiveChannel(id);
		selectEntity('chat', id);
	}

	/** @param {any} ch */
	function avatarFor(ch) {
		if (ch.kind === 'dm' && Array.isArray(ch.members) && ch.members[0]) {
			const email = String(ch.members[0]);
			const p = asPerson(email);
			return {
				name: p?.name || displayNameFromEmail(email),
				email,
				pictureUrl: pictureUrlFor(email)
			};
		}
		if (ch.kind === 'agent') {
			return { name: ch.title || 'Agent', email: `agent:${ch.id}`, pictureUrl: null };
		}
		return { name: ch.title || 'Chat', email: `chat:${ch.id}`, pictureUrl: null };
	}

	/** @param {string} chatId */
	function lastMessage(chatId) {
		chatFeed.length;
		const msgs = visibleChatMessages(chatFeed).filter(
			(m) => (m.channel_id || 'general') === chatId
		);
		return msgs[0] || null;
	}

	/** @param {string} chatId */
	function unreadFor(chatId) {
		chatFeed.length;
		return unreadCountForChannel(chatId);
	}

	/** @param {any} msg */
	function previewLine(msg) {
		if (!msg) return 'No messages yet';
		if (msg.kind === 'event') {
			const who = asPerson(msg.author);
			const name = who?.name || displayNameFromEmail(msg.author) || 'Someone';
			return `${name} ${chatEventLabel(msg)}`;
		}
		const who = asPerson(msg.author);
		const name = who?.name || displayNameFromEmail(msg.author);
		const plain = String(msg.body || '')
			.replace(/\s+/g, ' ')
			.trim();
		const text = plain.length > 64 ? `${plain.slice(0, 64).trim()}…` : plain || 'Attachment';
		return name ? `${name}: ${text}` : text;
	}

	/** @param {string | undefined} iso */
	function whenLabel(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const diff = Date.now() - d.getTime();
		if (diff < 60_000) return 'now';
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
		if (diff < 6 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Chat</title></svelte:head>

<div class="feed chat-list">
	{#each chatChannels as ch (ch.id)}
		{@const av = avatarFor(ch)}
		{@const last = lastMessage(ch.id)}
		{@const unread = unreadFor(ch.id)}
		<button
			type="button"
			class="row"
			class:on={ui.selection?.kind === 'chat' && ui.selection?.id === ch.id}
			onclick={() => openChat(ch.id)}
		>
			<span class="avatar" aria-hidden="true">
				<ProfilePic name={av.name} email={av.email} pictureUrl={av.pictureUrl} size={48} />
			</span>
			<span class="meta">
				<span class="title-row">
					<span class="title">{ch.title}</span>
					<span class="when-slot">
						{#if last?.created_at}
							<span class="when">{whenLabel(last.created_at)}</span>
						{/if}
					</span>
				</span>
				<span class="preview-row">
					<span class="preview">{previewLine(last)}</span>
					<span class="unread-slot" aria-hidden={unread === 0 ? 'true' : undefined}>
						{#if unread > 0}
							<span class="new-count" aria-label="{unread} unread">{unread > 99 ? '99+' : unread}</span>
						{/if}
					</span>
				</span>
			</span>
		</button>
	{/each}
</div>

<style>
	.chat-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 4px 6px 24px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
		padding: 10px 8px;
		border: 0;
		border-radius: 14px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.row:hover {
		background: var(--fg-4);
	}

	/* Selected fill = feed standard (--fg-4); see app.css .feed .row.on */
	.row.on {
		background: var(--fg-4);
	}

	.avatar {
		flex-shrink: 0;
		line-height: 0;
	}

	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		/* Optical top align with avatar round */
		padding-top: 2px;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		margin: 0;
		padding: 0;
	}

	.title {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.25;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.when-slot {
		flex-shrink: 0;
		min-width: 28px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 2px;
		box-sizing: border-box;
	}

	.when {
		margin: 0;
		padding: 0;
		font-size: 12px;
		font-weight: 500;
		line-height: 1.25;
		color: var(--fg-33);
		white-space: nowrap;
	}

	.preview-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		min-height: 20px;
	}

	.preview {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		font-size: 13px;
		line-height: 1.25;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.unread-slot {
		flex-shrink: 0;
		width: 28px;
		min-height: 20px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.new-count {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		box-sizing: border-box;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		line-height: 1;
	}
</style>
