<script>
	/**
	 * Bley-style floating chat pill → Zapstore-style comments sheet
	 * (bubbles + quoted reply parent). Stays out of the Task/Note body.
	 */
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import ProfilePic from './ProfilePic.svelte';
	import Spinner from './Spinner.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		chatUi,
		commentsByKey,
		loadComments,
		postChatMessage
	} from '$lib/chat.svelte.js';
	import { profileTextColor, stringToColor } from '$lib/color.js';
	import { themeChoice } from '$lib/theme.svelte.js';

	/** @type {{ type: 'task' | 'note' | 'project', entityId: string }} */
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

	const key = $derived(`${type}:${entityId}`);
	const messages = $derived(commentsByKey[key] ?? []);
	const byId = $derived(new Map(messages.map((m) => [m.id, m])));

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	$effect(() => {
		const t = type;
		const id = entityId;
		if (!id) return;
		loading = true;
		error = null;
		loadComments(t, id)
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				loading = false;
			});
	});

	$effect(() => {
		if (!open) return;
		queueMicrotask(() => {
			if (listEl) listEl.scrollTop = listEl.scrollHeight;
		});
	});

	function formatWhen(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const diff = Date.now() - d.getTime();
		if (diff < 60_000) return 'now';
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function nameColor(email, name) {
		const rgb = stringToColor(email || name || 'A');
		return profileTextColor(rgb, isDark);
	}

	function accentRgb(email, name) {
		const rgb = stringToColor(email || name || 'A');
		return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
	}

	function preview(text, max = 80) {
		const plain = String(text || '')
			.replace(/\s+/g, ' ')
			.trim();
		if (plain.length <= max) return plain;
		return `${plain.slice(0, max).trim()}…`;
	}

	/** @param {any} msg */
	function parentOf(msg) {
		if (!msg?.reply_to) return null;
		return byId.get(msg.reply_to) ?? null;
	}

	function openSheet() {
		open = true;
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
	}

	function clearReply() {
		replyTo = null;
	}

	async function send() {
		const body = draft.trim();
		if (!body || chatUi.posting) return;
		error = null;
		try {
			await postChatMessage({
				body,
				kind: 'comment',
				ref: { type, id: entityId },
				reply_to: replyTo?.id ?? null
			});
			draft = '';
			replyTo = null;
			queueMicrotask(() => {
				if (listEl) listEl.scrollTop = listEl.scrollHeight;
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			closeSheet();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey && open) {
			e.preventDefault();
			void send();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<button type="button" class="chat-pill" aria-label="Comments" onclick={openSheet}>
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

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" transition:fade={{ duration: 180 }} onclick={closeSheet} role="presentation"
	></div>
	<div class="wrap" role="dialog" aria-modal="true" aria-label="Comments">
		<div class="sheet" transition:fly={{ y: 80, duration: 220, easing: cubicOut }}>
			<header class="sheet-head">
				<span class="sheet-title">Comments</span>
				<span class="sheet-count">{messages.length}</span>
				<button type="button" class="sheet-close" aria-label="Close" onclick={closeSheet}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M4 4l8 8M12 4l-8 8"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</header>

			<div class="list" bind:this={listEl}>
				{#if loading && messages.length === 0}
					<p class="hint">Loading…</p>
				{:else if messages.length === 0}
					<p class="hint">No comments yet</p>
				{:else}
					{#each messages as msg (msg.id)}
						{@const person = asPerson(msg.author)}
						{@const name = person?.name || displayNameFromEmail(msg.author)}
						{@const parent = parentOf(msg)}
						{@const parentPerson = parent ? asPerson(parent.author) : null}
						{@const parentName = parent
							? parentPerson?.name || displayNameFromEmail(parent.author)
							: ''}
						{@const nested = Boolean(parent)}
						<div class="card" class:nested>
							<div class="spine" aria-hidden="true">
								{#if nested}
									<div class="line-dotted"></div>
								{/if}
								<div class="line-solid"></div>
								<ProfilePic name={name} size={32} />
							</div>
							<button
								type="button"
								class="bubble"
								class:quoted={nested}
								onclick={() => startReply(msg)}
							>
								<div class="bubble-head">
									<span class="author" style:color={nameColor(msg.author, name)}>{name}</span>
									<span class="when">{formatWhen(msg.created_at)}</span>
								</div>
								{#if parent}
									<div class="quote">
										<div
											class="quote-bar"
											style:background={accentRgb(parent.author, parentName)}
											aria-hidden="true"
										></div>
										<div class="quote-body">
											<span class="quote-name" style:color={nameColor(parent.author, parentName)}
												>{parentName}</span
											>
											<span class="quote-text">{preview(parent.body)}</span>
										</div>
									</div>
								{/if}
								<p class="text">{msg.body}</p>
							</button>
						</div>
					{/each}
				{/if}
			</div>

			{#if error}
				<p class="err">{error}</p>
			{/if}

			<div class="composer">
				{#if replyTo}
					{@const rp = asPerson(replyTo.author)}
					{@const rn = rp?.name || displayNameFromEmail(replyTo.author)}
					<div class="reply-chip">
						<div class="quote compact">
							<div class="quote-bar" style:background={accentRgb(replyTo.author, rn)} aria-hidden="true"
							></div>
							<div class="quote-body">
								<span class="quote-name" style:color={nameColor(replyTo.author, rn)}>Replying to {rn}</span
								>
								<span class="quote-text">{preview(replyTo.body, 60)}</span>
							</div>
						</div>
						<button type="button" class="reply-x" aria-label="Cancel reply" onclick={clearReply}>×</button>
					</div>
				{/if}
				<textarea
					class="input"
					rows="2"
					placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
					bind:value={draft}
				></textarea>
				<button
					type="button"
					class="send"
					disabled={!draft.trim() || chatUi.posting}
					onclick={() => void send()}
				>
					{#if chatUi.posting}<Spinner size={14} label="Sending" />{:else}Send{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.chat-pill {
		position: absolute;
		right: 14px;
		bottom: max(14px, env(safe-area-inset-bottom));
		z-index: 6;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 36px;
		padding: 0 0.75rem;
		border-radius: 999px;
		border: 1px solid var(--glass-border);
		background: var(--popover);
		color: var(--fg-66);
		cursor: pointer;
		box-shadow: 0 8px 24px var(--shadow, rgba(0, 0, 0, 0.18));
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.chat-pill:hover {
		color: var(--fg);
	}

	.count {
		font-size: 13px;
		font-weight: 600;
		color: inherit;
		font-variant-numeric: tabular-nums;
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: var(--scrim);
	}

	.wrap {
		position: fixed;
		z-index: 70;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.sheet {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-height: min(78svh, 640px);
		border: 1px solid var(--glass-border);
		border-bottom: none;
		border-radius: var(--radius-hero) var(--radius-hero) 0 0;
		background: var(--modal-bg);
		box-shadow: 0 16px 48px var(--shadow-strong, rgba(0, 0, 0, 0.28));
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		overflow: hidden;
	}

	@media (min-width: 768px) {
		.sheet {
			max-width: 420px;
			margin: 0 16px 16px;
			border-radius: 28px;
			border-bottom: 1px solid var(--glass-border);
			max-height: min(72svh, 560px);
		}
	}

	.sheet-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 14px 10px;
		flex-shrink: 0;
	}

	.sheet-title {
		font-size: 15px;
		font-weight: 650;
		color: var(--fg);
	}

	.sheet-count {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.sheet-close {
		margin-left: auto;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg-66);
		cursor: pointer;
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 4px 12px 8px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.hint {
		margin: 24px 8px;
		text-align: center;
		font-size: 13px;
		color: var(--fg-33);
	}

	.card {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}

	.spine {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 34px;
	}

	.card:not(.nested) .line-dotted,
	.card:not(.nested) .line-solid {
		display: none;
	}

	.line-dotted {
		width: 2px;
		flex: 1;
		min-height: 4px;
		background: repeating-linear-gradient(
			to bottom,
			color-mix(in srgb, var(--fg) 16%, transparent) 0px,
			color-mix(in srgb, var(--fg) 16%, transparent) 6px,
			transparent 6px,
			transparent 10px
		);
	}

	.line-solid {
		width: 2px;
		flex: 1;
		min-height: 6px;
		background: color-mix(in srgb, var(--fg) 16%, transparent);
	}

	.bubble {
		flex: 0 1 auto;
		width: fit-content;
		max-width: 100%;
		min-width: 160px;
		padding: 8px 12px 8px;
		border: 0;
		border-radius: 12px 12px 12px 3px;
		background: var(--fg-4);
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}

	.bubble.quoted {
		min-width: 200px;
	}

	.bubble:hover {
		background: var(--fg-8);
	}

	.bubble-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 4px;
	}

	.author {
		font-size: 13px;
		font-weight: 600;
	}

	.when {
		font-size: 11px;
		color: var(--fg-33);
		flex-shrink: 0;
	}

	.quote {
		display: flex;
		min-width: 0;
		margin-bottom: 6px;
		border-radius: 8px;
		overflow: hidden;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.quote.compact {
		flex: 1;
		margin: 0;
	}

	.quote-bar {
		width: 2.8px;
		flex-shrink: 0;
		align-self: stretch;
	}

	.quote-body {
		flex: 1;
		min-width: 0;
		padding: 5px 10px 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.quote-name {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quote-text {
		font-size: 12px;
		line-height: 1.3;
		color: var(--fg-66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.text {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--fg-66);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.err {
		margin: 0 14px 6px;
		font-size: 12px;
		color: #b44;
	}

	.composer {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px 14px;
		border-top: 1px solid var(--fg-8);
		flex-shrink: 0;
	}

	.reply-chip {
		display: flex;
		align-items: stretch;
		gap: 6px;
	}

	.reply-x {
		width: 28px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-33);
		font-size: 18px;
		cursor: pointer;
	}

	.input {
		width: 100%;
		min-height: 52px;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		resize: none;
	}

	.input:focus {
		outline: 2px solid var(--fg-8);
		outline-offset: 0;
	}

	.send {
		align-self: flex-end;
		height: 34px;
		padding: 0 16px;
		border: 1px solid transparent;
		border-radius: 9999px;
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.send:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
