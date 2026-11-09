<script>
	/**
	 * Missive-style mail thread: mail panels + private chat bubbles + status lines
	 * in one chronological feed, with a full bottom chat composer (no FAB).
	 */
	import AlphaLogo from './icons/AlphaLogo.svelte';
	import MoreDots from './icons/MoreDots.svelte';
	import Reply from './icons/Reply.svelte';
	import Voice from './icons/Voice.svelte';
	import ChatFeedCard from './ChatFeedCard.svelte';
	import ChatStatusLine from './ChatStatusLine.svelte';
	import ComposerSuggest from './ComposerSuggest.svelte';
	import MailRichBody from './MailRichBody.svelte';
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
	import { profileAccentCss, profileNameCss } from '$lib/color.js';
	import {
		attachFeedPinResize,
		isFeedNearBottom,
		snapFeedToBottomSoon
	} from '$lib/feed-scroll.js';
	import { resolveExpandedQuote, splitMailQuote } from '$lib/mail-body.js';
	import { t } from '$lib/i18n.svelte.js';
	import {
		formatMailWhen,
		mailAuthorLabel,
		rememberMailTip,
		threadMessages
	} from '$lib/mail.svelte.js';
	import { mailView } from '$lib/mail-view.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
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
	/** @type {HTMLDivElement | undefined} */
	let feedBodyEl = $state();
	let fadeTop = $state(false);
	let fadeBottom = $state(false);
	let fieldTall = $state(false);
	let pinBottom = $state(true);
	let lastCommentLen = $state(-1);
	let snapLock = 0;
	/** Prevents remount/tip refresh from re-forcing scroll on the same thread. */
	let loadedThreadId = '';
	/** @type {Record<string, boolean>} */
	let quoteOpen = $state({});
	const COMPOSER_FADE_THRESHOLD = 4;
	const COMPOSER_MAX_H = 140;
	const COMPOSER_TALL_PX = 28;

	const canSend = $derived(Boolean(draft.trim()));

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	const replyPreview = $derived.by(() => {
		if (!replyMsg) return null;
		const email = String(replyMsg.author || '');
		const person = asPerson(email);
		const name = person?.name || displayNameFromEmail(email);
		const plain = String(replyMsg.body || '')
			.replace(/\s+/g, ' ')
			.trim();
		const text = plain.length > 72 ? `${plain.slice(0, 72).trim()}…` : plain || t('mail.message');
		return {
			name,
			text,
			accent: profileAccentCss(email, name),
			nameColor: profileNameCss(email, name, isDark)
		};
	});

	const chromeExpanded = $derived(Boolean(replyPreview));

	$effect(() => {
		const scroller = feedEl;
		const body = feedBodyEl;
		if (!scroller || !body) return;
		return attachFeedPinResize(scroller, body, () => pinBottom, () => snapLock > 0);
	});

	$effect(() => {
		const id = threadId;
		if (!id) return;
		rememberMailTip(mailMsg);
		/* Same thread: tip/hydrate updates must NOT reset pin or force-scroll. */
		if (id === loadedThreadId) return;
		loadedThreadId = id;
		quoteOpen = {};
		lastCommentLen = -1;
		pinBottom = true;
		void (async () => {
			try {
				await loadComments('mail', id);
			} catch {
				/* ignore */
			}
			if (loadedThreadId !== id) return;
			lastCommentLen = (commentsByKey[`mail:${id}`] ?? []).length;
			await goBottom(true);
		})();
	});

	$effect(() => {
		const len = comments.length;
		if (lastCommentLen < 0) return;
		if (len === lastCommentLen) return;
		const grew = len > lastCommentLen;
		lastCommentLen = len;
		if (grew && pinBottom) void goBottom(false, true);
	});

	/** @param {string} email */
	function emailDomain(email) {
		const at = String(email || '').indexOf('@');
		if (at < 0) return '';
		return String(email).slice(at);
	}

	function measureFeedScroll() {
		if (snapLock > 0) return;
		const el = feedEl;
		if (!el) return;
		pinBottom = isFeedNearBottom(el);
	}

	/**
	 * @param {boolean} [force]
	 * @param {boolean} [smooth] animated follow; instant for open/send
	 */
	async function goBottom(force = false, smooth = false) {
		if (force) pinBottom = true;
		if (!force && !pinBottom) return;
		snapLock++;
		pinBottom = true;
		try {
			await snapFeedToBottomSoon(() => feedEl, { smooth });
		} finally {
			snapLock = Math.max(0, snapLock - 1);
			measureFeedScroll();
		}
	}

	/** @param {string} id */
	function toggleQuote(id) {
		quoteOpen = { ...quoteOpen, [id]: !quoteOpen[id] };
	}

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
					text: String(c.body || '').trim() || t('chat.updatedConversation'),
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
		const h = Math.min(el.scrollHeight, COMPOSER_MAX_H);
		el.style.height = `${h}px`;
		fieldTall = h > COMPOSER_TALL_PX || draft.includes('\n');
		updateInputFade();
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
			rememberMailTip(mailMsg);
			const subject = String(mailMsg?.subject || '').trim() || '(no subject)';
			const from = String(mailMsg?.from || '')
				.trim()
				.toLowerCase();
			await postChatMessage({
				body,
				kind: 'comment',
				ref: {
					type: 'mail',
					id: threadId,
					title: subject,
					subject,
					from,
					from_name: mailAuthorLabel(mailMsg) || ''
				},
				reply_to: parent?.id ?? null
			});
			pinBottom = true;
			queueMicrotask(() => {
				void goBottom(true);
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
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="feed mail-feed" bind:this={feedEl} onscroll={measureFeedScroll}>
		<div class="feed-body" bind:this={feedBodyEl}>
		{#each timeline as item (item.id)}
			{#if item.type === 'status'}
				<div class="status-row">
					<ChatStatusLine text={item.text || ''} email={item.email || ''} name={item.name || ''} />
				</div>
			{:else if item.type === 'chat' && item.msg}
				<div class="chat-row">
					<ChatFeedCard
						msg={item.msg}
						when={formatMailWhen(item.msg.created_at)}
						onReply={() => startReply(item.msg)}
						threaded
					/>
				</div>
			{:else if item.type === 'mail' && item.mail}
				{@const m = item.mail}
				{@const fromEmail = String(m.from || '').toLowerCase()}
				{@const fromName = mailAuthorLabel(m) || displayNameFromEmail(m.from)}
				{@const domain = emailDomain(fromEmail)}
				{@const toLine = (m.to || []).map(displayNameFromEmail).filter(Boolean).join(', ')}
				{@const parts = splitMailQuote(m.body || '')}
				{@const quoteId = String(m.id || '')}
				{@const mailKey = quoteId || item.id}
				<article class="mail-panel" class:draft={isDraft(m)}>
					<header class="mail-panel-head">
						<ProfilePic
							name={fromName}
							email={fromEmail}
							pictureUrl={pictureUrlFor(fromEmail)}
							size={36}
						/>
						<div class="mail-panel-meta">
							<div class="mail-panel-row1">
								<span class="mail-panel-who-line">
									<span class="mail-panel-name">{fromName}</span>
									{#if domain}
										<span class="mail-panel-domain">{domain}</span>
									{/if}
								</span>
								<button
									type="button"
									class="ghost-ico ghost-ico-reply"
									aria-label={t('mail.reply')}
									onclick={() =>
										openComposer('mail', undefined, undefined, {
											to: fromEmail === me ? m.to?.[0] || replyTo : fromEmail || replyTo
										})
									}
								>
									<Reply size={11} />
								</button>
							</div>
							<div class="mail-panel-row2">
								<p class="mail-panel-to">
									<span class="to-label">{t('mail.to')}:</span>
									{toLine || '—'}
								</p>
							</div>
						</div>
						<div class="mail-panel-trail">
							<button
								type="button"
								class="ghost-ico ghost-ico-more"
								aria-label={t('common.more')}
								aria-expanded={menuOpen}
								onclick={onMore}
							>
								<MoreDots size={15} />
							</button>
							<span class="mail-panel-when">{formatMailWhen(m.created_at)}</span>
						</div>
					</header>
					<div class="mail-panel-rule" aria-hidden="true"></div>
					<div class="mail-panel-content">
						{#if parts.collapsible}
							{#if parts.main}
								<MailRichBody text={parts.main} />
							{/if}
							{#if parts.quoted}
								{#if quoteOpen[mailKey]}
									{@const expanded = resolveExpandedQuote(parts.quoted, mails, quoteId)}
									<MailRichBody text={expanded} />
									<button
										type="button"
										class="quote-toggle"
										aria-label={t('mail.hideQuote')}
										onclick={() => toggleQuote(mailKey)}
									>
										<span class="quote-dots" aria-hidden="true">
											<span></span><span></span><span></span>
										</span>
									</button>
								{:else}
									<button
										type="button"
										class="quote-toggle"
										aria-label={t('mail.showQuote')}
										onclick={() => toggleQuote(mailKey)}
									>
										<span class="quote-dots" aria-hidden="true">
											<span></span><span></span><span></span>
										</span>
									</button>
								{/if}
							{/if}
						{:else if parts.main}
							<MailRichBody text={parts.main} fallbackEmail={fromEmail} />
						{/if}
					</div>
				</article>
			{/if}
		{/each}
		</div>
	</div>

	{#if error}
		<p class="err">{error}</p>
	{/if}

	<div class="composer-fade" aria-hidden="true"></div>
	<div class="composer-dock">
		<div class="composer-stack">
			<ComposerSuggest {inputEl} value={draft} oninsert={onSuggestInsert} />
			<div class="composer-pill" class:chrome-expanded={chromeExpanded}>
				{#if replyPreview}
					<div class="composer-quote-wrap">
						<div class="composer-quote" role="group" aria-label={t('mail.replyingTo', { name: replyPreview.name })}>
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
								aria-label={t('mail.cancelReply')}
								onclick={clearReply}>×</button
							>
						</div>
					</div>
				{/if}
				<div class="composer-row">
					<button type="button" class="side-btn plus" aria-label={t('mail.attach')} disabled>
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
							placeholder={replyMsg ? t('mail.reply') : t('mail.message')}
							bind:value={draft}
							oninput={onInput}
							onscroll={updateInputFade}
							onkeydown={onKey}
							aria-label={t('mail.message')}
						></textarea>
					</div>
					{#if canSend}
						<button
							type="button"
							class="side-btn send"
							aria-label={t('mail.send')}
							disabled={chatUi.posting}
							onclick={() => void send()}
						>
							<AlphaLogo size={15} />
						</button>
					{:else}
						<button
							type="button"
							class="side-btn mic"
							aria-label={t('mail.voiceMessage')}
							disabled
							title={t('mail.voiceSoon')}
						>
							<Voice size={22} />
						</button>
					{/if}
				</div>
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
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		/* Block layout — flex children were stretching to fill and killing scroll */
		display: block;
		/* Same top/bottom clearance as ChatChannelPanel .messages — see feed-scroll.js */
		padding: 56px 0 calc(72px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
	}

	.feed-body {
		display: block;
		width: 100%;
	}

	.status-row,
	.chat-row {
		display: block;
		padding: 0 4px;
		margin: 0 0 10px;
	}

	.mail-panel {
		display: block;
		padding: 0;
		margin: 0 0 10px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--fg) 4.5%, transparent);
		border: 0;
		/* clip x for radius — never clip expanded quote height */
		overflow-x: clip;
		overflow-y: visible;
		flex: none;
		height: auto;
		max-height: none;
	}

	.mail-panel.draft {
		background: color-mix(in srgb, var(--fg) 3%, transparent);
		outline: 1px dashed color-mix(in srgb, var(--fg) 12%, transparent);
		outline-offset: -1px;
	}

	.mail-panel-head {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		padding: 12px 14px 10px;
		box-sizing: border-box;
	}

	.mail-panel-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		justify-content: center;
	}

	.mail-panel-row1,
	.mail-panel-row2 {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		min-height: 0;
	}

	.mail-panel-who-line {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		overflow: hidden;
	}

	.mail-panel-name {
		font-size: 14px;
		font-weight: 650;
		line-height: 1.2;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mail-panel-domain {
		flex-shrink: 1;
		min-width: 0;
		font-size: 12px;
		font-weight: 450;
		line-height: 1.2;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-top: 1px;
	}

	/* ⋯ above timestamp — same right edge */
	.mail-panel-trail {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		gap: 3px;
		min-width: 0;
	}

	.ghost-ico {
		width: 18px;
		height: 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
		line-height: 0;
		flex-shrink: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.ghost-ico-reply :global(.icon),
	.ghost-ico-reply :global(svg) {
		display: block;
		width: 11px;
		height: 11px;
	}

	.ghost-ico-more :global(svg) {
		display: block;
		width: 15px;
		height: 15px;
	}

	.ghost-ico:hover {
		color: var(--fg);
	}

	.mail-panel-to {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		font-size: 12px;
		font-weight: 450;
		color: var(--fg-33);
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		box-sizing: border-box;
	}

	.to-label {
		font-weight: 550;
		color: var(--fg-33);
	}

	.mail-panel-when {
		margin: 0;
		padding: 0;
		font-size: 11px;
		font-weight: 500;
		line-height: 1.25;
		color: var(--fg-33);
		white-space: nowrap;
		text-align: right;
	}

	/* Full panel width — padding lives in head/content, not around the rule */
	.mail-panel-rule {
		height: 1px;
		margin: 0;
		width: 100%;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.mail-panel-content {
		padding: 12px 14px 14px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
		max-height: none;
		overflow: visible;
	}

	.quote-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 22px;
		padding: 0 10px;
		margin: 0;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		color: var(--fg-33);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.quote-toggle:hover {
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		color: var(--fg-66);
	}

	.quote-dots {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		line-height: 0;
	}

	.quote-dots span {
		width: 3px;
		height: 3px;
		border-radius: 999px;
		background: currentColor;
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
		/* Body already insets 24/14px — match ChatChannelPanel optical pad */
		padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		pointer-events: none;
		background: transparent;
		overflow: visible;
	}

	.composer-dock > * {
		pointer-events: auto;
	}

	.composer-stack {
		position: relative;
		width: 100%;
		z-index: 5;
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

	.composer-pill.chrome-expanded {
		border-radius: 16px 16px 23.5px 23.5px;
	}

	.composer-quote-wrap {
		padding: 8px 8px 0;
		box-sizing: border-box;
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
	}

	.composer-pill.chrome-expanded .composer-row {
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

	.side-btn.plus:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.side-btn.mic {
		background: transparent;
		color: var(--fg-33);
	}

	.side-btn.mic:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.side-btn.send {
		background: var(--gradient-accent-1);
		color: #fff;
	}

	.side-btn.send:disabled {
		opacity: 0.7;
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

	@media (max-width: 767px) {
		.mail-feed {
			padding: calc(56px + env(safe-area-inset-top, 0px)) 0
				calc(72px + env(safe-area-inset-bottom, 0px));
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
