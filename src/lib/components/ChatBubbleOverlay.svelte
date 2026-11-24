<script>
	/**
	 * Alpha Chat–style bubble overlay: stadium reaction row (MRU + defaults, + expand)
	 * stacked with a narrower frosted actions panel.
	 *
	 * Plus expands the reactions pill in place (width/height only; fixed radius) into
	 * an emoji browser — never a second overlay panel. Opens stay until an explicit
	 * act (react / action / scrim). First pointer release after open is ignored so
	 * the open gesture never hits a reaction.
	 */
	import { onMount } from 'svelte';
	import ChatEmoji from './ChatEmoji.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import Copy from './icons/Copy.svelte';
	import Forward from './icons/Forward.svelte';
	import Reply from './icons/Reply.svelte';
	import Trash from './icons/Trash.svelte';
	import { quickReactionEmojis } from '$lib/chat.svelte.js';
	import { rememberEmoji } from '$lib/emoji.js';
	import { isCustomEmojiToken } from '$lib/message-emoji.js';
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

	/** Collapsed stadium → expanded emoji browser (same surface). */
	let browserOpen = $state(false);
	/** Blocks reaction/action hits until the opening pointer is fully done. */
	let interactive = $state(false);
	/** @type {HTMLDivElement | undefined} */
	let rootEl = $state();
	let placeX = $state(0);
	let placeY = $state(0);
	let actionsAbove = $state(false);
	let quick = $state(/** @type {string[]} */ ([]));

	const COLLAPSED_W = 280;
	const COLLAPSED_H = 44;
	/* Half of collapsed height → perfect stadium; stays fixed when expanded. */
	const REACTIONS_RADIUS = 22;

	$effect(() => {
		if (!open) {
			browserOpen = false;
			interactive = false;
			return;
		}
		seenCount; /* re-layout when Seen by appears */
		browserOpen;
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
		const reactW = browserOpen ? Math.min(340, window.innerWidth - pad * 2) : COLLAPSED_W;
		const reactH = browserOpen ? Math.min(420, window.innerHeight * 0.55) : COLLAPSED_H;
		const actionsW = seenCount > 0 ? 220 : 180;
		const gap = 12;
		const rowH = 40; /* matches .alpha-popover-item min-height */
		const seenH = seenCount > 0 ? 40 : 0;
		let rows = 1; /* reply */
		if (oncopy) rows += 1;
		if (onselect) rows += 1;
		if (onforward) rows += 1;
		if (canDelete && ondelete) rows += 1;
		const actionsH = seenH + rows * rowH;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		actionsAbove = y >= vh * (2 / 3);
		let rx = Math.min(Math.max(pad, x - reactW / 2), vw - pad - reactW);
		let ry = Math.min(Math.max(pad, y - (browserOpen ? 24 : reactH / 2)), vh - pad - reactH);
		if (!browserOpen) {
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
			rootEl?.style.setProperty('--actions-w', `${actionsW}px`);
			rootEl?.style.setProperty(
				'--actions-x',
				`${Math.min(Math.max(pad, x - actionsW / 2), vw - pad - actionsW)}px`
			);
			rootEl?.style.setProperty('--actions-y', `${ay}px`);
		}
		placeX = rx;
		placeY = ry;
		rootEl?.style.setProperty('--react-w', `${reactW}px`);
		rootEl?.style.setProperty('--react-h', `${reactH}px`);
	}

	onMount(() => {
		/** @param {KeyboardEvent} e */
		function onKey(e) {
			if (e.key === 'Escape') {
				if (browserOpen) browserOpen = false;
				else onclose();
			}
		}
		/** @param {UIEvent} _e */
		function onResize(_e) {
			if (open) layout();
		}
		window.addEventListener('keydown', onKey);
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('resize', onResize);
		};
	});

	/** @param {string} emoji */
	function pickReact(emoji) {
		if (!interactive) return;
		rememberEmoji(emoji);
		onreact(emoji);
		onclose();
	}

	/** @param {string} emoji */
	function pickFromBrowser(emoji) {
		rememberEmoji(emoji);
		browserOpen = false;
		onreact(emoji);
		onclose();
	}

	function toggleBrowser() {
		if (!interactive) return;
		browserOpen = !browserOpen;
		queueMicrotask(() => layout());
	}

	/** @param {() => void} act */
	function runAction(act) {
		if (!interactive || browserOpen) return;
		act();
		onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="overlay-root"
		class:armed={interactive}
		class:browser={browserOpen}
		bind:this={rootEl}
		style:--react-x="{placeX}px"
		style:--react-y="{placeY}px"
		style:--reactions-radius="{REACTIONS_RADIUS}px"
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
			class:expanded={browserOpen}
			role={browserOpen ? 'dialog' : 'listbox'}
			aria-label={t('chat.reactions')}
			aria-disabled={!interactive}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			{#if browserOpen}
				<div class="browser-body">
					<EmojiPicker onselect={pickFromBrowser} allowCustom={true} autofocus={true} />
				</div>
			{:else}
				<div class="emoji-scroll">
					{#each quick as emoji (emoji)}
						<button
							type="button"
							class="emoji-hit"
							role="option"
							tabindex={interactive ? 0 : -1}
							onclick={() => pickReact(emoji)}
						>
							{#if isCustomEmojiToken(emoji)}
								<ChatEmoji token={emoji} size={24} />
							{:else}
								<span class="glyph">{emoji}</span>
							{/if}
						</button>
					{/each}
				</div>
				<span class="emoji-fade" aria-hidden="true"></span>
				<button
					type="button"
					class="plus-hit"
					aria-label={t('chat.moreReactions')}
					aria-expanded={browserOpen}
					tabindex={interactive ? 0 : -1}
					onclick={(e) => {
						e.stopPropagation();
						toggleBrowser();
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
			{/if}
		</div>

		<div
			class="actions-panel alpha-popover"
			class:has-seen={seenCount > 0}
			class:hidden={browserOpen}
			role="menu"
			aria-label={t('chat.messageActions')}
			aria-disabled={!interactive || browserOpen}
			aria-hidden={browserOpen}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="alpha-popover-list">
				{#if seenCount > 0}
					<div
						class="alpha-popover-item seen-row"
						role="menuitem"
						aria-label={`${t('chat.seenBy')}: ${seenCount}`}
					>
						<span class="alpha-popover-label seen-label">{t('chat.seenBy')}</span>
						<span class="seen-people">
							<ProfilePicStack profiles={seenProfiles} size="xxs" text={String(seenCount)} />
						</span>
					</div>
				{/if}
				<button
					type="button"
					class="alpha-popover-item"
					role="menuitem"
					tabindex={interactive && !browserOpen ? 0 : -1}
					onclick={() => runAction(onreply)}
				>
					<span class="alpha-popover-ico"><Reply size={16} /></span>
					<span class="alpha-popover-label">{t('chat.reply')}</span>
				</button>
				{#if oncopy}
					<button
						type="button"
						class="alpha-popover-item"
						role="menuitem"
						tabindex={interactive && !browserOpen ? 0 : -1}
						onclick={() =>
							runAction(() => {
								oncopy?.();
							})}
					>
						<span class="alpha-popover-ico"><Copy size={15} /></span>
						<span class="alpha-popover-label">{t('chat.copy')}</span>
					</button>
				{/if}
				{#if onselect}
					<button
						type="button"
						class="alpha-popover-item"
						role="menuitem"
						tabindex={interactive && !browserOpen ? 0 : -1}
						onclick={() =>
							runAction(() => {
								onselect?.();
							})}
					>
						<span class="alpha-popover-ico" aria-hidden="true">
							<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
								<path
									d="M3.5 3.5h4M3.5 3.5v4M12.5 3.5h-4M12.5 3.5v4M3.5 12.5h4M3.5 12.5v-4M12.5 12.5h-4M12.5 12.5v-4"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
						</span>
						<span class="alpha-popover-label">{t('chat.select')}</span>
					</button>
				{/if}
				{#if onforward}
					<button
						type="button"
						class="alpha-popover-item"
						role="menuitem"
						tabindex={interactive && !browserOpen ? 0 : -1}
						onclick={() =>
							runAction(() => {
								onforward?.();
							})}
					>
						<span class="alpha-popover-ico"><Forward size={16} /></span>
						<span class="alpha-popover-label">{t('chat.forward')}</span>
					</button>
				{/if}
				{#if canDelete && ondelete}
					<button
						type="button"
						class="alpha-popover-item danger"
						role="menuitem"
						tabindex={interactive && !browserOpen ? 0 : -1}
						onclick={() =>
							runAction(() => {
								ondelete?.();
							})}
					>
						<span class="alpha-popover-ico"><Trash size={15} /></span>
						<span class="alpha-popover-label">{t('common.delete')}</span>
					</button>
				{/if}
			</div>
		</div>
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
		/* No visible modal wash — dismiss hit-target only */
		background: transparent;
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
		width: var(--react-w, 280px);
		height: var(--react-h, 44px);
		/* Fixed radius — only width/height animate (comments FAB rule). */
		border-radius: var(--reactions-radius, 22px);
		overflow: hidden;
		pointer-events: none;
		box-sizing: border-box;
		transition:
			width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
			height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
			left 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
			top 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.reactions-pill.expanded {
		align-items: stretch;
		flex-direction: column;
	}

	.overlay-root.armed .reactions-pill,
	.overlay-root.armed .actions-panel {
		pointer-events: auto;
	}

	.browser-body {
		flex: 1;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
	}

	.emoji-scroll {
		flex: 1;
		min-width: 0;
		height: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		/* Room under the overlaid plus so the last glyph can scroll beneath it */
		padding: 0 52px 0 12px;
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

	.emoji-hit .glyph {
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
		line-height: 1;
	}

	.emoji-hit:hover {
		background: var(--fg-8);
	}

	/* Fade mask so emoji gently disappear under the plus */
	.emoji-fade {
		position: absolute;
		right: 40px;
		top: 0;
		bottom: 0;
		width: 36px;
		pointer-events: none;
		z-index: 2;
		background: linear-gradient(
			to right,
			transparent,
			var(--composer-bg, var(--modal-bg, var(--glass-panel, var(--bg))))
		);
	}

	.plus-hit {
		position: absolute;
		right: 0;
		top: 0;
		z-index: 3;
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
		padding: 0;
		border-radius: 14px;
		overflow: hidden;
		pointer-events: none;
		box-sizing: border-box;
		opacity: 1;
		transform: translateY(0) scale(1);
		transform-origin: top center;
		transition:
			opacity 180ms ease,
			transform 180ms ease;
	}

	.actions-panel.hidden {
		opacity: 0;
		transform: translateY(-6px) scale(0.96);
		pointer-events: none !important;
		visibility: hidden;
	}

	.overlay-root.browser .actions-panel {
		pointer-events: none;
	}

	.seen-row {
		pointer-events: none;
		cursor: default;
	}

	.seen-label {
		flex-shrink: 0;
	}

	.seen-people {
		min-width: 0;
		display: flex;
		justify-content: flex-end;
		line-height: 0;
	}
</style>
