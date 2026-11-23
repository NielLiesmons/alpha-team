<script>
	/**
	 * Chat notifications — Notes-density rows in the detail column.
	 * Body chrome is zeroed; only card-stack gutters + top clear for detail-top.
	 * PFP 36px; badge sits further right with less overlap than the old 44px stack.
	 */
	import At from './icons/At.svelte';
	import Reply from './icons/Reply.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import TaskBox from './TaskBox.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		activityForMe,
		groupActivityByTime,
		markActivitySeen,
		readActivitySeenAt
	} from '$lib/chat-activity.svelte.js';
	import { openChatRef } from '$lib/chat.svelte.js';
	import { profileNameCss } from '$lib/color.js';
	import { t } from '$lib/i18n.svelte.js';
	import { hydratePersonCursorsLocal, personCursors } from '$lib/person-cursors.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { selectEntity } from '$lib/workspace.svelte.js';

	/**
	 * @type {{
	 *   filter?: 'all' | 'reaction' | 'reply' | 'assigned',
	 *   embedded?: boolean
	 * }}
	 */
	let { filter = 'all', embedded = false } = $props();

	/**
	 * Visit-scoped unread boundary. null until cursors hydrate — never freeze at 0
	 * (hard refresh used to paint every row unread before localStorage applied).
	 * @type {number | null}
	 */
	let seenAtOpen = $state(/** @type {number | null} */ (null));
	let markedThisVisit = $state(false);

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

	const groups = $derived(groupActivityByTime(items));

	$effect(() => {
		hydratePersonCursorsLocal();
		const ready = personCursors.ready;
		const email = personCursors.email;
		if (!ready || !email) return;
		if (seenAtOpen != null) return;
		seenAtOpen = readActivitySeenAt();
		if (!markedThisVisit) {
			markedThisVisit = true;
			markActivitySeen();
		}
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
		const parent = String(item.targetPreview || '').trim();
		if (parent) return t('chat.activityReply', { preview: parent });
		return t('chat.activityReplyBare');
	}

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function preview(item) {
		if (item.kind === 'assigned') return item.preview;
		/* Replies: line2 is the reply body; parent preview lives in the verb. */
		if (item.kind === 'reply') return item.preview || '';
		return item.targetPreview || item.preview || '';
	}

	/** @param {import('$lib/chat-activity.svelte.js').ChatActivityItem} item */
	function isUnread(item) {
		/* While hydrating, do not claim unread — avoids hard-refresh all-unread flash. */
		if (seenAtOpen == null) return false;
		return item.at > seenAtOpen;
	}

	/** @param {'today' | 'week' | 'month' | 'earlier'} key */
	function groupLabel(key) {
		if (key === 'today') return t('chat.activityGroupToday');
		if (key === 'week') return t('chat.activityGroupThisWeek');
		if (key === 'month') return t('chat.activityGroupThisMonth');
		return t('chat.activityGroupEarlier');
	}
</script>

<!-- class "feed" so detail-top chrome scroll fade can find this scroller -->
<div class="activity feed" class:embedded>
	{#if items.length === 0}
		<p class="empty">{t('chat.activityEmpty')}</p>
	{:else}
		{#each groups as group (group.key)}
			<div class="task-group-header">
				<span class="eyebrow-label-xs">{groupLabel(group.key)}</span>
			</div>
			<div class="card-stack">
				{#each group.items as item (item.id)}
					{@const who = person(item)}
					{@const unread = isUnread(item)}
					<button
						type="button"
						class="row"
						class:read={!unread}
						onclick={() => openItem(item)}
					>
						<span class="pfp" aria-hidden="true">
							<ProfilePic
								name={who.name}
								email={who.email}
								pictureUrl={pictureUrlFor(who.email)}
								size={36}
							/>
							{#if item.kind === 'assigned'}
								<span class="task-mark">
									<TaskBox state={item.taskStatus || 'open'} size={18} />
								</span>
							{:else}
								<span class="badge" class:emoji-badge={item.kind === 'reaction'}>
									<span class="badge-glyph">
										{#if item.kind === 'reaction'}
											<span class="emoji">{item.emoji || '❤️'}</span>
										{:else if item.kind === 'mention'}
											<At size={16} />
										{:else}
											<Reply size={12} />
										{/if}
									</span>
								</span>
							{/if}
						</span>
						<span class="copy">
							<span class="line1">
								<span class="line1-text">
									<span
										class="who"
										style:color={profileNameCss(who.email, who.name, isDark)}
										>{who.name}</span
									>
									<span class="verb">{verb(item)}</span>
								</span>
								{#if unread}
									<span class="unread-dot" aria-label={t('mail.unread')}></span>
								{/if}
							</span>
							<span class="line2">
								<span class="preview">{preview(item)}</span>
							</span>
						</span>
					</button>
				{/each}
			</div>
		{/each}
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
		padding: 4px 0 10px;
		box-sizing: border-box;
		width: 100%;
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 20px;
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

	.pfp {
		position: relative;
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		line-height: 0;
	}

	/* Mute only the avatar — not the badge (opacity on .pfp killed glass on read). */
	.row.read .pfp :global(.profile-pic) {
		opacity: 0.66;
	}

	/* 28×28 chrome glass disc — same pattern as ChromeMobileBar / icon-hit.
	   Always full-opacity glass for read and unread. */
	.badge {
		position: absolute;
		right: -14px;
		bottom: -4px;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: 9999px;
		box-sizing: border-box;
		border: 1px solid transparent;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		color: var(--fg-66);
		line-height: 0;
		pointer-events: none;
		opacity: 1;
	}

	.badge.emoji-badge {
		color: inherit;
	}

	.badge-glyph {
		display: grid;
		place-items: center;
		line-height: 0;
	}

	/* Mute glyph only — glass .badge background stays full opacity. */
	.row.read .badge-glyph,
	.row.read .task-mark {
		opacity: 0.66;
	}

	.emoji {
		display: block;
		font-size: 14.5px;
		line-height: 1;
	}

	/* Assigned keeps bare TaskBox — no glass badge circle */
	.task-mark {
		position: absolute;
		right: -6px;
		bottom: -3px;
		line-height: 0;
		pointer-events: none;
	}

	.copy {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		justify-content: center;
	}

	.line1 {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.2;
	}

	.line1-text {
		display: flex;
		align-items: baseline;
		gap: 5px;
		min-width: 0;
		flex: 1;
		overflow: hidden;
		white-space: nowrap;
	}

	.who {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	/* Keep derived profile color; mute via opacity (not gray --fg-66). */
	.row.read .who {
		opacity: 0.66;
	}

	.verb {
		flex-shrink: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		font-weight: 500;
		color: var(--fg-33);
	}

	.unread-dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--gradient-accent-1);
		flex-shrink: 0;
		margin-left: auto;
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
			/*
			 * Match Tasks/Files .shell.feed-pad eyebrow clearance — not inherited
			 * --feed-pad-top (chat list uses the tighter 52px shell pad).
			 */
			padding: calc(62px + env(safe-area-inset-top, 0px)) 0
				calc(16px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
