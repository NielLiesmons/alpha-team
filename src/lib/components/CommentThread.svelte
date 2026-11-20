<script>
	/**
	 * FAB → chronological comment feed (same bubble language as chat panels).
	 * Morphs from the floating comments pill (bottom-right inset). No scrim —
	 * content behind stays scrollable. Close via chevron, drag-under-min,
	 * swipe-right, or Android/browser back.
	 */
	import AlphaLogo from './icons/AlphaLogo.svelte';
	import Drag from './icons/Drag.svelte';
	import Voice from './icons/Voice.svelte';
	import ChatFeedCard from './ChatFeedCard.svelte';
	import ComposerSuggest from './ComposerSuggest.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		chatUi,
		commentsByKey,
		loadComments,
		postChatMessage,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { compareChatMessageAsc } from '$lib/drive/entities.js';
	import { profileAccentCss, profileNameCss } from '$lib/color.js';
	import { t } from '$lib/i18n.svelte.js';
	import { snapFeedToBottom } from '$lib/feed-scroll.js';
	import { isMobileNav } from '$lib/nav-stack.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import ChatComposer from '@alpha/ui/ChatComposer.svelte';
	import ChromeActionButton from '@alpha/ui/ChromeActionButton.svelte';
	import { tick } from 'svelte';

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
	let loading = $state(false);
	/** @type {string | null} */
	let error = $state(null);
	/** @type {HTMLDivElement | undefined} */
	let listEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let panelEl = $state();
	/** @type {HTMLTextAreaElement | undefined} */
	let inputEl = $state();
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
	const allMessages = $derived(commentsByKey[key] ?? []);
	const messages = $derived(
		[...visibleChatMessages(allMessages)].sort(compareChatMessageAsc)
	);
	const byId = $derived(new Map(messages.map((m) => [m.id, m])));

	const canSend = $derived(Boolean(draft.trim()));

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	function maxSheetHeight() {
		if (typeof window === 'undefined') return 640;
		return Math.round(window.innerHeight * 0.8);
	}

	function defaultSheetHeight() {
		if (typeof window === 'undefined') return 480;
		return Math.min(Math.round(window.innerHeight * 0.78), 640);
	}

	function clampSheetHeight(/** @type {number} */ h) {
		return Math.min(maxSheetHeight(), Math.max(SHEET_MIN_H, Math.round(h)));
	}

	function pushCommentsHistory() {
		if (!isMobileNav() || typeof history === 'undefined' || pushedHistory) return;
		ignorePop = true;
		history.pushState({ ...(history.state || {}), alphaComments: key }, '');
		pushedHistory = true;
		queueMicrotask(() => {
			ignorePop = false;
		});
	}

	function popCommentsHistory() {
		if (!pushedHistory || typeof history === 'undefined') {
			pushedHistory = false;
			return;
		}
		ignorePop = true;
		pushedHistory = false;
		history.back();
		queueMicrotask(() => {
			ignorePop = false;
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
			/* Allow undershoot so drag-under-min can dismiss. */
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

	$effect(() => {
		const kind = type;
		const id = entityId;
		if (!id) return;
		loading = true;
		error = null;
		loadComments(kind, id)
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				loading = false;
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

	/* Android / browser back closes the sheet. */
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

	function clearReply() {
		replyTo = null;
	}

	async function send() {
		const body = draft.trim();
		if (!body || chatUi.posting) return;
		error = null;
		const parent = replyTo;
		draft = '';
		fieldTall = false;
		fadeTop = false;
		fadeBottom = false;
		if (inputEl) inputEl.style.height = 'auto';
		replyTo = null;
		try {
			/** @type {Record<string, string>} */
			const ref = { type, id: entityId };
			if (tip?.title) ref.title = tip.title;
			if (tip?.subject) ref.subject = tip.subject;
			if (tip?.from) ref.from = tip.from;
			if (tip?.from_name) ref.from_name = tip.from_name;
			await postChatMessage({
				body,
				kind: 'comment',
				ref,
				reply_to: parent?.id ?? null
			});
			queueMicrotask(() => {
				snapFeedToBottom(listEl);
				inputEl?.focus();
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Escape' && sheetVisible) {
			e.preventDefault();
			if (replyTo) {
				clearReply();
				return;
			}
			void closeSheet();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey && phase === 'open') {
			e.preventDefault();
			void send();
		}
	}

	let fadeTop = $state(false);
	let fadeBottom = $state(false);
	let fieldTall = $state(false);
	const COMPOSER_FADE_THRESHOLD = 4;
	const COMPOSER_MAX_H = 140;
	const COMPOSER_TALL_PX = 28;

	function updateInputFade() {
		const el = inputEl;
		if (!el) {
			fadeTop = false;
			fadeBottom = false;
			return;
		}
		fadeTop = el.scrollTop > COMPOSER_FADE_THRESHOLD;
		fadeBottom =
			el.scrollHeight - el.clientHeight > COMPOSER_FADE_THRESHOLD &&
			el.scrollHeight - el.scrollTop - el.clientHeight > COMPOSER_FADE_THRESHOLD;
	}

	/** @param {string} next @param {number} cursor */
	function onSuggestInsert(next, cursor) {
		draft = next;
		queueMicrotask(() => {
			if (!inputEl) return;
			inputEl.focus();
			inputEl.setSelectionRange(cursor, cursor);
			onInput();
		});
	}

	function onInput() {
		const el = inputEl;
		if (!el) return;
		el.style.height = 'auto';
		const next = Math.min(el.scrollHeight, COMPOSER_MAX_H);
		el.style.height = `${next}px`;
		fieldTall = next > COMPOSER_TALL_PX || draft.includes('\n');
		updateInputFade();
	}

	const replyPreview = $derived.by(() => {
		if (!replyTo) return null;
		const email = String(replyTo.author || '');
		const p = asPerson(replyTo.author);
		const n = p?.name || displayNameFromEmail(replyTo.author);
		const plain = String(replyTo.body || '')
			.replace(/\s+/g, ' ')
			.trim();
		const text = plain.length > 72 ? `${plain.slice(0, 72).trim()}…` : plain;
		return {
			name: n,
			text,
			accent: profileAccentCss(email, n),
			nameColor: profileNameCss(email, n, isDark)
		};
	});

	const pillExpanded = $derived(Boolean(replyPreview) || fieldTall);

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

	const fabCountLabel = $derived(String(messages.length));
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
>
	{#if phase === 'fab'}
		<button type="button" class="chat-pill" aria-label={t('comments.title')} onclick={() => void openSheet()}>
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
			<span class="pill-stack">
				<ProfilePicStack
					profiles={commentatorProfiles}
					size="xxs"
					text={fabCountLabel}
				/>
			</span>
		</button>
	{:else}
		<div class="sheet-top" aria-hidden="false">
			<ChromeActionButton
				variant="icon"
				label={t('common.close')}
				class="top-btn close"
				onclick={() => void closeSheet()}
			>
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path
						d="M6.5 3.5 12 9l-5.5 5.5"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
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
				{#if loading && messages.length === 0}
					<p class="hint">{t('common.loading')}</p>
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
				<div class="composer-stack">
					<ComposerSuggest {inputEl} value={draft} oninsert={onSuggestInsert} />
					<ChatComposer expanded={pillExpanded}>
						{#if replyPreview}
							<div class="composer-quote-wrap">
								<div
									class="composer-quote"
									role="group"
									aria-label={t('chat.replyingTo', { name: replyPreview.name })}
								>
									<div
										class="composer-quote-bar"
										style:background={replyPreview.accent}
										aria-hidden="true"
									></div>
									<div class="composer-quote-body">
										<span class="composer-quote-name" style:color={replyPreview.nameColor}
											>{replyPreview.name}</span
										>
										<span class="composer-quote-text">{replyPreview.text}</span>
									</div>
									<button
										type="button"
										class="composer-quote-clear"
										aria-label={t('comments.cancelReply')}
										onclick={clearReply}>×</button
									>
								</div>
							</div>
						{/if}
						<div class="composer-row" class:chrome-expanded={pillExpanded}>
							<button type="button" class="side-btn plus" aria-label={t('chat.attach')} disabled>
								<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
									<path
										d="M9 3.5v11M3.5 9h11"
										stroke="currentColor"
										stroke-width="1.7"
										stroke-linecap="round"
									/>
								</svg>
							</button>
							<div
								class="composer-field"
								class:fade-top={fadeTop}
								class:fade-bottom={fadeBottom}
							>
								<textarea
									bind:this={inputEl}
									class="composer-input"
									bind:value={draft}
									rows="1"
									placeholder={replyTo ? t('chat.reply') : t('chat.message')}
									aria-label={t('chat.message')}
									oninput={onInput}
									onscroll={updateInputFade}
								></textarea>
							</div>
							{#if canSend}
								<button
									type="button"
									class="side-btn send"
									aria-label={t('chat.send')}
									disabled={chatUi.posting}
									onclick={() => void send()}
								>
									<AlphaLogo size={15} />
								</button>
							{:else}
								<button type="button" class="side-btn mic" aria-label={t('chat.voiceMessage')} disabled>
									<Voice size={22} />
								</button>
							{/if}
						</div>
					</ChatComposer>
				</div>
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
		 * Fixed radius for FAB ↔ sheet morph: 22px = half of 44px FAB height,
		 * so the collapsed host already reads as a pill. Only width/height animate.
		 */
		--comments-radius: 22px;
		--fab-right: 20px;
		--fab-bottom: max(20px, env(safe-area-inset-bottom));
		/* Expose clearance for detail scroll padding (height + inset + gap). */
		--comments-fab-clearance: calc(44px + var(--fab-bottom) + 12px);
		position: absolute;
		right: var(--fab-right);
		bottom: var(--fab-bottom);
		z-index: 6;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		transform-origin: bottom right;
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

	.chat-pill:hover {
		color: var(--fg);
	}

	.pill-stack {
		display: inline-flex;
		align-items: center;
		line-height: 0;
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
		font-size: 14px;
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
		font-size: 13px;
		color: var(--fg-33);
	}

	.err {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: calc(64px + env(safe-area-inset-bottom, 0px));
		z-index: 5;
		margin: 0;
		font-size: 12px;
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

	.composer-stack {
		pointer-events: auto;
		position: relative;
		width: 100%;
	}

	.composer-quote-wrap {
		padding: 8px 8px 0;
		box-sizing: border-box;
		position: relative;
		z-index: 2;
	}

	.composer-quote {
		display: flex;
		align-items: stretch;
		min-width: 0;
		width: 100%;
		border-radius: 8px;
		overflow: hidden;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.composer-quote-bar {
		width: 2.8px;
		flex-shrink: 0;
		align-self: stretch;
	}

	.composer-quote-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 4px 8px 5px;
	}

	.composer-quote-name {
		font-size: 13px;
		font-weight: 700;
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.composer-quote-text {
		font-size: 13px;
		line-height: 1.35;
		color: var(--fg-66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.composer-quote-clear {
		flex-shrink: 0;
		align-self: flex-start;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		margin: 2px 2px 0 0;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-33);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}

	.composer-row {
		display: flex;
		align-items: flex-end;
		gap: 7px;
		min-height: calc(47px - 14px);
		padding: 7px;
		box-sizing: border-box;
		position: relative;
		z-index: 2;
	}

	.composer-row.chrome-expanded {
		padding-top: 4px;
	}

	.side-btn {
		width: 33px;
		height: 33px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 9999px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.side-btn:disabled {
		cursor: default;
	}

	.side-btn.plus {
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		color: var(--fg-66);
	}

	.side-btn.mic {
		background: transparent;
		color: var(--fg-33);
	}

	.side-btn.send {
		background: var(--gradient-accent-1);
		color: #fff;
	}

	.composer-field {
		flex: 1;
		min-width: 0;
		max-height: 140px;
		display: flex;
		align-items: flex-end;
		-webkit-mask-image: linear-gradient(#000, #000);
		mask-image: linear-gradient(#000, #000);
	}

	.composer-field.fade-top {
		-webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 8px, #000 100%);
		mask-image: linear-gradient(to bottom, transparent 0, #000 8px, #000 100%);
	}

	.composer-field.fade-bottom {
		-webkit-mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 8px), transparent 100%);
		mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 8px), transparent 100%);
	}

	.composer-field.fade-top.fade-bottom {
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0,
			#000 8px,
			#000 calc(100% - 8px),
			transparent 100%
		);
		mask-image: linear-gradient(
			to bottom,
			transparent 0,
			#000 8px,
			#000 calc(100% - 8px),
			transparent 100%
		);
	}

	.composer-input {
		flex: 1;
		min-width: 0;
		width: 100%;
		min-height: 20px;
		max-height: 140px;
		margin: 0;
		padding: 6px 4px 7px;
		border: 0;
		outline: none;
		resize: none;
		overflow-y: auto;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 15px;
		line-height: 20px;
	}

	.composer-input::placeholder {
		color: var(--fg-33);
	}

	@media (max-width: 767px) {
		.panel {
			--fab-right: 14px;
			--fab-bottom: max(14px, env(safe-area-inset-bottom));
		}

		.panel.expanded {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			width: 100%;
			max-width: none;
			/* Keep --comments-radius on all corners so morph never retargets radius. */
			border-bottom: none;
			height: min(78svh, 640px);
			z-index: 72;
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

		.list {
			padding-top: 68px;
		}

		.composer-dock {
			padding: 4px 10px calc(10px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
