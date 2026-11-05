<script>
	/**
	 * Missive-style mail thread: mail panels + private chat bubbles + status lines
	 * in one chronological feed, with a full bottom chat composer (no FAB).
	 */
	import AlphaLogo from './icons/AlphaLogo.svelte';
	import Voice from './icons/Voice.svelte';
	import ChatFeedCard from './ChatFeedCard.svelte';
	import ChatStatusLine from './ChatStatusLine.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { activePerson, asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		chatUi,
		commentsByKey,
		loadComments,
		postChatMessage,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { formatMailWhen, mailAuthorLabel, threadMessages } from '$lib/mail.svelte.js';
	import { mailView } from '$lib/mail-view.svelte.js';
	import { openComposer } from '$lib/workspace.svelte.js';

	/**
	 * @type {{
	 *   mailMsg: any,
	 *   replyTo?: string,
	 *   menuOpen?: boolean,
	 *   onMore?: () => void
	 * }}
	 */
	let { mailMsg, replyTo = '', menuOpen = false, onMore = () => {} } = $props();

	const threadId = $derived(String(mailMsg?.id || ''));
	const me = $derived((activePerson().email || '').trim().toLowerCase());
	const mails = $derived(threadMessages(mailMsg));
	const comments = $derived(visibleChatMessages(commentsByKey[`mail:${threadId}`] ?? []));

	let draft = $state('');
	/** @type {any | null} */
	let replyMsg = $state(null);
	/** @type {string | null} */
	let error = $state(null);
	/** @type {HTMLTextAreaElement | undefined} */
	let inputEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let feedEl = $state();
	let fadeTop = $state(false);
	let fadeBottom = $state(false);
	let fieldTall = $state(false);

	const canSend = $derived(Boolean(draft.trim()));
	const pillExpanded = $derived(Boolean(replyMsg) || fieldTall);

	const replyPreview = $derived.by(() => {
		if (!replyMsg) return null;
		const person = asPerson(replyMsg.author);
		const name = person?.name || displayNameFromEmail(replyMsg.author);
		const plain = String(replyMsg.body || '')
			.replace(/\s+/g, ' ')
			.trim();
		const text = plain.length > 72 ? `${plain.slice(0, 72).trim()}…` : plain || 'Message';
		return { name, text };
	});

	$effect(() => {
		const id = threadId;
		if (!id) return;
		void loadComments('mail', id).catch(() => {});
	});

	$effect(() => {
		comments.length;
		queueMicrotask(() => {
			if (!feedEl) return;
			feedEl.scrollTop = feedEl.scrollHeight;
		});
	});

	/**
	 * Unified timeline: mail panels, chat bubbles, status lines.
	 */
	const timeline = $derived.by(() => {
		/** @type {{ type: 'mail' | 'chat' | 'status', id: string, at: string, mail?: any, msg?: any, text?: string, email?: string, name?: string }[]} */
		const items = [];
		for (const m of mails) {
			items.push({
				type: 'mail',
				id: `mail-${m.id}`,
				at: String(m.created_at || ''),
				mail: m
			});
		}
		for (const c of comments) {
			if (c?.kind === 'event') {
				const author = String(c.author || '').toLowerCase();
				items.push({
					type: 'status',
					id: `status-${c.id}`,
					at: String(c.created_at || ''),
					text: String(c.body || '').trim() || 'Updated this conversation',
					email: author,
					name: displayNameFromEmail(c.author)
				});
				continue;
			}
			items.push({
				type: 'chat',
				id: `chat-${c.id}`,
				at: String(c.created_at || ''),
				msg: c
			});
		}
		items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
		return items;
	});

	/** @param {any} m */
	function isDraft(m) {
		return Boolean(m?.draft || m?.keywords?.$draft || mailView.folder === 'drafts');
	}

	/** @param {any} msg */
	function startReply(msg) {
		replyMsg = msg;
		queueMicrotask(() => inputEl?.focus());
	}

	function clearReply() {
		replyMsg = null;
	}

	function onInput() {
		const el = inputEl;
		if (!el) return;
		el.style.height = 'auto';
		const h = Math.min(el.scrollHeight, 140);
		el.style.height = `${h}px`;
		fieldTall = h > 28;
		fadeTop = el.scrollTop > 2;
		fadeBottom = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
	}

	function updateInputFade() {
		const el = inputEl;
		if (!el) return;
		fadeTop = el.scrollTop > 2;
		fadeBottom = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
	}

	async function send() {
		const body = draft.trim();
		if (!body || !threadId || chatUi.posting) return;
		error = null;
		const parent = replyMsg;
		draft = '';
		fieldTall = false;
		fadeTop = false;
		fadeBottom = false;
		if (inputEl) inputEl.style.height = 'auto';
		replyMsg = null;
		try {
			await postChatMessage({
				body,
				kind: 'comment',
				ref: { type: 'mail', id: threadId },
				reply_to: parent?.id ?? null
			});
			queueMicrotask(() => {
				if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
				inputEl?.focus();
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Escape' && replyMsg) {
			e.preventDefault();
			clearReply();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}
</script>

<div class="mail-thread-shell">
	<div class="mail-feed" bind:this={feedEl}>
		{#each timeline as item (item.id)}
			{#if item.type === 'status'}
				<ChatStatusLine text={item.text || ''} email={item.email || ''} name={item.name || ''} />
			{:else if item.type === 'chat' && item.msg}
				<div class="chat-row">
					<ChatFeedCard
						msg={item.msg}
						when={formatMailWhen(item.msg.created_at)}
						onReply={() => startReply(item.msg)}
					/>
				</div>
			{:else if item.type === 'mail' && item.mail}
				{@const m = item.mail}
				{@const fromEmail = String(m.from || '').toLowerCase()}
				{@const fromName = mailAuthorLabel(m) || displayNameFromEmail(m.from)}
				{@const toLine = (m.to || []).map(displayNameFromEmail).filter(Boolean).join(', ')}
				<article class="mail-panel" class:draft={isDraft(m)}>
					<header class="mail-panel-head">
						<span class="mail-panel-who">
							<ProfilePic
								name={fromName}
								email={fromEmail}
								pictureUrl={pictureUrlFor(fromEmail)}
								size={36}
							/>
							<span class="mail-panel-id">
								<span class="mail-panel-name">{fromName}</span>
								<span class="mail-panel-email">{fromEmail}</span>
							</span>
						</span>
						<span class="mail-panel-actions">
							<button
								type="button"
								class="icon-hit"
								aria-label="Reply"
								onclick={() =>
									openComposer('mail', undefined, undefined, {
										to: fromEmail === me ? m.to?.[0] || replyTo : fromEmail || replyTo
									})
								}
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M6.5 3.5 2.5 7.5l4 4"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										d="M2.5 7.5h7.2c2.1 0 3.8 1.5 3.8 3.4V13"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
							<button
								type="button"
								class="icon-hit"
								aria-label="More"
								aria-expanded={menuOpen}
								onclick={onMore}
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<circle cx="3.2" cy="8" r="1.35" fill="currentColor" />
									<circle cx="8" cy="8" r="1.35" fill="currentColor" />
									<circle cx="12.8" cy="8" r="1.35" fill="currentColor" />
								</svg>
							</button>
						</span>
					</header>
					{#if toLine}
						<p class="mail-panel-to">To: {toLine}</p>
					{/if}
					<p class="mail-panel-when">{formatMailWhen(m.created_at)}</p>
					<pre class="mail-panel-body">{m.body || ''}</pre>
				</article>
			{/if}
		{/each}
	</div>

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
					<button type="button" class="reply-clear" aria-label="Cancel reply" onclick={clearReply}
						>×</button
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
				<div class="composer-field" class:fade-top={fadeTop} class:fade-bottom={fadeBottom}>
					<textarea
						bind:this={inputEl}
						class="composer-input"
						rows="1"
						placeholder={replyMsg ? 'Reply' : 'Message the team'}
						bind:value={draft}
						oninput={onInput}
						onscroll={updateInputFade}
						onkeydown={onKey}
						aria-label="Team chat"
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
</div>

<style>
	.mail-thread-shell {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		width: 100%;
	}

	.mail-feed {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 0 0 calc(88px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
	}

	.chat-row {
		display: flex;
		flex-direction: column;
		padding: 0 4px;
	}

	.mail-panel {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 14px 16px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--fg) 4.5%, transparent);
		border: 0;
	}

	.mail-panel.draft {
		background: color-mix(in srgb, var(--fg) 3%, transparent);
		outline: 1px dashed color-mix(in srgb, var(--fg) 12%, transparent);
		outline-offset: -1px;
	}

	.mail-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.mail-panel-who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1;
	}

	.mail-panel-id {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.mail-panel-name {
		font-size: 14px;
		font-weight: 650;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mail-panel-email {
		font-size: 12px;
		font-weight: 450;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mail-panel-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
		margin-top: -2px;
	}

	.mail-panel-to {
		margin: 0;
		padding-left: 46px;
		font-size: 12px;
		font-weight: 450;
		color: var(--fg-33);
		line-height: 1.35;
	}

	.mail-panel-when {
		margin: 0;
		padding-left: 46px;
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.mail-panel-body {
		margin: 4px 0 0;
		padding: 0 0 0 46px;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 14px;
		line-height: 1.55;
		color: var(--fg-66);
		white-space: pre-wrap;
		word-break: break-word;
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
		z-index: 3;
		height: calc(88px + env(safe-area-inset-bottom, 0px));
		pointer-events: none;
		background: linear-gradient(
			to top,
			var(--bg) 0%,
			color-mix(in srgb, var(--bg) 80%, transparent)
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
		padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		pointer-events: none;
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
		position: relative;
		isolation: isolate;
		border: 0;
		background: color-mix(in srgb, var(--glass) 72%, transparent);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		overflow: hidden;
	}

	.composer-pill.expanded {
		border-radius: 22px;
	}

	.reply-bar {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 10px 12px 0;
	}

	.reply-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.reply-label {
		font-size: 11px;
		font-weight: 650;
		color: var(--fg-66);
	}

	.reply-text {
		font-size: 12px;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.reply-clear {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
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
		gap: 2px;
		padding: 4px;
		min-height: 47px;
		box-sizing: border-box;
	}

	.composer-field {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		padding: 0 4px;
	}

	.composer-input {
		width: 100%;
		margin: 0;
		padding: 10px 4px;
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

	.composer-input::placeholder {
		color: var(--fg-33);
	}

	.side-btn {
		flex-shrink: 0;
		width: 39px;
		height: 39px;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
	}

	.side-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.side-btn.send {
		background: var(--button-primary-bg, var(--fg-8));
		color: var(--button-primary-fg, var(--fg));
	}

	@media (max-width: 767px) {
		.mail-panel-to,
		.mail-panel-when,
		.mail-panel-body {
			padding-left: 0;
		}

		.composer-fade {
			background: linear-gradient(
				to top,
				var(--shell, var(--bg)) 0%,
				color-mix(in srgb, var(--shell, var(--bg)) 80%, transparent)
					calc(28px + env(safe-area-inset-bottom, 0px) * 0.5),
				transparent 100%
			);
		}
	}
</style>
