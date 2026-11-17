<script>
	/**
	 * Chat 3rd-column synopsis — reactions, replies, and tasks aimed at me.
	 */
	import ProfilePic from './ProfilePic.svelte';
	import TaskBox from './TaskBox.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { activityForMe, markActivitySeen } from '$lib/chat-activity.svelte.js';
	import { openChatRef } from '$lib/chat.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import { selectEntity } from '$lib/workspace.svelte.js';
	import { onMount } from 'svelte';

	/** @type {{ embedded?: boolean }} */
	let { embedded = false } = $props();

	const items = $derived(activityForMe());

	onMount(() => {
		markActivitySeen();
	});

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function openItem(item) {
		if (item.kind === 'assigned' && item.taskId) {
			selectEntity('task', item.taskId);
			return;
		}
		if (item.ref?.type && item.ref?.id) {
			openChatRef({ ref: item.ref });
			return;
		}
	}

	/** @param {number} at */
	function whenLabel(at) {
		if (!at) return '';
		const diff = Date.now() - at;
		if (diff < 60_000) return t('chat.now');
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
		return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function kindLabel(item) {
		if (item.kind === 'reaction') return t('chat.activityReaction');
		if (item.kind === 'reply') return t('chat.activityReply');
		return t('chat.activityAssigned');
	}
</script>

<div class="activity" class:embedded>
	<header class="head">
		<h2 class="title">{t('chat.activityTitle')}</h2>
		<p class="sub">{t('chat.activitySub')}</p>
	</header>

	{#if items.length === 0}
		<p class="empty">{t('chat.activityEmpty')}</p>
	{:else}
		<ul class="list">
			{#each items as item (item.id)}
				{@const p = asPerson(item.author)}
				{@const name = p?.name || displayNameFromEmail(item.author)}
				<li>
					<button type="button" class="row" onclick={() => openItem(item)}>
						{#if item.kind === 'assigned'}
							<span class="glyph" aria-hidden="true">
								<TaskBox state="open" size={22} />
							</span>
						{:else}
							<span class="pfp">
								<ProfilePic
									{name}
									email={item.author}
									pictureUrl={pictureUrlFor(item.author)}
									size={28}
									bare
								/>
							</span>
						{/if}
						<span class="body">
							<span class="line1">
								<span class="name">{name}</span>
								<span class="kind">{kindLabel(item)}</span>
								<span class="when">{whenLabel(item.at)}</span>
							</span>
							<span class="preview">
								{#if item.kind === 'reaction'}
									<span class="emoji">{item.emoji}</span>
								{:else}
									{item.preview}
								{/if}
							</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.activity {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		box-sizing: border-box;
		padding: 56px 24px 32px;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
	}

	.activity.embedded {
		padding-top: 12px;
	}

	.head {
		margin: 0 0 18px;
	}

	.title {
		margin: 0 0 6px;
		font-size: 18px;
		font-weight: 650;
		color: var(--fg);
	}

	.sub {
		margin: 0;
		font-size: 13px;
		line-height: 1.4;
		color: var(--fg-33);
	}

	.empty {
		margin: 24px 0;
		font-size: 14px;
		color: var(--fg-33);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 10px;
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

	.glyph,
	.pfp {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		line-height: 0;
	}

	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.line1 {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}

	.name {
		font-size: 13px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.kind {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.when {
		margin-left: auto;
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
		padding-right: 2px;
	}

	.preview {
		font-size: 13px;
		line-height: 1.35;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.emoji {
		font-size: 16px;
		line-height: 1.2;
	}

	@media (max-width: 767px) {
		.activity {
			padding: calc(56px + env(safe-area-inset-top, 0px)) 14px
				calc(28px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
