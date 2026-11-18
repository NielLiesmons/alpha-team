<script>
	/**
	 * Chat 3rd-column synopsis — activity aimed at me.
	 * Row: pfp | name (profile color) + verb | preview with kind glyph.
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
		return t('chat.activityReply');
	}

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function preview(item) {
		if (item.kind === 'assigned') return item.preview;
		return item.targetPreview || item.preview || '';
	}
</script>

<div class="activity" class:embedded>
	{#if items.length === 0}
		<p class="empty">{t('chat.activityEmpty')}</p>
	{:else}
		<ul class="list">
			{#each items as item (item.id)}
				{@const who = person(item)}
				<li>
					<button type="button" class="card" onclick={() => openItem(item)}>
						<span class="pfp" aria-hidden="true">
							<ProfilePic
								name={who.name}
								email={who.email}
								pictureUrl={pictureUrlFor(who.email)}
								size={36}
							/>
						</span>
						<span class="body">
							<span class="line1">
								<span
									class="who"
									style:color={profileNameCss(who.email, who.name, isDark)}
									>{who.name}</span
								>
								<span class="verb">{verb(item)}</span>
							</span>
							<span class="line2">
								<span class="kind" aria-hidden="true">
									{#if item.kind === 'reaction'}
										<span class="emoji">{item.emoji || '❤️'}</span>
									{:else if item.kind === 'reply'}
										<Reply size={14} />
									{:else if item.kind === 'assigned'}
										<TaskBox state={item.taskStatus || 'open'} size={15} />
									{:else}
										<At size={14} />
									{/if}
								</span>
								<span class="preview">{preview(item)}</span>
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
		flex: 1;
		box-sizing: border-box;
		padding: 0;
		width: 100%;
	}

	.empty {
		margin: 28px 0;
		font-size: 14px;
		color: var(--fg-33);
		text-align: center;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
		width: 100%;
	}

	.card {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.card:hover {
		background: var(--fg-4);
	}

	.pfp {
		flex-shrink: 0;
		line-height: 0;
	}

	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding-top: 1px;
	}

	.line1 {
		display: flex;
		align-items: baseline;
		gap: 5px;
		min-width: 0;
		font-size: 13px;
		line-height: 1.35;
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
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.kind {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		color: var(--fg-33);
		line-height: 0;
	}

	.emoji {
		font-size: 14px;
		line-height: 1;
	}

	.preview {
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.3;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
