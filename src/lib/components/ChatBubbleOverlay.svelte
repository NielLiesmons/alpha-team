<script>
	/**
	 * Alpha Chat–style bubble overlay: stadium reaction row (MRU + defaults, + picker)
	 * stacked with a narrower frosted actions panel.
	 *
	 * Opens stay until an explicit act (react / action / scrim). First pointer
	 * release after open is ignored so the open gesture never hits a reaction.
	 */
	import { onMount } from 'svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import Copy from './icons/Copy.svelte';
	import Forward from './icons/Forward.svelte';
	import Reply from './icons/Reply.svelte';
	import Trash from './icons/Trash.svelte';
	import { quickReactionEmojis } from '$lib/chat.svelte.js';
	import { rememberEmoji } from '$lib/emoji.js';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   open?: boolean,
	 *   x?: number,
	 *   y?: number,
	 *   canDelete?: boolean,
	 *   seenBy?: Array<{ name?: string, email?: string }>,
	 *   onclose?: () => void,
	 *   onreact?: (emoji: string) => void,
	 *   onreply?: () => void,
	 *   onforward?: (() => void) | null,
	 *   oncopy?: (() => void) | null,
	 *   onselect?: (() => void) | null,
	 *   ondelete?: (() => void) | null
	 * }}
	 */
	let {
		open = false,
		x = 0,
		y = 0,
		canDelete = false,
		seenBy = [],
		onclose = () => {},
		onreact = () => {},
		onreply = () => {},
		onforward = null,
		oncopy = null,
		onselect = null,
		ondelete = null
	} = $props();

	const seenProfiles = $derived(Array.isArray(seenBy) ? seenBy : []);
	const seenCount = $derived(seenProfiles.length);

	let emojiPickerOpen = $state(false);
	/** Blocks reaction/action hits until the opening pointer is fully done. */
	let interactive = $state(false);
	/** @type {HTMLDivElement | undefined} */
	let rootEl = $state();
	let placeX = $state(0);
	let placeY = $state(0);
	let actionsAbove = $state(false);
	let quick = $state(/** @type {string[]} */ ([]));

	$effect(() => {
		if (!open) {
			emojiPickerOpen = false;
			interactive = false;
			return;
		}
		seenCount; /* re-layout when Seen by appears */
		quick = quickReactionEmojis(24);
		interactive = false;
		queueMicrotask(() => layout());

		/*
		 * Keep panels + scrim inert briefly so the open gesture’s residual
		 * click/pointerup (iOS after long-press) cannot dismiss or react.
		 */
		const fallback = window.setTimeout(() => {
			interactive = true;
		}, 280);
		return () => window.clearTimeout(fallback);
	});

	function layout() {
		if (typeof window === 'undefined') return;
		const pad = 16;
		const reactW = 280;
		const reactH = 44;
		const actionsW = seenCount > 0 ? 220 : 180;
		const gap = 12;
		const rowH = 36;
		const seenH = seenCount > 0 ? 40 : 0;
		let rows = 1; /* reply */
		if (oncopy) rows += 1;
		if (onselect) rows += 1;
		if (onforward) rows += 1;
		if (canDelete && ondelete) rows += 1;
		const actionsH = seenH + rows * rowH + 8;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		actionsAbove = y >= vh * (2 / 3);
		let rx = Math.min(Math.max(pad, x - reactW / 2), vw - pad - reactW);
		let ry = Math.min(Math.max(pad, y - reactH / 2), vh - pad - reactH);
		let ay = actionsAbove ? ry - gap - actionsH : ry + reactH + gap;
		if (ay < pad) {
			ay = pad;
			ry = ay + actionsH + gap;
		}
		if (ay + actionsH > vh - pad) {
			ay = Math.max(pad, vh - pad - actionsH);
			ry = Math.min(ry, ay - gap - reactH);
			if (ry < pad) ry = pad;
		}
		placeX = rx;
		placeY = ry;
		rootEl?.style.setProperty('--actions-w', `${actionsW}px`);
		rootEl?.style.setProperty(
			'--actions-x',
			`${Math.min(Math.max(pad, x - actionsW / 2), vw - pad - actionsW)}px`
		);
		rootEl?.style.setProperty('--actions-y', `${ay}px`);
	}

	onMount(() => {
		/** @param {KeyboardEvent} e */
		function onKey(e) {
			if (e.key === 'Escape') {
				if (emojiPickerOpen) emojiPickerOpen = false;
				else onclose();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	/** @param {string} emoji */
	function pickReact(emoji) {
		if (!interactive) return;
		rememberEmoji(emoji);
		onreact(emoji);
		onclose();
	}

	/** @param {string} emoji */
	function pickFromSheet(emoji) {
		rememberEmoji(emoji);
		emojiPickerOpen = false;
		onreact(emoji);
		onclose();
	}

	/** @param {() => void} act */
	function runAction(act) {
		if (!interactive) return;
		act();
		onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="overlay-root"
		class:armed={interactive}
		bind:this={rootEl}
		style:--react-x="{placeX}px"
		style:--react-y="{placeY}px"
	>
		<button
			type="button"
			class="scrim"
			aria-label={t('common.close')}
			onclick={() => {
				if (!interactive) return;
				onclose();
			}}
		></button>

		<div
			class="reactions-pill alpha-popover"
			role="listbox"
			aria-label={t('chat.reactions')}
			aria-disabled={!interactive}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="emoji-scroll">
				{#each quick as emoji (emoji)}
					<button
						type="button"
						class="emoji-hit"
						role="option"
						tabindex={interactive ? 0 : -1}
						onclick={() => pickReact(emoji)}
					>
						{emoji}
					</button>
				{/each}
			</div>
			<span class="emoji-fade" aria-hidden="true"></span>
			<button
				type="button"
				class="plus-hit"
				aria-label={t('chat.moreReactions')}
				aria-expanded={emojiPickerOpen}
				tabindex={interactive ? 0 : -1}
				onclick={(e) => {
					e.stopPropagation();
					if (!interactive) return;
					emojiPickerOpen = !emojiPickerOpen;
				}}
			>
				<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M8 3.25v9.5M3.25 8h9.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<div
			class="actions-panel alpha-popover"
			class:has-seen={seenCount > 0}
			role="menu"
			aria-label={t('chat.messageActions')}
			aria-disabled={!interactive}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			{#if seenCount > 0}
				<div class="seen-row" role="menuitem" aria-label={`${t('chat.seenBy')}: ${seenCount}`}>
					<span class="seen-label">{t('chat.seenBy')}</span>
					<span class="seen-people">
						<ProfilePicStack profiles={seenProfiles} size="xxs" text={String(seenCount)} />
					</span>
				</div>
			{/if}
			<button
				type="button"
				class="action-row"
				role="menuitem"
				tabindex={interactive ? 0 : -1}
				onclick={() => runAction(onreply)}
			>
				<span class="action-ico"><Reply size={16} /></span>
				<span>{t('chat.reply')}</span>
			</button>
			{#if oncopy}
				<button
					type="button"
					class="action-row"
					role="menuitem"
					tabindex={interactive ? 0 : -1}
					onclick={() =>
						runAction(() => {
							oncopy?.();
						})}
				>
					<span class="action-ico"><Copy size={15} /></span>
					<span>{t('chat.copy')}</span>
				</button>
			{/if}
			{#if onselect}
				<button
					type="button"
					class="action-row"
					role="menuitem"
					tabindex={interactive ? 0 : -1}
					onclick={() =>
						runAction(() => {
							onselect?.();
						})}
				>
					<span class="action-ico" aria-hidden="true">
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
							<path
								d="M3.5 3.5h4M3.5 3.5v4M12.5 3.5h-4M12.5 3.5v4M3.5 12.5h4M3.5 12.5v-4M12.5 12.5h-4M12.5 12.5v-4"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</span>
					<span>{t('chat.select')}</span>
				</button>
			{/if}
			{#if onforward}
				<button
					type="button"
					class="action-row"
					role="menuitem"
					tabindex={interactive ? 0 : -1}
					onclick={() =>
						runAction(() => {
							onforward?.();
						})}
				>
					<span class="action-ico"><Forward size={16} /></span>
					<span>{t('chat.forward')}</span>
				</button>
			{/if}
			{#if canDelete && ondelete}
				<button
					type="button"
					class="action-row danger"
					role="menuitem"
					tabindex={interactive ? 0 : -1}
					onclick={() =>
						runAction(() => {
							ondelete?.();
						})}
				>
					<span class="action-ico"><Trash size={15} /></span>
					<span>{t('common.delete')}</span>
				</button>
			{/if}
		</div>

		{#if emojiPickerOpen}
			<div class="emoji-sheet alpha-popover" role="dialog" aria-label={t('chat.reactions')}>
				<EmojiPicker onselect={pickFromSheet} allowCustom={true} />
			</div>
		{/if}
	</div>
{/if}

<style>
	.overlay-root {
		position: fixed;
		inset: 0;
		z-index: 80;
		pointer-events: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		margin: 0;
		/* Same modal scrim token as Modal / CreateSheet */
		background: var(--scrim);
		cursor: default;
		pointer-events: auto;
	}

	.reactions-pill {
		position: absolute;
		left: var(--react-x, 16px);
		top: var(--react-y, 16px);
		z-index: 2;
		display: flex;
		align-items: center;
		width: 280px;
		height: 44px;
		border-radius: 999px;
		overflow: hidden;
		pointer-events: none;
		box-sizing: border-box;
	}

	.overlay-root.armed .reactions-pill,
	.overlay-root.armed .actions-panel,
	.overlay-root.armed .emoji-sheet {
		pointer-events: auto;
	}

	.emoji-scroll {
		flex: 1;
		min-width: 0;
		height: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 8px 0 12px;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	.emoji-scroll::-webkit-scrollbar {
		display: none;
	}

	.emoji-hit {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		font-size: 24px;
		line-height: 1;
		cursor: pointer;
		display: grid;
		place-items: center;
	}

	.emoji-hit:hover {
		background: var(--fg-8);
	}

	.emoji-fade {
		position: absolute;
		right: 44px;
		top: 0;
		bottom: 0;
		width: 12px;
		pointer-events: none;
		background: linear-gradient(
			to right,
			transparent,
			var(--composer-bg, var(--modal-bg, var(--glass-panel, var(--bg))))
		);
	}

	.plus-hit {
		position: relative;
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--fg-66);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.plus-hit::before {
		content: '';
		position: absolute;
		width: 33px;
		height: 33px;
		border-radius: 50%;
		background: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.plus-hit svg {
		position: relative;
		z-index: 1;
	}

	.plus-hit:hover {
		color: var(--fg);
	}

	.actions-panel {
		position: absolute;
		left: var(--actions-x, 16px);
		top: var(--actions-y, 72px);
		z-index: 2;
		width: var(--actions-w, 180px);
		padding: 4px 0;
		border-radius: 14px;
		overflow: hidden;
		pointer-events: none;
		box-sizing: border-box;
	}

	.seen-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		min-height: 36px;
		padding: 6px 14px;
		border: 0;
		border-bottom: 1px solid var(--fg-8);
		box-sizing: border-box;
		pointer-events: none;
	}

	.seen-label {
		flex-shrink: 0;
		font-size: 13.5px;
		font-weight: 550;
		color: var(--fg-66);
	}

	.seen-people {
		min-width: 0;
		display: flex;
		justify-content: flex-end;
		line-height: 0;
	}

	.action-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 32px;
		padding: 6px 14px;
		border: 0;
		border-bottom: 1px solid var(--fg-8);
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 13.5px;
		font-weight: 550;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.action-row:last-child {
		border-bottom: 0;
	}

	.action-row:hover {
		background: var(--fg-8);
	}

	.action-row.danger {
		color: var(--accent-3, var(--destructive, #c45));
	}

	.action-ico {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		color: inherit;
		opacity: 0.85;
		line-height: 0;
	}

	.emoji-sheet {
		position: absolute;
		left: 50%;
		bottom: max(16px, env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		z-index: 3;
		width: min(360px, calc(100vw - 24px));
		max-height: min(55vh, 420px);
		overflow: auto;
		border-radius: 18px;
		pointer-events: none;
		padding: 8px;
		box-sizing: border-box;
	}
</style>
