<script>
	import { onMount } from 'svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		chatChannels,
		chatFeed,
		chatUi,
		chatEventLabel,
		setActiveChannel,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';

	onMount(() => {
		const id = chatUi.activeChannelId || 'general';
		setActiveChannel(id);
		selectEntity('chat', id);
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
		const msgs = visibleChatMessages(chatFeed).filter(
			(m) => (m.channel_id || 'general') === chatId
		);
		return msgs[0] || null;
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
		<button
			type="button"
			class="row"
			class:on={ui.selection?.kind === 'chat' && ui.selection?.id === ch.id}
			onclick={() => openChat(ch.id)}
		>
			<span class="avatar" aria-hidden="true">
				<ProfilePic name={av.name} email={av.email} pictureUrl={av.pictureUrl} size={40} />
			</span>
			<span class="meta">
				<span class="title-row">
					<span class="title">{ch.title}</span>
					{#if last?.created_at}
						<span class="when">{whenLabel(last.created_at)}</span>
					{/if}
				</span>
				<span class="preview">{previewLine(last)}</span>
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
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 8px;
		border: 0;
		border-radius: 12px;
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

	.row.on {
		background: var(--fg-8);
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
		gap: 4px;
		margin: 0;
		padding: 0;
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

	.when {
		flex-shrink: 0;
		margin: 0;
		padding: 0;
		font-size: 12px;
		font-weight: 500;
		line-height: 1.25;
		color: var(--fg-33);
	}

	.preview {
		display: block;
		width: 100%;
		margin: 0;
		padding: 0;
		font-size: 13px;
		line-height: 1.25;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
