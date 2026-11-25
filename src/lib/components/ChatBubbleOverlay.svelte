<script>
	/**
	 * Alpha Chat–style bubble overlay: stadium reaction row (MRU + defaults, + expand)
	 * stacked with a narrower frosted actions panel.
	 *
	 * Collapsed strip: emoji scroll + plus sit side-by-side (glued, not overlaid).
	 * Right-edge fade on the emoji row (toward plus); plus inset equally top/right/bottom.
	 * Plus expands the reactions pill in place (width/height only; fixed radius) into
	 * an emoji browser — never a second overlay panel. Opens stay until an explicit
	 * act (react / action / scrim). First pointer release after open is ignored so
	 * the open gesture never hits a reaction.
	 *
	 * Placement mirrors alpha-chat BubbleOverlay.kt: reactions follow the tap;
	 * low tap → actions above; higher tap → actions below; clamp above composer.
	 * Panels share a flex column with a fixed STACK_GAP so measured heights cannot
	 * overlap. Expanding the emoji browser reflows the stack and keeps the gap.
	 */
	import { onMount } from 'svelte';
	import ChatEmoji from './ChatEmoji.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import Copy from './icons/Copy.svelte';
	import Forward from './icons/Forward.svelte';
	import Reply from './icons/Reply.svelte';
	import Text from './icons/Text.svelte';
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
	/** True after first layout — avoids painting at 0,0. */
	let placed = $state(false);
	/** Low tap → actions above reactions (Kotlin lowerZone). */
	let actionsAbove = $state(false);
	/** @type {HTMLDivElement | undefined} */
	let rootEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let stackEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let reactionsEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let actionsEl = $state();
	let stackX = $state(0);
	let stackY = $state(0);
	let actionsW = $state(180);
	let quick = $state(/** @type {string[]} */ ([]));

	const COLLAPSED_W = 280;
	/* Slightly taller than 44 so bigger glyphs + concentric plus pad fit. */
	const COLLAPSED_H = 48;
	/* Half of collapsed height → perfect stadium; stays fixed when expanded. */
	const REACTIONS_RADIUS = 24;
	const EDGE_PAD = 16;
	/** Fixed gap between reactions pill and actions panel (both stacks). */
	const STACK_GAP = 8;
	/* Equal inset for plus circle vs pill top / right / bottom. */
	const PLUS_PAD = 7;
	const PLUS_CIRCLE = COLLAPSED_H - PLUS_PAD * 2;

	/**
	 * @param {number} v
	 * @param {number} min
	 * @param {number} max
	 */
	function clamp(v, min, max) {
		if (!Number.isFinite(v)) return (min + max) / 2;
		if (min >= max) return (min + max) / 2;
		return Math.min(Math.max(min, v), max);
	}

	/** Top of chat composer dock in viewport coords, or null. */
	function composerTop() {
		const dock = document.querySelector('.composer-dock');
		if (!dock) return null;
		const top = dock.getBoundingClientRect().top;
		return Number.isFinite(top) && top > 0 ? top : null;
	}

	function layout() {
		if (typeof window === 'undefined') return;
		const pad = EDGE_PAD;
		const gap = STACK_GAP;
		const reactW = browserOpen ? Math.min(340, window.innerWidth - pad * 2) : COLLAPSED_W;
		const reactH = browserOpen ? Math.min(420, window.innerHeight * 0.55) : COLLAPSED_H;
		const panelW = seenCount > 0 ? 220 : 180;
		const rowH = 40; /* matches .alpha-popover-item min-height */
		const seenH = seenCount > 0 ? 40 : 0;
		let rows = 1; /* reply */
		if (oncopy) rows += 1;
		if (onselect) rows += 1;
		if (onforward) rows += 1;
		if (canDelete && ondelete) rows += 1;
		const actionsHEstimate = seenH + rows * rowH;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const safeTop = pad;
		const dockTop = composerTop();
		const safeBottom = Math.max(
			safeTop + 1,
			dockTop != null ? dockTop - pad : vh - pad
		);

		const tapX = Number.isFinite(x) ? x : vw / 2;
		const tapY = Number.isFinite(y) ? y : vh / 2;

		/* Low tap → actions above; higher tap → actions below (Kotlin lowerZone = 2/3). */
		actionsAbove = tapY >= vh * (2 / 3);
		actionsW = panelW;

		rootEl?.style.setProperty('--react-w', `${reactW}px`);
		rootEl?.style.setProperty('--react-h', `${reactH}px`);
		rootEl?.style.setProperty('--stack-gap', `${gap}px`);
		rootEl?.style.setProperty('--actions-w', `${panelW}px`);

		/*
		 * Prefer measured heights so estimate drift cannot eat the gap.
		 * Flex column + gap owns the distance; we only place the stack as a unit.
		 */
		const measuredReactH = reactionsEl?.offsetHeight || reactH;
		const measuredActionsH = actionsEl?.offsetHeight || actionsHEstimate;
		/* Both panels stay in-flow — expand grows the pill; CSS gap never collapses. */
		const stackInnerH = measuredReactH + gap + measuredActionsH;
		const stackW = Math.max(reactW, panelW);

		/* Reactions follow the tap; desired top before safe-area clamp of the stack. */
		const reactionsCenterY = clamp(
			tapY,
			safeTop + measuredReactH / 2,
			safeBottom - measuredReactH / 2
		);
		const desiredReactTop = reactionsCenterY - measuredReactH / 2;

		/*
		 * Stack top so the reactions pill lands on desiredReactTop.
		 * actionsAbove → column-reverse: [actions][gap][reactions].
		 * else → column: [reactions][gap][actions].
		 */
		let sy = actionsAbove
			? desiredReactTop - gap - measuredActionsH
			: desiredReactTop;

		if (sy < safeTop) sy = safeTop;
		if (sy + stackInnerH > safeBottom) {
			sy = Math.max(safeTop, safeBottom - stackInnerH);
		}

		stackX = clamp(tapX - stackW / 2, pad, Math.max(pad, vw - pad - stackW));
		stackY = sy;
		rootEl?.style.setProperty('--stack-w', `${stackW}px`);
		placed = true;
	}

	$effect(() => {
		if (!open) {
			browserOpen = false;
			interactive = false;
			placed = false;
			return;
		}
		seenCount; /* re-layout when Seen by appears */
		browserOpen;
		quick = quickReactionEmojis(24);
		interactive = false;
		/* Sync layout ASAP — no left/top CSS transition, so no fly-in. */
		layout();
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
		/* Reclamp after the pill height transition so the stack stays in-bounds. */
		const el = reactionsEl;
		if (el) {
			const onEnd = (/** @type {TransitionEvent} */ e) => {
				if (e.propertyName !== 'height' && e.propertyName !== 'width') return;
				el.removeEventListener('transitionend', onEnd);
				layout();
			};
			el.addEventListener('transitionend', onEnd);
		}
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
		class:browser={browserOpen}
		class:placed
		bind:this={rootEl}
		style:--stack-x="{stackX}px"
		style:--stack-y="{stackY}px"
		style:--actions-w="{actionsW}px"
		style:--reactions-radius="{REACTIONS_RADIUS}px"
		style:--plus-pad="{PLUS_PAD}px"
		style:--plus-circle="{PLUS_CIRCLE}px"
		style:--stack-gap="{STACK_GAP}px"
	>
		<!--
			Non-focusable dismiss target — a <button> would steal focus from the
			composer CE and slam the soft keyboard when the overlay opens.
		-->
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="scrim"
			role="presentation"
			onpointerdown={(e) => {
				/* Keep composer focus / keyboard while dismissing. */
				if (e.cancelable) e.preventDefault();
			}}
			onclick={() => {
				if (!interactive) return;
				onclose();
			}}
		></div>

		<!-- Flex column (+ column-reverse when actions above) owns the fixed gap. -->
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="panels-stack"
			class:above={actionsAbove}
			class:browser={browserOpen}
			bind:this={stackEl}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div
				class="reactions-pill alpha-popover"
				class:expanded={browserOpen}
				bind:this={reactionsEl}
				role={browserOpen ? 'dialog' : 'listbox'}
				aria-label={t('chat.reactions')}
				aria-disabled={!interactive}
			>
				{#if browserOpen}
					<div class="browser-body">
						<EmojiPicker onselect={pickFromBrowser} allowCustom={true} autofocus={true} />
					</div>
				{:else}
					<div class="collapsed-strip">
						<div class="emoji-scroll">
							{#each quick as emoji (emoji)}
								<button
									type="button"
									class="emoji-hit"
									role="option"
									tabindex={interactive ? 0 : -1}
									onpointerdown={(e) => {
										if (e.cancelable) e.preventDefault();
									}}
									onclick={() => pickReact(emoji)}
								>
									{#if isCustomEmojiToken(emoji)}
										<ChatEmoji token={emoji} size={26} />
									{:else}
										<span class="glyph">{emoji}</span>
									{/if}
								</button>
							{/each}
						</div>
						<button
							type="button"
							class="plus-hit"
							aria-label={t('chat.moreReactions')}
							aria-expanded={browserOpen}
							tabindex={interactive ? 0 : -1}
							onpointerdown={(e) => {
								if (e.cancelable) e.preventDefault();
							}}
							onclick={(e) => {
								e.stopPropagation();
								toggleBrowser();
							}}
						>
							<svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M8 3.25v9.5M3.25 8h9.5"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					</div>
				{/if}
			</div>

			<div
				class="actions-panel alpha-popover"
				class:has-seen={seenCount > 0}
				bind:this={actionsEl}
				role="menu"
				aria-label={t('chat.messageActions')}
				aria-disabled={!interactive}
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
						tabindex={interactive ? 0 : -1}
						onpointerdown={(e) => {
							if (e.cancelable) e.preventDefault();
						}}
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
							tabindex={interactive ? 0 : -1}
							onpointerdown={(e) => {
								if (e.cancelable) e.preventDefault();
							}}
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
							tabindex={interactive ? 0 : -1}
							onpointerdown={(e) => {
								if (e.cancelable) e.preventDefault();
							}}
							onclick={() =>
								runAction(() => {
									onselect?.();
								})}
						>
							<span class="alpha-popover-ico"><Text size={15} /></span>
							<span class="alpha-popover-label">{t('chat.select')}</span>
						</button>
					{/if}
					{#if onforward}
						<button
							type="button"
							class="alpha-popover-item"
							role="menuitem"
							tabindex={interactive ? 0 : -1}
							onpointerdown={(e) => {
								if (e.cancelable) e.preventDefault();
							}}
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
							tabindex={interactive ? 0 : -1}
							onpointerdown={(e) => {
								if (e.cancelable) e.preventDefault();
							}}
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
	</div>
{/if}

<style>
	.overlay-root {
		position: fixed;
		inset: 0;
		z-index: 80;
		pointer-events: none;
	}

	/* Hold invisible until first layout — no fly-from-origin. */
	.overlay-root:not(.placed) .panels-stack {
		visibility: hidden;
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
		/* Never take focus — opening actions must not close the keyboard. */
		outline: none;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}

	/*
	 * Single stack owns the gap between reactions + actions.
	 * column-reverse when actions above — same STACK_GAP either way.
	 */
	.panels-stack {
		position: absolute;
		left: var(--stack-x, 16px);
		top: var(--stack-y, 16px);
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--stack-gap, 8px);
		width: var(--stack-w, max-content);
		min-width: var(--react-w, 280px);
		box-sizing: border-box;
		pointer-events: none;
		/* No left/top transition — open is instant at computed position. */
	}

	.panels-stack.above {
		flex-direction: column-reverse;
	}

	.reactions-pill {
		position: relative;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		width: var(--react-w, 280px);
		height: var(--react-h, 48px);
		/* Fixed radius — only width/height animate (comments FAB rule). */
		border-radius: var(--reactions-radius, 24px);
		overflow: hidden;
		pointer-events: none;
		box-sizing: border-box;
		transition:
			width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
			height 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
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

	/* Emoji row + plus glued — no gap, no overlay. */
	.collapsed-strip {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: 0;
		width: 100%;
		height: 100%;
		min-width: 0;
	}

	.emoji-scroll {
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 2px 0 10px;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		/* Rightmost 16px fades opaque → transparent toward the glued plus. */
		-webkit-mask-image: linear-gradient(
			to right,
			#000 0%,
			#000 calc(100% - 16px),
			transparent 100%
		);
		mask-image: linear-gradient(
			to right,
			#000 0%,
			#000 calc(100% - 16px),
			transparent 100%
		);
		-webkit-mask-size: 100% 100%;
		mask-size: 100% 100%;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
	}

	.emoji-scroll::-webkit-scrollbar {
		display: none;
	}

	.emoji-hit {
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		font-size: 1.625rem;
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

	.plus-hit {
		position: relative;
		flex: 0 0 auto;
		align-self: stretch;
		box-sizing: border-box;
		/* Concentric with stadium: equal top / right / bottom; left glued to row. */
		width: calc(var(--plus-circle, 34px) + var(--plus-pad, 7px));
		margin: 0;
		padding: var(--plus-pad, 7px) var(--plus-pad, 7px) var(--plus-pad, 7px) 0;
		border: 0;
		background: transparent;
		color: var(--fg-66);
		display: grid;
		place-items: center;
		cursor: pointer;
		z-index: 1;
	}

	.plus-hit::before {
		content: '';
		position: absolute;
		top: var(--plus-pad, 7px);
		right: var(--plus-pad, 7px);
		bottom: var(--plus-pad, 7px);
		width: var(--plus-circle, 34px);
		height: var(--plus-circle, 34px);
		border-radius: 50%;
		background: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		pointer-events: none;
	}

	.plus-hit svg {
		position: relative;
		z-index: 1;
	}

	.plus-hit:hover {
		color: var(--fg);
	}

	.actions-panel {
		position: relative;
		flex: 0 0 auto;
		width: var(--actions-w, 180px);
		padding: 0;
		border-radius: 14px;
		overflow: hidden;
		pointer-events: none;
		box-sizing: border-box;
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
