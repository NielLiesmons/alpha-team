<script>
	/**
	 * FAB → chronological comment feed (same bubble language as chat panels).
	 * Desktop: floating bottom-right sheet (FAB inset). Mobile: Modal-style bottom sheet.
	 * Reply quotes in the composer — no nested modals.
	 */
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import AlphaLogo from './icons/AlphaLogo.svelte';
	import Voice from './icons/Voice.svelte';
	import ChatFeedCard from './ChatFeedCard.svelte';
	import ComposerSuggest from './ComposerSuggest.svelte';
	import ChromeActionButton from '@alpha/ui/ChromeActionButton.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		chatUi,
		commentsByKey,
		loadComments,
		postChatMessage,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { profileAccentCss, profileNameCss } from '$lib/color.js';
	import { t } from '$lib/i18n.svelte.js';
	import { snapFeedToBottom } from '$lib/feed-scroll.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import ChatComposer from '@alpha/ui/ChatComposer.svelte';

	/**
	 * @type {{
	 *   type: 'task' | 'note' | 'project' | 'mail',
	 *   entityId: string,
	 *   tip?: { title?: string, subject?: string, from?: string, from_name?: string },
	 *   onMore?: (e: MouseEvent) => void
	 * }}
	 */
	let { type, entityId, tip = undefined, onMore = undefined } = $props();

	let open = $state(false);
	let draft = $state('');
	/** @type {any | null} */
	let replyTo = $state(null);
	let loading = $state(false);
	/** @type {string | null} */
	let error = $state(null);
	/** @type {HTMLDivElement | undefined} */
	let listEl = $state();
	/** @type {HTMLTextAreaElement | undefined} */
	let inputEl = $state();

	const key = $derived(`${type}:${entityId}`);
	const allMessages = $derived(commentsByKey[key] ?? []);
	const messages = $derived(
		[...visibleChatMessages(allMessages)].sort((a, b) =>
			String(a.created_at || '').localeCompare(String(b.created_at || ''))
		)
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
		if (!open) return;
		queueMicrotask(() => snapFeedToBottom(listEl));
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

	function openSheet() {
		open = true;
		queueMicrotask(() => {
			snapFeedToBottom(listEl);
			inputEl?.focus();
		});
	}

	function closeSheet() {
		open = false;
		replyTo = null;
		draft = '';
		error = null;
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
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			if (replyTo) {
				clearReply();
				return;
			}
			closeSheet();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey && open) {
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
</script>

<svelte:window onkeydown={onKey} />

{#if !open}
	<button type="button" class="chat-pill" aria-label={t('comments.title')} onclick={openSheet}>
		<svg
			width="16"
			height="16"
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
		<span class="count">{messages.length}</span>
	</button>
{/if}

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="overlay"
		transition:fade={{ duration: 160 }}
		onclick={closeSheet}
		role="presentation"
	></div>

	<div class="wrap" role="dialog" aria-modal="true" aria-label={t('comments.title')}>
		<div class="sheet grow-in" transition:fly={{ y: 48, duration: 240, easing: cubicOut }}>
			<div class="sheet-top">
				<span class="sheet-title">{t('comments.title')}</span>
				{#if onMore}
					<div class="sheet-actions">
						<ChromeActionButton
							variant="more"
							label={t('common.more')}
							onclick={(e) => {
								e.stopPropagation();
								onMore(e);
							}}
						/>
					</div>
				{/if}
			</div>
			<div class="list" bind:this={listEl}>
				{#if loading && messages.length === 0}
					<p class="hint">{t('common.loading')}</p>
				{:else if messages.length === 0}
					<p class="hint">{t('comments.empty')}</p>
				{:else}
					{#each messages as msg (msg.id)}
						<ChatFeedCard
							{msg}
							parent={parentOf(msg)}
							when={formatWhen(msg.created_at)}
							onReply={() => startReply(msg)}
						/>
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
									aria-label={t('comments.replyTo', { name: replyPreview.name })}
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
									placeholder={replyTo
										? t('comments.replyTo', { name: '' }).replace(/\s+$/, '…')
										: t('common.comment')}
									aria-label={t('common.comment')}
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
	</div>
{/if}

<style>
	/* Inset inside the detail column — glass stroke like mail reply / chrome pills */
	.chat-pill {
		position: absolute;
		right: 20px;
		bottom: max(20px, env(safe-area-inset-bottom));
		z-index: 6;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 36px;
		padding: 0 0.75rem;
		border-radius: 999px;
		border: 1px solid transparent;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66);
		cursor: pointer;
		box-shadow: 0 4px 16px var(--shadow);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		-webkit-tap-highlight-color: transparent;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-style: normal;
		font-variant-numeric: normal;
		letter-spacing: 0;
	}

	.chat-pill:hover {
		color: var(--fg);
		background:
			linear-gradient(
					color-mix(in srgb, var(--fg) 6%, var(--glass)),
					color-mix(in srgb, var(--fg) 6%, var(--glass))
				)
				padding-box,
			var(--glass-shine) border-box;
	}

	.chat-pill .count {
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		color: inherit;
		font-variant-numeric: normal;
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: transparent;
	}

	.wrap {
		position: fixed;
		z-index: 72;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: stretch;
		pointer-events: none;
	}

	.sheet {
		position: relative;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-height: min(78svh, 640px);
		border: 1px solid var(--glass-border);
		border-bottom: none;
		border-radius: var(--radius-hero) var(--radius-hero) 0 0;
		background: var(--modal-bg, var(--glass-panel));
		box-shadow: 0 16px 48px var(--shadow-strong, rgba(0, 0, 0, 0.28));
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		overflow: hidden;
		transform-origin: bottom right;
	}

	.sheet.grow-in {
		transform-origin: 100% 100%;
	}

	.sheet-top {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		z-index: 5;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		background: linear-gradient(
			to bottom,
			var(--modal-bg, var(--glass-panel)) 0%,
			color-mix(in srgb, var(--modal-bg, var(--glass-panel)) 80%, transparent) 55%,
			transparent 100%
		);
	}

	.sheet-title {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 550;
		letter-spacing: 0.01em;
		color: var(--fg-66);
	}

	.sheet-actions {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: auto;
		display: flex;
		align-items: center;
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding: 36px 10px calc(72px + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-sizing: border-box;
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
		opacity: 0.55;
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

	/* Desktop: floating card with FAB inset + full rounded corners */
	@media (min-width: 768px) {
		.wrap {
			justify-content: flex-end;
			padding: 0 20px max(20px, env(safe-area-inset-bottom));
		}

		.sheet {
			width: min(560px, calc(100vw - 40px));
			max-width: 560px;
			margin: 0;
			border-radius: 28px;
			border-bottom: 1px solid var(--glass-border);
			max-height: min(78svh, 680px);
		}

		.sheet-actions {
			right: 12px;
		}
	}

	/* Mobile: Modal-like bottom sheet + scrim (never fullscreen, never drag handle) */
	@media (max-width: 767px) {
		.overlay {
			background: var(--scrim);
		}

		.chat-pill {
			right: 14px;
			bottom: max(14px, env(safe-area-inset-bottom));
		}

		.composer-dock {
			padding: 4px 10px calc(10px + env(safe-area-inset-bottom, 0px));
		}

		.sheet-actions {
			right: 8px;
		}
	}
</style>
