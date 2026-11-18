<script>
	/**
	 * Chat 3rd-column synopsis — clean 2-row cards for activity aimed at me.
	 * Chrome (title / filters / adjust) lives on DetailColumn’s detail-top.
	 */
	import At from './icons/At.svelte';
	import Heart from './icons/Heart.svelte';
	import Reply from './icons/Reply.svelte';
	import TaskBox from './TaskBox.svelte';
	import TipTypeIcon from './TipTypeIcon.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { activityForMe, markActivitySeen } from '$lib/chat-activity.svelte.js';
	import { openChatRef } from '$lib/chat.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import { selectEntity } from '$lib/workspace.svelte.js';
	import { onMount } from 'svelte';

	/**
	 * @type {{
	 *   filter?: 'all' | 'reaction' | 'reply' | 'assigned',
	 *   embedded?: boolean
	 * }}
	 */
	let { filter = 'all', embedded = false } = $props();

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
	function line1(item) {
		const p = asPerson(item.author);
		const name = p?.name || displayNameFromEmail(item.author) || item.author;
		if (item.kind === 'assigned') return t('chat.activityYouAssigned');
		if (item.kind === 'reaction') {
			return t('chat.activityReactedOn', { name, emoji: item.emoji || '❤️' });
		}
		return t('chat.activityReplied', { name });
	}

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function line2(item) {
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
				<li>
					<button type="button" class="card" onclick={() => openItem(item)}>
						<span class="cat" aria-hidden="true">
							{#if item.kind === 'reaction'}
								<Heart size={15} />
							{:else if item.kind === 'reply'}
								<Reply size={15} />
							{:else}
								<At size={15} />
							{/if}
						</span>
						<span class="body">
							<span class="line1">{line1(item)}</span>
							<span class="line2">
								<span class="trail-ico" aria-hidden="true">
									{#if item.kind === 'assigned'}
										<TaskBox state={item.taskStatus || 'open'} size={15} />
									{:else}
										<TipTypeIcon name="chat" size={15} />
									{/if}
								</span>
								<span class="trail-text">{line2(item)}</span>
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
		gap: 2px;
		width: 100%;
	}

	.card {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 10px 8px;
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

	.cat {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		margin-top: 1px;
		display: grid;
		place-items: center;
		color: var(--fg-33);
		line-height: 0;
	}

	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.line1 {
		font-size: 13px;
		font-weight: 500;
		line-height: 1.35;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.line2 {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.trail-ico {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		line-height: 0;
		opacity: 0.66;
	}

	.trail-text {
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.3;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
