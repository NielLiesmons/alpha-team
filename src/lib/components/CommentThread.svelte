<script>
	/**
	 * FAB → chronological comment feed (same bubble language as chat panels).
	 * Left-aligned threaded cards; reply quotes in the composer — no nested modals.
	 */
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import AlphaLogo from './icons/AlphaLogo.svelte';
	import Voice from './icons/Voice.svelte';
	import ChatFeedCard from './ChatFeedCard.svelte';
	import ComposerSuggest from './ComposerSuggest.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		chatUi,
		commentsByKey,
		loadComments,
		postChatMessage,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import { snapFeedToBottom } from '$lib/feed-scroll.js';

	/** @type {{ type: 'task' | 'note' | 'project' | 'mail', entityId: string }} */
	let { type, entityId } = $props();

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
			await postChatMessage({
				body,
				kind: 'comment',
				ref: { type, id: entityId },
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
		const p = asPerson(replyTo.author);
		const n = p?.name || displayNameFromEmail(replyTo.author);
		const plain = String(replyTo.body || '')
			.replace(/\s+/g, ' ')
			.trim();
		const text = plain.length > 72 ? `${plain.slice(0, 72).trim()}…` : plain;
		return { name: n, text };
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
			<div class="sheet-top" aria-hidden="true">
				<span class="sheet-title">{t('comments.title')}</span>
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
							threaded
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
					<div class="composer-pill" class:expanded={pillExpanded}>
						{#if replyPreview}
							<div class="reply-bar">
								<div class="reply-meta">
									<span class="reply-label"
										>{t('comments.replyTo', { name: replyPreview.name })}</span
									>
									<span class="reply-text">{replyPreview.text}</span>
								</div>
								<button
									type="button"
									class="reply-clear"
									aria-label={t('comments.cancelReply')}
									onclick={clearReply}>×</button
								>
							</div>
						{/if}
						<div class="composer-row">
							<button type="button" class="side-btn plus" aria-label={t('chat.attach')} disabled>
								<span class="plus-glyph" aria-hidden="true">+</span>
							</button>
							<div
								class="field-shell"
								class:fade-top={fadeTop}
								class:fade-bottom={fadeBottom}
								class:tall={fieldTall}
							>
								<textarea
									bind:this={inputEl}
									bind:value={draft}
									rows="1"
									placeholder={replyTo ? t('comments.replyTo', { name: '' }).replace(/\s+$/, '…') : t('common.comment')}
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
									<AlphaLogo size={22} />
								</button>
							{:else}
								<button type="button" class="side-btn voice" aria-label={t('chat.voiceMessage')} disabled>
									<Voice size={18} />
								</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.chat-pill {
		position: fixed;
		z-index: 60;
		right: max(16px, env(safe-area-inset-right));
		bottom: max(16px, env(safe-area-inset-bottom));
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 40px;
		padding: 0 14px 0 12px;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
		color: var(--fg-66);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	.chat-pill:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 14%, transparent);
	}

	.chat-pill .count {
		font-size: 13px;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		color: inherit;
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
		right: max(12px, env(safe-area-inset-right));
		bottom: max(12px, env(safe-area-inset-bottom));
		left: auto;
		top: auto;
		width: min(420px, calc(100vw - 24px));
		height: min(640px, calc(100dvh - 24px));
		max-height: calc(100dvh - 24px);
		display: flex;
		flex-direction: column;
		pointer-events: none;
	}

	.sheet {
		pointer-events: auto;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		border-radius: 18px;
		overflow: hidden;
		background: var(--popover, var(--bg));
		border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
		box-shadow: 0 16px 48px color-mix(in srgb, #000 28%, transparent);
	}

	.sheet.grow-in {
		transform-origin: 100% 100%;
	}

	.sheet-top {
		flex-shrink: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		height: 44px;
		padding: 0 16px 10px;
		box-sizing: border-box;
		background: linear-gradient(
			to bottom,
			var(--popover, var(--bg)) 40%,
			color-mix(in srgb, var(--popover, var(--bg)) 0%, transparent)
		);
		pointer-events: none;
	}

	.sheet-title {
		font-size: 13px;
		font-weight: 650;
		color: var(--fg-33);
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding: 8px 12px calc(88px + env(safe-area-inset-bottom, 0px));
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
		left: 14px;
		right: 14px;
		bottom: calc(72px + env(safe-area-inset-bottom, 0px));
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
		height: 88px;
		pointer-events: none;
		background: linear-gradient(
			to top,
			var(--popover, var(--bg)) 30%,
			color-mix(in srgb, var(--popover, var(--bg)) 0%, transparent)
		);
	}

	.composer-dock {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 4;
		padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		pointer-events: none;
	}

	.composer-stack {
		pointer-events: auto;
		position: relative;
	}

	.composer-pill {
		display: flex;
		flex-direction: column;
		border-radius: 22px;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		border: 1px solid color-mix(in srgb, var(--fg) 8%, transparent);
		overflow: hidden;
	}

	.composer-pill.expanded {
		border-radius: 18px;
	}

	.reply-bar {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 10px 0;
	}

	.reply-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.reply-label {
		font-size: 12px;
		font-weight: 650;
		color: var(--fg-66);
	}

	.reply-text {
		font-size: 12px;
		color: var(--fg-33);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.reply-clear {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
		font-size: 16px;
		line-height: 1;
	}

	.composer-row {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		padding: 4px 4px 4px 6px;
	}

	.side-btn {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
	}

	.side-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.side-btn.send {
		color: var(--fg);
	}

	.plus-glyph {
		font-size: 22px;
		font-weight: 400;
		line-height: 1;
	}

	.field-shell {
		flex: 1;
		min-width: 0;
		display: flex;
	}

	.field-shell textarea {
		width: 100%;
		margin: 0;
		padding: 8px 6px;
		border: 0;
		resize: none;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 15px;
		line-height: 1.35;
		max-height: 140px;
		outline: none;
	}

	@media (max-width: 767px) {
		.wrap {
			inset: 0;
			width: 100%;
			height: 100%;
			max-height: none;
			right: 0;
			bottom: 0;
			left: 0;
			top: 0;
		}

		.sheet {
			border-radius: 0;
			border: 0;
			box-shadow: none;
		}

		.chat-pill {
			right: max(14px, env(safe-area-inset-right));
			bottom: max(14px, env(safe-area-inset-bottom));
		}
	}
</style>
