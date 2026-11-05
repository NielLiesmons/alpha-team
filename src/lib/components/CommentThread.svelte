<script>
	/**
	 * FAB → comment panel (Zapstore-style threads + ChatFeedCard parity).
	 * Desktop: wider bottom-right panel (FAB inset). Quiet “Comments” top fader.
	 * Composer overlays the feed (ChatChannelPanel pattern). Nested replies: panel-on-panel.
	 */
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import AlphaLogo from './icons/AlphaLogo.svelte';
	import Voice from './icons/Voice.svelte';
	import ChatFeedCard from './ChatFeedCard.svelte';
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
	/**
	 * Panel stack: null = overview (all roots). String = focused thread root id.
	 * @type {(string | null)[]}
	 */
	let panelStack = $state([null]);

	const key = $derived(`${type}:${entityId}`);
	const allMessages = $derived(commentsByKey[key] ?? []);
	const messages = $derived(visibleChatMessages(allMessages));
	const byId = $derived(new Map(messages.map((m) => [m.id, m])));

	/** Top-level comments (no parent in this set). */
	const roots = $derived.by(() => {
		const ids = new Set(messages.map((m) => m.id));
		return messages.filter((m) => !m.reply_to || !ids.has(m.reply_to));
	});

	/** @param {string} parentId */
	function childrenOf(parentId) {
		return messages.filter((m) => m.reply_to === parentId);
	}

	/**
	 * Flatten descendants depth-first (for single-thread expanded view).
	 * @param {string} rootId
	 */
	function descendantsOf(rootId) {
		/** @type {any[]} */
		const out = [];
		/** @param {string} id */
		function walk(id) {
			for (const c of childrenOf(id)) {
				out.push(c);
				walk(c.id);
			}
		}
		walk(rootId);
		return out;
	}

	/**
	 * Unique replier profiles under a root (for L-shape stack).
	 * @param {string} rootId
	 */
	function repliersFor(rootId) {
		const seen = new Set();
		/** @type {{ name: string, email: string, pictureUrl: string | null }[]} */
		const profiles = [];
		for (const m of descendantsOf(rootId)) {
			const email = String(m.author || '').trim().toLowerCase();
			if (!email || seen.has(email)) continue;
			seen.add(email);
			const person = asPerson(m.author);
			const name = person?.name || displayNameFromEmail(m.author);
			profiles.push({ name, email, pictureUrl: pictureUrlFor(m.author) });
		}
		return profiles;
	}

	const canSend = $derived(Boolean(draft.trim()));
	const activeRootId = $derived(panelStack[panelStack.length - 1] ?? null);
	/** Single-thread overview → auto-expand (Zapstore). */
	const overviewExpanded = $derived(roots.length === 1);

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

	/** @param {any} msg */
	function parentOf(msg) {
		if (!msg?.reply_to) return null;
		return byId.get(msg.reply_to) ?? null;
	}

	function openSheet() {
		open = true;
		panelStack = [null];
		queueMicrotask(() => inputEl?.focus());
	}

	function closeSheet() {
		open = false;
		panelStack = [null];
		replyTo = null;
		draft = '';
		error = null;
	}

	function popPanel() {
		if (panelStack.length <= 1) {
			closeSheet();
			return;
		}
		panelStack = panelStack.slice(0, -1);
		replyTo = null;
	}

	/** @param {string} rootId */
	function pushThread(rootId) {
		panelStack = [...panelStack, rootId];
		replyTo = null;
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
				reply_to: parent?.id ?? activeRootId ?? null
			});
			queueMicrotask(() => {
				if (listEl) listEl.scrollTop = listEl.scrollHeight;
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
			popPanel();
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
{/if}

{#if open}
	<!-- Invisible hit target — dismiss / back without a darkening scrim -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="overlay"
		transition:fade={{ duration: 160 }}
		onclick={popPanel}
		role="presentation"
	></div>

	{#each panelStack as focusId, depth (focusId ?? `overview-${depth}`)}
		{@const isTop = depth === panelStack.length - 1}
		{@const focusRoot = focusId ? byId.get(focusId) : null}
		{@const showExpanded = Boolean(focusId) || overviewExpanded || roots.length === 0}
		{@const expandedRoot = focusRoot ?? (overviewExpanded ? roots[0] : null)}
		{@const expandedKids = expandedRoot ? descendantsOf(expandedRoot.id) : []}
		<div
			class="wrap"
			class:top={isTop}
			class:behind={!isTop}
			style:z-index={70 + depth * 2}
			role="dialog"
			aria-modal={isTop ? 'true' : undefined}
			aria-label={focusId ? 'Thread' : 'Comments'}
			aria-hidden={!isTop}
		>
			<div
				class="sheet"
				class:grow-in={depth === 0 && isTop}
				transition:fly={{ y: depth === 0 ? 48 : 36, duration: 240, easing: cubicOut }}
			>
				<div class="sheet-top" aria-hidden="true">
					<span class="sheet-title">Comments</span>
				</div>
				<div
					class="list"
					bind:this={listEl}
					data-panel-top={isTop ? '1' : undefined}
				>
					{#if loading && messages.length === 0}
						<p class="hint">Loading…</p>
					{:else if messages.length === 0}
						<p class="hint">No comments yet</p>
					{:else if showExpanded && expandedRoot}
						{@const rootParent =
							focusId && expandedRoot.reply_to ? parentOf(expandedRoot) : null}
						<ChatFeedCard
							msg={expandedRoot}
							parent={rootParent}
							when={formatWhen(expandedRoot.created_at)}
							onReply={isTop ? () => startReply(expandedRoot) : undefined}
						/>

						{#each expandedKids as msg, idx (msg.id)}
							{@const parent = parentOf(msg)}
							{@const quoteParent =
								parent && parent.id !== expandedRoot.id ? parent : null}
							{@const last = idx === expandedKids.length - 1}
							{@const nestedKids = childrenOf(msg.id)}
							<div class="thread-row">
								<div class="thread-rail" aria-hidden="true">
									{#if last}
										<div class="elbow">
											<svg viewBox="0 0 27 16" fill="none">
												<path
													d="M1 0 A 15 15 0 0 0 16 15 L27 15"
													stroke="currentColor"
													stroke-width="1.5"
													fill="none"
													stroke-linecap="round"
												/>
											</svg>
										</div>
									{:else}
										<div class="branch"></div>
									{/if}
								</div>
								<div class="thread-main">
									<ChatFeedCard
										msg={msg}
										parent={quoteParent}
										when={formatWhen(msg.created_at)}
										onReply={isTop ? () => startReply(msg) : undefined}
									/>
									{#if nestedKids.length > 0 && focusId}
										<div class="reply-indicator">
											<div class="connector-column">
												<div class="connector-vertical"></div>
												<div class="connector-corner">
													<svg viewBox="0 0 27 16" fill="none">
														<path
															d="M1 0 L1 0 Q1 15 16 15 L27 15"
															stroke="currentColor"
															stroke-width="1.5"
															fill="none"
														/>
													</svg>
												</div>
											</div>
											<ProfilePicStack
												profiles={repliersFor(msg.id)}
												text={nestedKids.length === 1 ? '1 reply' : `${nestedKids.length} replies`}
												size="sm"
												onclick={isTop ? () => pushThread(msg.id) : null}
											/>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					{:else}
						{#each roots as root (root.id)}
							{@const kids = descendantsOf(root.id)}
							{@const repliers = repliersFor(root.id)}
							<div class="root-block">
								<ChatFeedCard
									msg={root}
									when={formatWhen(root.created_at)}
									onReply={isTop ? () => startReply(root) : undefined}
								/>
								{#if kids.length > 0}
									<div class="reply-indicator">
										<div class="connector-column">
											<div class="connector-vertical"></div>
											<div class="connector-corner">
												<svg viewBox="0 0 27 16" fill="none">
													<path
														d="M1 0 L1 0 Q1 15 16 15 L27 15"
														stroke="currentColor"
														stroke-width="1.5"
														fill="none"
													/>
												</svg>
											</div>
										</div>
										<ProfilePicStack
											profiles={repliers}
											text={kids.length === 1 ? '1 reply' : `${kids.length} replies`}
											size="sm"
											onclick={isTop ? () => pushThread(root.id) : null}
										/>
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>

				{#if isTop}
					{#if error}
						<p class="err">{error}</p>
					{/if}
					<div class="composer-fade" aria-hidden="true"></div>
					<div class="composer-dock">
						<div class="composer-pill" class:expanded={pillExpanded}>
							{#if replyPreview}
								<div class="reply-bar">
									<div class="reply-meta">
										<span class="reply-label">Reply to {replyPreview.name}</span>
										<span class="reply-text">{replyPreview.text}</span>
									</div>
									<button
										type="button"
										class="reply-clear"
										aria-label="Cancel reply"
										onclick={clearReply}>×</button
									>
								</div>
							{/if}
							<div class="composer-row">
								<button type="button" class="side-btn plus" aria-label="Attach" disabled>
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
										rows="1"
										placeholder={replyTo ? 'Reply' : 'Comment'}
										bind:value={draft}
										oninput={onInput}
										onscroll={updateInputFade}
										aria-label="Comment"
									></textarea>
								</div>
								{#if canSend}
									<button
										type="button"
										class="side-btn send"
										aria-label="Send"
										disabled={chatUi.posting}
										onclick={() => void send()}
									>
										<AlphaLogo size={15} />
									</button>
								{:else}
									<button
										type="button"
										class="side-btn mic"
										aria-label="Voice message"
										disabled
										title="Voice coming soon"
									>
										<Voice size={22} />
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/each}
{/if}

<style>
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
		border: 1px solid var(--glass-border);
		background: var(--popover);
		color: var(--fg-66);
		cursor: pointer;
		box-shadow: 0 8px 24px var(--shadow, rgba(0, 0, 0, 0.18));
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-style: normal;
		font-variant-numeric: normal;
		letter-spacing: 0;
	}

	.chat-pill:hover {
		color: var(--fg);
	}

	.count {
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		color: inherit;
		font-variant-numeric: normal;
		font-feature-settings: 'kern' 1;
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: transparent;
	}

	.wrap {
		position: fixed;
		z-index: 70;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: stretch;
		pointer-events: none;
	}

	.wrap.behind {
		pointer-events: none;
	}

	.wrap.behind .sheet {
		transform: translateY(10px) scale(0.97);
		opacity: 0.88;
		filter: brightness(0.92);
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
		background: var(--modal-bg);
		box-shadow: 0 16px 48px var(--shadow-strong, rgba(0, 0, 0, 0.28));
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		overflow: hidden;
		transform-origin: bottom right;
	}

	.sheet.grow-in {
		animation: fab-grow 0.28s cubic-bezier(0.22, 1, 0.36, 1);
	}

	@keyframes fab-grow {
		from {
			opacity: 0.55;
			transform: scale(0.22);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Subtle top fader + quiet centered title (≤ bubble text size) */
	.sheet-top {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		z-index: 3;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		background: linear-gradient(
			to bottom,
			var(--modal-bg) 0%,
			color-mix(in srgb, var(--modal-bg) 80%, transparent) 55%,
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

	@media (min-width: 768px) {
		/* Match FAB inset: right/bottom 20px */
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
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		/* ~4px tighter than prior 14px; bottom clears floating composer */
		padding: 36px 10px calc(72px + env(safe-area-inset-bottom, 0px));
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

	.root-block {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* Zapstore L-shape / thread rail — bubbles via ChatFeedCard */
	.thread-row {
		display: flex;
		gap: 0;
		align-items: stretch;
		--thread-rail-line: 1.5px;
		--thread-rail-pic: 34px;
		--thread-rail-inset: calc(var(--thread-rail-pic) / 2 - var(--thread-rail-line) / 2);
	}

	.thread-row:has(:global(.card.mine)) {
		flex-direction: row-reverse;
	}

	.thread-rail {
		flex-shrink: 0;
		width: 34px;
		position: relative;
		color: color-mix(in srgb, var(--fg) 16%, transparent);
		margin-left: 0;
	}

	.thread-row:has(:global(.card.mine)) .thread-rail {
		display: none;
	}

	.branch {
		position: absolute;
		left: var(--thread-rail-inset);
		top: 0;
		bottom: 0;
		width: var(--thread-rail-line);
		background: currentColor;
	}

	.branch::after {
		content: '';
		position: absolute;
		left: 0;
		top: 18px;
		width: 18px;
		height: var(--thread-rail-line);
		background: currentColor;
	}

	.elbow {
		position: absolute;
		left: calc(var(--thread-rail-inset) - 0.25px);
		top: 0;
		width: 27px;
		height: 32px;
		color: inherit;
	}

	.elbow svg {
		display: block;
		width: 27px;
		height: 16px;
		margin-top: 14px;
	}

	.thread-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.reply-indicator {
		display: flex;
		align-items: flex-start;
		gap: 0;
		margin-top: 2px;
		margin-left: 6px;
		color: color-mix(in srgb, var(--fg) 16%, transparent);
	}

	.connector-column {
		display: flex;
		flex-direction: column;
		width: 28px;
		flex-shrink: 0;
		align-items: stretch;
	}

	.connector-vertical {
		width: 1.5px;
		height: 10px;
		margin-left: 15px;
		background: currentColor;
	}

	.connector-corner {
		width: 27px;
		height: 16px;
		margin-left: 14.75px;
	}

	.connector-corner svg {
		display: block;
		width: 27px;
		height: 16px;
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

	/* Soft veil behind composer — ChatChannelPanel pattern */
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
			var(--modal-bg) 0%,
			color-mix(in srgb, var(--modal-bg) 80%, transparent)
				calc(28px + env(safe-area-inset-bottom, 0px) * 0.5),
			transparent 100%
		);
	}

	/* Float over bubbles — feed scrolls underneath */
	.composer-dock {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 4;
		padding: 4px 8px calc(8px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		pointer-events: none;
		border-top: 0;
		background: transparent;
	}

	.composer-dock > * {
		pointer-events: auto;
	}

	.composer-pill {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0;
		min-height: 47px;
		padding: 0;
		border-radius: 9999px;
		box-sizing: border-box;
		/*
		 * Flat translucent fill only. Shine lives on ::after as a 1px masked ring
		 * so the diagonal never shows through the fill.
		 */
		position: relative;
		isolation: isolate;
		border: 0;
		background: color-mix(in srgb, var(--glass) 72%, transparent);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		overflow: hidden;
	}

	.composer-pill::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		pointer-events: none;
		z-index: 1;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--fg) 12%, transparent) 0%,
			color-mix(in srgb, var(--fg) 3%, transparent) 45%,
			color-mix(in srgb, var(--fg) 3%, transparent) 55%,
			color-mix(in srgb, var(--fg) 9%, transparent) 100%
		);
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
	}

	.composer-pill.expanded {
		border-radius: 16px 16px 23.5px 23.5px;
	}

	.reply-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 8px 10px 0;
		border: 0;
		background: transparent;
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
		font-weight: 600;
		color: var(--accent-1);
	}

	.reply-text {
		font-size: 12px;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.reply-clear {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-33);
		font-size: 20px;
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
	}

	.composer-pill:has(.reply-bar) .composer-row {
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

	.side-btn.plus {
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		color: var(--fg-66);
	}

	.side-btn.plus:disabled,
	.side-btn.mic:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.side-btn.mic {
		background: transparent;
		color: var(--fg-33);
	}

	.side-btn.send {
		background: var(--gradient-accent-1);
		color: #fff;
	}

	.side-btn.send:disabled {
		opacity: 0.45;
		cursor: default;
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
		field-sizing: content;
	}

	.composer-input::placeholder {
		color: var(--fg-33);
	}
</style>
