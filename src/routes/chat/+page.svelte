<script>
	import { onMount } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import {
		chatFeed,
		chatRefLabel,
		chatUi,
		openChatRef,
		postChatMessage,
		refreshChatFeed
	} from '$lib/chat.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';

	let draft = $state('');

	onMount(() => {
		void refreshChatFeed();
	});

	function formatWhen(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const now = Date.now();
		const diff = now - d.getTime();
		if (diff < 60_000) return 'just now';
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	async function send() {
		const body = draft.trim();
		if (!body || chatUi.posting) return;
		try {
			await postChatMessage({ body, kind: 'chat' });
			draft = '';
		} catch (e) {
			chatUi.error = e instanceof Error ? e.message : String(e);
		}
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}
</script>

<svelte:head><title>Chat</title></svelte:head>

<div class="feed">
	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if chatUi.error}
		<p class="banner"><span class="err">{chatUi.error}</span></p>
	{/if}

	<div class="composer-card">
		<textarea
			class="composer"
			rows="2"
			placeholder="Message the family…"
			bind:value={draft}
			onkeydown={onKey}
		></textarea>
		<button
			type="button"
			class="send"
			disabled={!draft.trim() || chatUi.posting}
			onclick={() => void send()}
		>
			{#if chatUi.posting}<Spinner size={14} label="Sending" />{/if}
			Send
		</button>
	</div>

	{#if (chatUi.loading || !appBoot.listsReady) && chatFeed.length === 0}
		<FeedSkeleton rows={6} />
	{:else if chatFeed.length === 0}
		<p class="empty">No messages yet — comment on a Task or Note, or send above.</p>
	{:else}
		<div class="card-stack">
			{#each chatFeed as msg (msg.id)}
				{@const person = asPerson(msg.author)}
				{@const refLabel = chatRefLabel(msg)}
				<button type="button" class="row" onclick={() => openChatRef(msg)}>
					<ProfilePic name={person?.name || displayNameFromEmail(msg.author)} size={36} />
					<span class="col">
						<span class="top">
							<span class="name">{person?.name || displayNameFromEmail(msg.author)}</span>
							<span class="when">{formatWhen(msg.created_at)}</span>
						</span>
						{#if refLabel}
							<span class="ref">{refLabel}</span>
						{/if}
						<span class="preview">{msg.body}</span>
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}

	.banner {
		margin: 0;
		padding: 10px 16px;
		font-size: 13px;
	}

	.err {
		color: #b44;
	}

	.composer-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--fg-8);
	}

	.composer {
		width: 100%;
		min-height: 52px;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		resize: vertical;
	}

	.send {
		align-self: flex-end;
		height: 34px;
		padding: 0 14px;
		border: 1px solid transparent;
		border-radius: 9999px;
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.send:disabled {
		opacity: 0.45;
	}

	.empty {
		padding: 32px 16px;
		margin: 0;
		color: var(--fg-66);
		font-size: 14px;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
	}

	.row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.name {
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
	}

	.when {
		font-size: 12px;
		color: var(--fg-33);
		flex-shrink: 0;
	}

	.ref {
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.preview {
		font-size: 14px;
		line-height: 1.4;
		color: var(--fg-66);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}
</style>
