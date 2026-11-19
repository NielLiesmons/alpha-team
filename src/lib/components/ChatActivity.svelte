<script>
	/**
	 * Chat notifications — Notes-density rows in the detail column.
	 * Body chrome is zeroed; only card-stack gutters + top clear for detail-top.
	 * PFP matches ChromeMobileBar 44px glass hits; left edge aligns with back inset.
	 */
	import At from './icons/At.svelte';
	import Reply from './icons/Reply.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import TaskBox from './TaskBox.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { activityForMe, markActivitySeen } from '$lib/chat-activity.svelte.js';
	import { openChatRef } from '$lib/chat.svelte.js';
	import { profileNameCss } from '$lib/color.js';
	import { t } from '$lib/i18n.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { selectEntity } from '$lib/workspace.svelte.js';
	import { onMount } from 'svelte';

	/**
	 * @type {{
	 *   filter?: 'all' | 'reaction' | 'reply' | 'assigned',
	 *   embedded?: boolean
	 * }}
	 */
	let { filter = 'all', embedded = false } = $props();

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	const items = $derived.by(() => {
		const all = activityForMe();
		if (filter === 'all') return all;
		if (filter === 'reply') return all.filter((i) => i.kind === 'reply' || i.kind === 'mention');
		return all.filter((i) => i.kind === filter);
	});

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

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function person(item) {
		const p = asPerson(item.author);
		return {
			email: item.author,
			name: p?.name || displayNameFromEmail(item.author) || item.author
		};
	}

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function verb(item) {
		if (item.kind === 'assigned') return t('chat.activityAssigned');
		if (item.kind === 'reaction') return t('chat.activityReaction');
		if (item.kind === 'mention') return t('chat.activityMention');
		return t('chat.activityReply');
	}

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function preview(item) {
		if (item.kind === 'assigned') return item.preview;
		return item.targetPreview || item.preview || '';
	}
</script>

<!-- class "feed" so detail-top chrome scroll fade can find this scroller -->
<div class="activity feed" class:embedded>
	{#if items.length === 0}
		<p class="empty">{t('chat.activityEmpty')}</p>
	{:else}
		<div class="card-stack">
			{#each items as item (item.id)}
				{@const who = person(item)}
				<button type="button" class="row" onclick={() => openItem(item)}>
					<span class="pfp" aria-hidden="true">
						<ProfilePic
							name={who.name}
							email={who.email}
							pictureUrl={pictureUrlFor(who.email)}
							size={44}
						/>
						{#if item.kind === 'assigned'}
							<span class="task-mark">
								<TaskBox state={item.taskStatus || 'open'} size={18} />
							</span>
						{:else}
							<span class="badge" class:emoji-badge={item.kind === 'reaction'}>
								{#if item.kind === 'reaction'}
									<span class="emoji">{item.emoji || '❤️'}</span>
								{:else if item.kind === 'mention'}
									<At size={14} />
								{:else}
									<Reply size={14} />
								{/if}
							</span>
						{/if}
					</span>
					<span class="copy">
						<span class="line1">
							<span
								class="who"
								style:color={profileNameCss(who.email, who.name, isDark)}
								>{who.name}</span
							>
							<span class="verb">{verb(item)}</span>
						</span>
						<span class="line2">
							<span class="preview">{preview(item)}</span>
						</span>
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.activity {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		box-sizing: border-box;
		width: 100%;
		margin: 0;
		/* Clear floating detail-top control row only — no entity 24px sides */
		padding: 48px 0 0;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
	}

	.empty {
		margin: 28px 0;
		padding: 0 16px;
		font-size: 14px;
		color: var(--fg-33);
		text-align: center;
	}

	/* Vertical stack gutters only — horizontal inset matches top-bar back */
	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 6px 0;
		box-sizing: border-box;
		width: 100%;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		/* 14px = ChromeMobileBar side padding (back button left edge) */
		padding: calc(0.85rem - 4px) 14px;
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

	.pfp {
		position: relative;
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		line-height: 0;
	}

	/* Before: 20×20 solid shell disc. After: 26×26 frosted glass. */
	.badge {
		position: absolute;
		right: -3px;
		bottom: -3px;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 9999px;
		box-sizing: border-box;
		background: color-mix(in srgb, var(--bg) 58%, transparent);
		border: 1px solid var(--fg-16);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: var(--fg-66);
		line-height: 0;
		pointer-events: none;
	}

	.badge.emoji-badge {
		color: inherit;
	}

	.emoji {
		display: block;
		font-size: 13px;
		line-height: 1;
	}

	/* Assigned keeps bare TaskBox — no glass badge circle */
	.task-mark {
		position: absolute;
		right: -3px;
		bottom: -3px;
		line-height: 0;
		pointer-events: none;
	}

	.copy {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		justify-content: center;
	}

	.line1 {
		display: flex;
		align-items: baseline;
		gap: 5px;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.2;
		overflow: hidden;
		white-space: nowrap;
	}

	.who {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.verb {
		flex-shrink: 0;
		font-weight: 500;
		color: var(--fg-33);
	}

	.line2 {
		display: block;
		min-width: 0;
		padding: 0;
		margin: 0;
		line-height: 1.2;
	}

	/* Reset global `.preview { padding: 16px }` from app.css */
	.preview {
		display: block;
		min-width: 0;
		padding: 0;
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.2;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (min-width: 768px) {
		/* Match desktop notifs-top: padding 0 10px 0 16px */
		.row {
			padding-left: 16px;
			padding-right: 10px;
		}
	}

	@media (max-width: 767px) {
		.activity {
			padding: calc(88px + env(safe-area-inset-top, 0px)) 0
				calc(16px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
