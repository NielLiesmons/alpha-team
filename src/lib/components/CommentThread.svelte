<script>
	/**
	 * FAB → chronological comment feed (same bubble language as chat panels).
	 * Morphs from the floating comments pill (bottom-right inset). No scrim —
	 * content behind stays scrollable. Close via X, drag-under-min,
	 * swipe-right, or Android/browser back.
	 */
	import Drag from './icons/Drag.svelte';
	import ChatComposerBar from './ChatComposerBar.svelte';
	import ChatFeedCard from './ChatFeedCard.svelte';
	import ComposerSuggest from './ComposerSuggest.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		chatUi,
		commentsByKey,
		commentsSettledByKey,
		loadComments,
		seedCommentsFromFeed,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { compareChatMessageAsc } from '$lib/drive/entities.js';
	import { t } from '$lib/i18n.svelte.js';
	import { snapFeedToBottom } from '$lib/feed-scroll.js';
	import { isMobileNav, setDetailPopIgnore } from '$lib/nav-stack.js';
	import ChromeActionButton from '@alpha/ui/ChromeActionButton.svelte';
	import Close from '@alpha/ui/icons/Close.svelte';
	import MetaballLoader from '@alpha/ui/MetaballLoader.svelte';
	import { tick, untrack } from 'svelte';

	/**
	 * @type {{
	 *   type: 'task' | 'note' | 'project' | 'mail' | 'file',
	 *   entityId: string,
	 *   tip?: {
	 *     title?: string,
	 *     subject?: string,
	 *     from?: string,
	 *     from_name?: string,
	 *     status?: string,
	 *     projectState?: string,
	 *     projectIcon?: string
	 *   },
	 *   onMore?: (e: MouseEvent) => void
	 * }}
	 */
	let { type, entityId, tip = undefined, onMore: _onMore = undefined } = $props();

	const SHEET_MIN_H = 200;
	const CLOSE_UNDER_MIN = 48;
	const MORPH_MS = 320;

	/** @type {'fab' | 'opening' | 'open' | 'closing'} */
	let phase = $state('fab');
	const sheetVisible = $derived(phase !== 'fab');
	/** Fully expanded metrics — `opening` still uses FAB box for one frame. */
	const expanded = $derived(phase === 'open');

	let draft = $state('');
	/** @type {any | null} */
	let replyTo = $state(null);
	/** @type {string | null} */
	let error = $state(null);
	/** @type {HTMLDivElement | undefined} */
	let listEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let panelEl = $state();
	/** @type {HTMLTextAreaElement | undefined} */
	let inputEl = $state();
	/** @type {import('./ChatComposerBar.svelte').default | undefined} */
	let composerBar = $state();
	/** Explicit sheet height (px); 0 = CSS default until user resizes. */
	let sheetHeight = $state(0);
	/** Collapsed FAB width (px) — opening/closing morph back to this, not a fixed rem. */
	let fabWidth = $state(0);
	let resizing = $state(false);
	/** Skip bottom-snap once when opening from chat “view more”. */
	let skipSnapOnce = $state(false);
	/** Own history entry while open (mobile back). */
	let pushedHistory = $state(false);
	let ignorePop = $state(false);
	/** Horizontal dismiss drag (0 = open, 1 = fully off to the right). */
	let swipeProg = $state(0);
	let swiping = $state(false);

	const key = $derived(`${type}:${entityId}`);
	const settled = $derived(Boolean(commentsSettledByKey[key]));
	const allMessages = $derived(commentsByKey[key] ?? []);
	const messages = $derived(
		[...visibleChatMessages(allMessages)].sort(compareChatMessageAsc)
	);
	const byId = $derived(new Map(messages.map((m) => [m.id, m])));
	/** Unknown/loading with no seed — spinner, never a lying 0. */
	const commentsPending = $derived(!settled && messages.length === 0);

	const commentRef = $derived.by(() => {
		/** @type {Record<string, string>} */
		const ref = { type, id: entityId };
		if (tip?.title) ref.title = tip.title;
		if (tip?.subject) ref.subject = tip.subject;
		if (tip?.from) ref.from = tip.from;
		if (tip?.from_name) ref.from_name = tip.from_name;
		return ref;
	});

	/** Visible viewport height (keyboard-aware via --app-height). */
	function vvHeight() {
		if (typeof window === 'undefined') return 640;
		const css = getComputedStyle(document.documentElement).getPropertyValue('--app-height');
		const fromCss = Number.parseFloat(css);
		if (Number.isFinite(fromCss) && fromCss > 0) return fromCss;
		return Math.round(window.visualViewport?.height ?? window.innerHeight);
	}

	function maxSheetHeight() {
		return Math.round(vvHeight() * 0.92);
	}

	function defaultSheetHeight() {
		return Math.min(Math.round(vvHeight() * 0.78), 640);
	}

	function clampSheetHeight(/** @type {number} */ h) {
		return Math.min(maxSheetHeight(), Math.max(SHEET_MIN_H, Math.round(h)));
	}

	function pushCommentsHistory() {
		if (!isMobileNav() || typeof history === 'undefined' || pushedHistory) return;
		/* Dedicated overlay flag on top of the detail layer — not a new route. */
		ignorePop = true;
		setDetailPopIgnore(true);
		history.pushState({ ...(history.state || {}), alphaComments: key }, '');
		pushedHistory = true;
		queueMicrotask(() => {
			ignorePop = false;
			setDetailPopIgnore(false);
		});
	}

	/**
	 * Pop only the comments history entry. Detail/selection stay put because
	 * bindDetailPopstate keeps the layer when `alphaLayer` remains, and we
	 * also suppress detail handlers for this intentional back.
	 */
	function popCommentsHistory() {
		if (!pushedHistory || typeof history === 'undefined') {
			pushedHistory = false;
			return;
		}
		ignorePop = true;
		setDetailPopIgnore(true);
		pushedHistory = false;
		history.back();
		queueMicrotask(() => {
			ignorePop = false;
			setDetailPopIgnore(false);
		});
	}

	/**
	 * @param {PointerEvent} e
	 */
	function onResizePointerDown(e) {
		if (e.button != null && e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		const startY = e.clientY;
		const startH =
			sheetHeight ||
			panelEl?.getBoundingClientRect().height ||
			defaultSheetHeight();
		resizing = true;
		const target = /** @type {HTMLElement} */ (e.currentTarget);
		try {
			target.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}

		/** @param {PointerEvent} ev */
		function onMove(ev) {
			const dy = startY - ev.clientY;
			const next = Math.round(startH + dy);
			/* Allow undershoot so drag-under-min can dismiss.
			 * Only sheetHeight → panelStyle; comment list does not read this. */
			sheetHeight = Math.min(maxSheetHeight(), Math.max(96, next));
		}

		/** @param {PointerEvent} ev */
		function onUp(ev) {
			resizing = false;
			try {
				target.releasePointerCapture(ev.pointerId);
			} catch {
				/* ignore */
			}
			target.removeEventListener('pointermove', onMove);
			target.removeEventListener('pointerup', onUp);
			target.removeEventListener('pointercancel', onUp);
			if (sheetHeight < SHEET_MIN_H - CLOSE_UNDER_MIN) {
				sheetHeight = 0;
				closeSheet();
				return;
			}
			sheetHeight = clampSheetHeight(sheetHeight);
		}

		target.addEventListener('pointermove', onMove);
		target.addEventListener('pointerup', onUp);
		target.addEventListener('pointercancel', onUp);
	}

	/*
	 * Seed before paint so inbox-card comment preview → FAB count is instant.
	 * Track type/id + chatFeed (via seed) so new matching feed tips update the
	 * FAB; seed is write-idempotent so we don't self-invalidate into a loop.
	 */
	$effect.pre(() => {
		const kind = type;
		const id = entityId;
		if (!id) return;
		seedCommentsFromFeed(kind, id);
	});

	/*
	 * Network reconcile once per entity — untrack so loadComments/session work
	 * doesn't re-subscribe to commentsByKey writes (morph/drag thrash).
	 */
	$effect(() => {
		const kind = type;
		const id = entityId;
		if (!id) return;
		error = null;
		untrack(() => {
			loadComments(kind, id).catch((e) => {
				error = e instanceof Error ? e.message : String(e);
			});
		});
	});

	$effect(() => {
		if (phase !== 'open') return;
		if (skipSnapOnce) {
			skipSnapOnce = false;
			return;
		}
		queueMicrotask(() => snapFeedToBottom(listEl));
	});

	/** Consume chatUi.openCommentsFor → open sheet + optional scroll (no highlight). */
	$effect(() => {
		const req = chatUi.openCommentsFor;
		if (!req) return;
		const reqKey = typeof req === 'string' ? req : req.key;
		const scrollToId =
			typeof req === 'string' ? null : req.scrollToId ? String(req.scrollToId) : null;
		if (reqKey !== key) return;
		chatUi.openCommentsFor = null;
		if (scrollToId) skipSnapOnce = true;
		void openSheet().then(async () => {
			await tick();
			if (scrollToId) {
				const el = listEl?.querySelector(`[data-comment-id="${CSS.escape(scrollToId)}"]`);
				if (el instanceof HTMLElement) {
					el.scrollIntoView({ block: 'center', behavior: 'smooth' });
				}
			} else {
				snapFeedToBottom(listEl);
			}
			inputEl?.focus();
		});
	});

	/* Android / browser back closes the sheet only (detail stays underneath). */
	$effect(() => {
		if (typeof window === 'undefined') return;
		/** @param {PopStateEvent} _e */
		function onPop(_e) {
			if (ignorePop) return;
			if (phase === 'fab' || phase === 'closing') return;
			pushedHistory = false;
			void finishClose();
		}
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	});

	/* Swipe-right to dismiss (mobile menu / detail swipe language). */
	$effect(() => {
		const el = panelEl;
		if (!el || typeof window === 'undefined' || !sheetVisible) return;

		const CLAIM = 10;
		const CLOSE_AT = 0.28;

		let startX = 0;
		let startY = 0;
		let tracking = false;
		let claimed = false;

		function span() {
			return Math.min(360, window.innerWidth * 0.55);
		}

		/** @param {TouchEvent} e */
		function onStart(e) {
			if (!isMobileNav() || e.touches.length !== 1) return;
			const t = e.target;
			if (
				t instanceof Element &&
				t.closest(
					'input, textarea, select, [contenteditable="true"], [data-no-comment-swipe], .top-btn.drag'
				)
			) {
				return;
			}
			const touch = e.touches[0];
			startX = touch.clientX;
			startY = touch.clientY;
			tracking = true;
			claimed = false;
			swiping = false;
			swipeProg = 0;
		}

		/** @param {TouchEvent} e */
		function onMove(e) {
			if (!tracking || e.touches.length !== 1) return;
			const touch = e.touches[0];
			const dx = touch.clientX - startX;
			const dy = touch.clientY - startY;
			if (!claimed) {
				if (Math.abs(dx) < CLAIM && Math.abs(dy) < CLAIM) return;
				if (Math.abs(dy) >= Math.abs(dx) * 0.85 || dx < 0) {
					tracking = false;
					swipeProg = 0;
					swiping = false;
					return;
				}
				claimed = true;
				swiping = true;
			}
			e.preventDefault();
			swipeProg = Math.max(0, Math.min(1, dx / span()));
		}

		function onEnd() {
			if (!tracking) return;
			const p = swipeProg;
			const wasClaimed = claimed;
			tracking = false;
			claimed = false;
			swiping = false;
			if (!wasClaimed) {
				swipeProg = 0;
				return;
			}
			if (p > CLOSE_AT) {
				void closeSheet();
			} else {
				swipeProg = 0;
			}
		}

		el.addEventListener('touchstart', onStart, { passive: true });
		el.addEventListener('touchmove', onMove, { passive: false });
		el.addEventListener('touchend', onEnd);
		el.addEventListener('touchcancel', onEnd);
		return () => {
			el.removeEventListener('touchstart', onStart);
			el.removeEventListener('touchmove', onMove);
			el.removeEventListener('touchend', onEnd);
			el.removeEventListener('touchcancel', onEnd);
		};
	});

	function formatWhen(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const diff = Date.now() - d.getTime();
		if (diff < 60_000) return t('chat.now');
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** @param {any} msg */
	function parentOf(msg) {
		if (!msg?.reply_to) return null;
		return byId.get(msg.reply_to) ?? null;
	}

	function measureFabWidth() {
		const w = panelEl?.getBoundingClientRect().width;
		if (w && w > 0) fabWidth = Math.round(w);
	}

	async function openSheet() {
		if (phase === 'open' || phase === 'opening') return;
		swipeProg = 0;
		measureFabWidth();
		phase = 'opening';
		pushCommentsHistory();
		await tick();
		/* Two frames: paint FAB-sized sheet host, then expand left/up. */
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				phase = 'open';
				if (!sheetHeight) sheetHeight = defaultSheetHeight();
				queueMicrotask(() => {
					snapFeedToBottom(listEl);
					inputEl?.focus();
				});
			});
		});
	}

	async function finishClose() {
		phase = 'closing';
		swipeProg = 0;
		replyTo = null;
		draft = '';
		error = null;
		await new Promise((r) => setTimeout(r, MORPH_MS));
		phase = 'fab';
		sheetHeight = 0;
		resizing = false;
	}

	async function closeSheet() {
		if (phase === 'fab' || phase === 'closing') return;
		popCommentsHistory();
		await finishClose();
	}

	/** @param {any} msg */
	function startReply(msg) {
		replyTo = msg;
		inputEl?.focus();
	}

	/** @param {string} next @param {number} cursor */
	function onSuggestInsert(next, cursor) {
		draft = next;
		queueMicrotask(() => {
			if (!inputEl) return;
			inputEl.focus();
			inputEl.setSelectionRange(cursor, cursor);
			composerBar?.afterSuggestInsert?.();
		});
	}

	function onComposerSent() {
		error = null;
		queueMicrotask(() => {
			snapFeedToBottom(listEl);
			inputEl?.focus();
		});
	}

	/** Keep sheet height inside the visible viewport when the keyboard opens. */
	$effect(() => {
		if (phase !== 'open' || typeof window === 'undefined') return;
		const clamp = () => {
			if (phase !== 'open') return;
			const max = maxSheetHeight();
			if (sheetHeight > max) sheetHeight = max;
			else if (!sheetHeight) sheetHeight = defaultSheetHeight();
		};
		clamp();
		window.visualViewport?.addEventListener('resize', clamp);
		window.visualViewport?.addEventListener('scroll', clamp);
		return () => {
			window.visualViewport?.removeEventListener('resize', clamp);
			window.visualViewport?.removeEventListener('scroll', clamp);
		};
	});

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Escape' && sheetVisible) {
			e.preventDefault();
			if (composerBar?.onParentEscape?.()) return;
			void closeSheet();
		}
	}

	/** Latest commentators first, max 3 for the FAB stack. */
	const commentatorProfiles = $derived.by(() => {
		/** @type {Map<string, { name: string, email: string, pictureUrl: string | null }>} */
		const seen = new Map();
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			const email = String(msg?.author || '')
				.trim()
				.toLowerCase();
			if (!email || seen.has(email)) continue;
			const p = asPerson(email);
			const name = p?.name || displayNameFromEmail(email);
			seen.set(email, {
				email,
				name,
				pictureUrl: pictureUrlFor(email)
			});
			if (seen.size >= 3) break;
		}
		return [...seen.values()];
	});

	const panelStyle = $derived.by(() => {
		/** @type {string} */
		let s = '';
		if (phase === 'open' && sheetHeight) s += `height:${sheetHeight}px;`;
		if ((phase === 'opening' || phase === 'closing') && fabWidth > 0) {
			s += `width:${fabWidth}px;`;
		}
		if (swipeProg > 0) {
			const pct = Math.round(swipeProg * 1000) / 10;
			s += `transform:translate3d(${pct}%,0,0);`;
		}
		return s || undefined;
	});

	/** Hide count pill when empty — collapsed FAB is chat icon only. */
	const fabCountLabel = $derived(messages.length > 0 ? String(messages.length) : '');
	const showFabStack = $derived(messages.length > 0);
	const showFabSpinner = $derived(commentsPending);
</script>

<svelte:window onkeydown={onKey} />

<div
	class="panel"
	class:fab={phase === 'fab' || phase === 'closing' || phase === 'opening'}
	class:expanded
	class:opening={phase === 'opening'}
	class:closing={phase === 'closing'}
	class:resizing
	class:swiping
	bind:this={panelEl}
	style={panelStyle}
	role={sheetVisible ? 'dialog' : undefined}
	aria-modal={sheetVisible ? 'false' : undefined}
	aria-label={sheetVisible ? t('comments.title') : undefined}
	data-no-detail-swipe={sheetVisible ? '' : undefined}
	data-no-nav-swipe={sheetVisible ? '' : undefined}
>
	{#if phase === 'fab'}
		<button
			type="button"
			class="chat-pill"
			class:icon-only={!showFabStack && !showFabSpinner}
			aria-label={t('comments.title')}
			aria-busy={showFabSpinner ? 'true' : undefined}
			onclick={() => void openSheet()}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 18 19"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path
					d="M9 0.5C13.6944 0.5 17.5 4.30558 17.5 9C17.5 13.6944 13.6944 17.5 9 17.5C7.77335 17.5 6.60815 17.2386 5.55507 16.7706C5.3323 16.6716 5.08291 16.6441 4.84737 16.7069L1.79379 17.5216C1.02463 17.7269 0.335703 16.9948 0.587211 16.2395L1.4629 13.6098C1.55241 13.341 1.52084 13.0482 1.39409 12.7948C0.822691 11.6525 0.5 10.3641 0.5 9C0.5 4.30563 4.30565 0.500084 9 0.5Z"
				/>
			</svg>
			{#if showFabSpinner}
				<span class="count loader" aria-hidden="true">
					<MetaballLoader size="sm" label={t('common.loading')} />
				</span>
			{:else if showFabStack}
				<span class="pill-stack">
					<ProfilePicStack
						profiles={commentatorProfiles}
						size="xxs"
						text={fabCountLabel}
					/>
				</span>
			{/if}
		</button>
	{:else}
		<div class="sheet-top" aria-hidden="false">
			<ChromeActionButton
				variant="icon"
				label={t('common.close')}
				class="top-btn close"
				onclick={() => void closeSheet()}
			>
				<Close size={15} />
			</ChromeActionButton>
			<p class="sheet-title">{t('comments.title')}</p>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<ChromeActionButton
				variant="icon"
				label={t('comments.resize')}
				class="top-btn drag"
				onpointerdown={onResizePointerDown}
			>
				<span class="sheet-drag" aria-hidden="true">
					<Drag size={16} />
				</span>
			</ChromeActionButton>
		</div>

		<div class="sheet-body">
			<div class="list" bind:this={listEl}>
				{#if commentsPending}
					<div class="settle-loader" aria-busy="true">
						<MetaballLoader label={t('common.loading')} />
					</div>
				{:else if messages.length === 0}
					<p class="hint">{t('comments.empty')}</p>
				{:else}
					{#each messages as msg (msg.id)}
						<div class="comment-anchor" data-comment-id={msg.id}>
							<ChatFeedCard
								{msg}
								parent={parentOf(msg)}
								when={formatWhen(msg.created_at)}
								onReply={() => startReply(msg)}
							/>
						</div>
					{/each}
				{/if}
			</div>

			{#if error}
				<p class="err">{error}</p>
			{/if}
			<div class="composer-fade" aria-hidden="true"></div>
			<div class="composer-dock">
				<ComposerSuggest {inputEl} value={draft} oninsert={onSuggestInsert} />
				<ChatComposerBar
					bind:this={composerBar}
					bind:draft
					bind:replyTo
					bind:inputEl
					{commentRef}
					signalPresence={false}
					cancelReplyLabel={t('comments.cancelReply')}
					onSent={onComposerSent}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	/*
	 * Single host morphs FAB ↔ sheet from bottom-right (same inset as the old pill).
	 * No scrim — pointer-events only on the panel itself so detail scrolls behind.
	 */
	.panel {
		/*
		 * Fixed radius for FAB ↔ sheet morph. 34px = mobile sheet hero
		 * (12 pad + 22 half-btn) so expanded corners stay concentric with chrome
		 * buttons; when collapsed to 44px height CSS clamps to a pill. Only
		 * width/height/position animate — never transition border-radius.
		 */
		--comments-radius: 34px;
		--fab-right: 20px;
		--fab-bottom: max(20px, env(safe-area-inset-bottom));
		/* Expose clearance for detail scroll padding (height + inset + gap). */
		--comments-fab-clearance: calc(44px + var(--fab-bottom) + 12px);
		position: absolute;
		right: var(--fab-right);
		bottom: var(--fab-bottom);
		left: auto;
		z-index: 6;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		transform-origin: 100% 100%;
		overflow: hidden;
		border: 1px solid transparent;
		border-radius: var(--comments-radius);
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66);
		box-shadow: 0 4px 16px var(--shadow);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition:
			width 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			height 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			max-height 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			right 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			bottom 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			left 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			background 0.24s ease,
			color 0.24s ease;
	}

	.panel.fab {
		/* Hug chat icon + ProfilePicStack — no min-width padding glitch. */
		width: max-content;
		height: 44px;
		min-height: 44px;
		max-height: 44px;
	}

	.panel.opening {
		/* Width comes from measured fabWidth inline style. */
		pointer-events: none;
	}

	.panel.opening .sheet-body,
	.panel.opening .sheet-top {
		opacity: 0;
	}

	.panel.expanded {
		width: min(420px, calc(100% - 40px));
		height: min(78svh, 680px);
		max-height: 80vh;
		min-height: 200px;
		border-color: var(--glass-border);
		background: var(--modal-bg, var(--glass-panel));
		box-shadow: 0 16px 48px var(--shadow-strong, rgba(0, 0, 0, 0.28));
		color: var(--fg);
	}

	.panel.resizing,
	.panel.swiping {
		transition: none;
	}

	.panel.closing {
		/* Width comes from measured fabWidth inline style — no rem jump. */
		height: 44px !important;
		min-height: 44px;
		max-height: 44px;
		pointer-events: none;
		opacity: 0.92;
	}

	.panel.closing .sheet-body,
	.panel.closing .sheet-top {
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s ease;
	}

	.chat-pill {
		display: inline-flex;
		align-items: center;
		gap: calc(0.35rem + 4px);
		height: 44px;
		width: max-content;
		padding: 0 10px 0 14px;
		border: 0;
		border-radius: var(--comments-radius);
		background: transparent;
		color: inherit;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-style: normal;
		font-variant-numeric: normal;
		letter-spacing: 0;
	}

	.chat-pill.icon-only {
		/* Symmetric pad when stack/count is hidden */
		padding: 0 14px;
	}

	.chat-pill:hover {
		color: var(--fg);
	}

	.count.loader {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		--loader-ink: var(--fg-66);
		color: var(--fg-66);
	}

	.pill-stack {
		display: inline-flex;
		align-items: center;
		line-height: 0;
		/* Soften the stack slightly without shrinking type below ProfilePicStack defaults
		   (0.8125rem / 600 / --fg-66 on --fg-8 pill). */
		opacity: 0.92;
	}

	.sheet-top {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		z-index: 5;
		/* 10 + 28btn + 10 — top pad matches horizontal pad of the button row. */
		height: 48px;
		display: grid;
		grid-template-columns: 28px 1fr 28px;
		align-items: center;
		gap: 8px;
		padding: 10px;
		box-sizing: border-box;
		pointer-events: none;
		background: linear-gradient(
			to bottom,
			var(--modal-bg, var(--glass-panel)) 0%,
			color-mix(in srgb, var(--modal-bg, var(--glass-panel)) 80%, transparent) 55%,
			transparent 100%
		);
		transition: opacity 0.2s ease;
	}

	.sheet-title {
		margin: 0;
		min-width: 0;
		text-align: center;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.2;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	/* ChromeActionButton hosts — enable hit + drag resize. */
	.sheet-top :global(.chrome-btn) {
		pointer-events: auto;
	}

	/* Desktop close: 1px smaller than ChromeActionButton's 16px default. */
	.sheet-top :global(.chrome-btn.close svg) {
		width: 15px;
		height: 15px;
	}

	.sheet-top :global(.chrome-btn.drag) {
		cursor: ns-resize;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
	}

	.sheet-drag {
		display: grid;
		place-items: center;
		line-height: 0;
		opacity: 0.9;
		pointer-events: none;
	}

	.sheet-body {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		opacity: 1;
		transition: opacity 0.18s ease 0.06s;
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding: 48px 10px calc(72px + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-sizing: border-box;
	}

	.comment-anchor {
		scroll-margin: 24px 0;
	}

	.hint {
		margin: 24px 8px;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--fg-33);
	}

	.settle-loader {
		display: grid;
		place-items: center;
		padding: 28px 8px;
		--loader-ink: var(--fg-66);
		color: var(--fg-66);
		opacity: 0.85;
	}

	.err {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: calc(64px + env(safe-area-inset-bottom, 0px));
		z-index: 5;
		margin: 0;
		font-size: 0.75rem;
		color: #b44;
		pointer-events: none;
	}

	.composer-fade {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 3;
		height: calc(88px + env(safe-area-inset-bottom, 0px));
		pointer-events: none;
		background: linear-gradient(
			to top,
			var(--modal-bg, var(--glass-panel)) 0%,
			color-mix(in srgb, var(--modal-bg, var(--glass-panel)) 80%, transparent)
				calc(28px + env(safe-area-inset-bottom, 0px) * 0.5),
			transparent 100%
		);
	}

	.composer-dock {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 4;
		padding: 4px 8px calc(8px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		pointer-events: none;
		background: transparent;
	}

	.composer-dock :global(.composer-stack) {
		pointer-events: auto;
	}

	@media (max-width: 767px) {
		.panel {
			--fab-right: 14px;
			--fab-bottom: max(14px, env(safe-area-inset-bottom));
		}

		.panel.expanded {
			position: fixed;
			/* Grow from FAB (bottom-right) — keep right-anchored; width → 100%. */
			left: auto;
			right: 0;
			/* Sit on the visualViewport bottom so the keyboard doesn't shove the top off-screen. */
			bottom: max(0px, calc(100dvh - var(--vv-top, 0px) - var(--app-height, 100dvh)));
			width: 100%;
			max-width: none;
			/* Mobile sheet: top radii only, no stroke (edge-to-edge). Radius snaps — not transitioned. */
			border: 0;
			border-radius: var(--comments-radius) var(--comments-radius) 0 0;
			height: min(78svh, calc(var(--app-height, 100dvh) - 8px), 640px);
			max-height: calc(var(--app-height, 100dvh) - 8px);
			z-index: 72;
		}

		.panel.opening {
			position: fixed;
			right: var(--fab-right);
			left: auto;
			bottom: var(--fab-bottom);
		}

		.panel.closing {
			position: fixed;
			right: var(--fab-right);
			left: auto;
			bottom: var(--fab-bottom);
		}

		.sheet-top {
			/* 12 + 44btn + 12 — top pad matches horizontal pad on mobile. */
			height: 68px;
			grid-template-columns: 44px 1fr 44px;
			padding: 12px;
		}

		.sheet-title {
			/* Match ChromeMobileBar / page topbar titles. */
			font-size: 1.0625rem;
			line-height: 1.15;
		}

		/* Mobile close: 4px bigger than ChromeActionButton's 20px default. */
		.sheet-top :global(.chrome-btn.close svg) {
			width: 24px;
			height: 24px;
		}

		.list {
			padding-top: 68px;
			padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
		}

		.composer-dock {
			padding: 4px 10px calc(10px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
