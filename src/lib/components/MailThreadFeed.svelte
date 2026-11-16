<script>
	/**
	 * Mail thread panels only — private chat lives in CommentThread (FAB panel),
	 * same pattern as Tasks / Notes / Projects.
	 */
	import Forward from './icons/Forward.svelte';
	import MoreDots from './icons/MoreDots.svelte';
	import Reply from './icons/Reply.svelte';
	import ReplyAll from './icons/ReplyAll.svelte';
	import MailRichBody from './MailRichBody.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { loadComments } from '$lib/chat.svelte.js';
	import { isHtmlMailBody, resolveExpandedQuote, safeMailHtml, splitMailQuote } from '$lib/mail-body.js';
	import { t } from '$lib/i18n.svelte.js';
	import {
		formatMailWhen,
		mailAuthorLabel,
		mailComposeSeed,
		preferReplyAll,
		rememberMailTip,
		threadMessages
	} from '$lib/mail.svelte.js';
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
	const lastMail = $derived(mails[mails.length - 1] || mailMsg);
	const useReplyAll = $derived(preferReplyAll(lastMail, me));
	const replyName = $derived(
		mailAuthorLabel(lastMail) || displayNameFromEmail(lastMail?.from || replyTo || '')
	);

	/** @type {HTMLDivElement | undefined} */
	let feedEl = $state();
	/** Prevents remount/tip refresh from re-forcing scroll on the same thread. */
	let loadedThreadId = '';
	/** @type {Record<string, boolean>} */
	let quoteOpen = $state({});
	/** Which message’s reply/forward menu is open. */
	let replyMenuId = $state('');

	$effect(() => {
		const id = threadId;
		if (!id) return;
		rememberMailTip(mailMsg);
		/* Prefetch comments for the FAB panel; keep mail feed independent. */
		void loadComments('mail', id).catch(() => {});
		if (id === loadedThreadId) return;
		loadedThreadId = id;
		quoteOpen = {};
		queueMicrotask(() => {
			const el = feedEl;
			if (el) el.scrollTop = 0;
		});
	});

	/** @param {string} email */
	function emailDomain(email) {
		const at = String(email || '').indexOf('@');
		if (at < 0) return '';
		return String(email).slice(at);
	}

	/**
	 * Prefer previous message author for the expanded quote rail color.
	 * @param {any[]} list
	 * @param {string} mailId
	 * @param {string} fallback
	 */
	function quoteAuthorEmail(list, mailId, fallback) {
		const idx = list.findIndex((m) => String(m?.id || '') === String(mailId || ''));
		const prev = idx > 0 ? list[idx - 1] : null;
		return String(prev?.from || fallback || '')
			.trim()
			.toLowerCase();
	}

	/** @param {string} id */
	function toggleQuote(id) {
		quoteOpen = { ...quoteOpen, [id]: !quoteOpen[id] };
	}

	/** @param {any} m */
	function isDraft(m) {
		return Boolean(m?.draft || m?.keywords?.$draft || mailView.folder === 'drafts');
	}

	/**
	 * @param {any} m
	 * @param {'reply' | 'replyAll' | 'forward'} mode
	 */
	function composeAction(m, mode) {
		replyMenuId = '';
		openComposer(
			'mail',
			`act:${mode}:${m.id}`,
			undefined,
			mailComposeSeed(
				{
					id: m.id,
					threadId: m.threadId || mailMsg?.threadId || mailMsg?.id,
					from: m.from,
					from_name: m.from_name,
					to: m.to,
					subject: m.subject,
					body: m.body,
					created_at: m.created_at,
					_jmap: m._jmap,
					messageId: m.messageId
				},
				mode
			)
		);
	}

	function composeThreadReply() {
		composeAction(lastMail, useReplyAll ? 'replyAll' : 'reply');
	}

	/** @param {string} id */
	function toggleReplyMenu(id) {
		replyMenuId = replyMenuId === id ? '' : id;
	}
</script>

<div class="mail-thread-shell">
	<div class="feed mail-feed" bind:this={feedEl}>
		<div class="feed-body">
			{#each mails as m (m.id)}
				{@const fromEmail = String(m.from || '').toLowerCase()}
				{@const fromName = mailAuthorLabel(m) || displayNameFromEmail(m.from)}
				{@const domain = emailDomain(fromEmail)}
				{@const toLine = (m.to || []).map(displayNameFromEmail).filter(Boolean).join(', ')}
				{@const parts = splitMailQuote(m.body || '')}
				{@const rich = isHtmlMailBody(m.body) && !parts.collapsible}
				{@const quoteId = String(m.id || '')}
				{@const mailKey = quoteId}
				{@const msgReplyAll = preferReplyAll(m, me)}
				{@const menuFor = replyMenuId === quoteId}
				{@const hasQuote = Boolean(parts.collapsible && parts.quoted)}
				<article class="mail-panel" class:draft={isDraft(m)} class:pending={m._pending}>
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
								{#if m._pending}
									<span class="mail-panel-status" aria-label={t('mail.sending')}>
										<span class="status-dot" aria-hidden="true"></span>
										{t('mail.sending')}
									</span>
								{:else if m._sendError}
									<span class="mail-panel-status err" title={m._sendError}>{t('mail.sendFailed')}</span>
								{:else}
									<span class="mail-panel-when">{formatMailWhen(m.created_at)}</span>
								{/if}
							</div>
							<div class="mail-panel-row2">
								<p class="mail-panel-to">
									<span class="to-label">{t('mail.to')}:</span>
									{toLine || '—'}
								</p>
							</div>
						</div>
						<div class="mail-reply-pill" role="group" aria-label={t('mail.reply')}>
							<button
								type="button"
								class="corner-btn corner-main"
								aria-label={msgReplyAll ? t('mail.replyAll') : t('mail.reply')}
								onclick={() => composeAction(m, msgReplyAll ? 'replyAll' : 'reply')}
							>
								{#if msgReplyAll}
									<ReplyAll size={14} />
								{:else}
									<Reply size={14} />
								{/if}
							</button>
							<span class="corner-divider" aria-hidden="true"></span>
							<button
								type="button"
								class="corner-btn corner-more"
								aria-label={t('common.more')}
								aria-expanded={menuFor}
								aria-haspopup="menu"
								onclick={() => toggleReplyMenu(quoteId)}
							>
								<MoreDots size={14} />
							</button>
							{#if menuFor}
								<button
									type="button"
									class="corner-scrim"
									aria-label={t('common.close')}
									onclick={() => (replyMenuId = '')}
								></button>
								<div class="corner-menu" role="menu">
									<button type="button" role="menuitem" onclick={() => composeAction(m, 'reply')}>
										<Reply size={14} />
										<span>{t('mail.reply')}</span>
									</button>
									<button type="button" role="menuitem" onclick={() => composeAction(m, 'replyAll')}>
										<ReplyAll size={14} />
										<span>{t('mail.replyAll')}</span>
									</button>
									<button type="button" role="menuitem" onclick={() => composeAction(m, 'forward')}>
										<Forward size={14} />
										<span>{t('mail.forward')}</span>
									</button>
									<button
										type="button"
										role="menuitem"
										onclick={() => {
											replyMenuId = '';
											onMore();
										}}
									>
										<MoreDots size={14} />
										<span>{t('common.more')}</span>
									</button>
								</div>
							{/if}
						</div>
					</header>
					<div class="mail-panel-rule" aria-hidden="true"></div>
					<div class="mail-panel-content">
						{#if rich}
							<div class="mail-prose">{@html safeMailHtml(m.body || '')}</div>
						{:else if parts.collapsible}
							{#if parts.main}
								<MailRichBody text={parts.main} fallbackEmail={fromEmail} />
							{/if}
							{#if hasQuote && quoteOpen[mailKey]}
								{@const expanded = resolveExpandedQuote(parts.quoted, mails, quoteId)}
								{@const quoteFrom = quoteAuthorEmail(mails, quoteId, fromEmail)}
								<MailRichBody text={expanded} fallbackEmail={quoteFrom} minDepth={1} />
							{/if}
						{:else if parts.main}
							<MailRichBody text={parts.main} fallbackEmail={fromEmail} />
						{/if}
						{#if hasQuote}
							<div class="mail-panel-actions">
								<button
									type="button"
									class="quote-toggle"
									aria-label={quoteOpen[mailKey] ? t('mail.hideQuote') : t('mail.showQuote')}
									aria-expanded={Boolean(quoteOpen[mailKey])}
									onclick={() => toggleQuote(mailKey)}
								>
									<span class="quote-dots" aria-hidden="true">
										<span></span><span></span><span></span>
									</span>
								</button>
							</div>
						{/if}
					</div>
				</article>
			{/each}

			<button type="button" class="mail-reply-field" onclick={composeThreadReply}>
				<span class="reply-field-icon" aria-hidden="true">
					{#if useReplyAll}
						<ReplyAll size={15} />
					{:else}
						<Reply size={15} />
					{/if}
				</span>
				<span class="reply-field-label">{t('mail.replyPrompt', { name: replyName || '…' })}</span>
			</button>
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
		display: block;
		/* Horizontal pad lives on .mail-thread-body / panel — not here */
		padding: 56px 0 96px;
		box-sizing: border-box;
	}

	.feed-body {
		display: block;
		width: 100%;
	}

	.mail-panel {
		position: relative;
		display: block;
		padding: 0;
		margin: 0 0 12px;
		border-radius: 14px;
		background: var(--mail-panel-bg, color-mix(in srgb, var(--fg) 4.5%, transparent));
		border: 0;
		overflow: visible;
		flex: none;
		height: auto;
		max-height: none;
	}

	.mail-panel.draft {
		background: color-mix(in srgb, var(--fg) 3%, transparent);
		outline: 1px dashed color-mix(in srgb, var(--fg) 12%, transparent);
		outline-offset: -1px;
	}

	.mail-panel.pending {
		opacity: 0.92;
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

	.mail-panel-when,
	.mail-panel-status {
		margin: 0;
		padding: 0 0 0 8px;
		font-size: 11px;
		font-weight: 500;
		line-height: 1.25;
		color: var(--fg-33);
		white-space: nowrap;
		text-align: right;
		flex-shrink: 0;
	}

	.mail-panel-status {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.mail-panel-status.err {
		color: var(--fg-66);
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--fg-33);
		animation: mail-pending-pulse 1s ease-in-out infinite;
	}

	@keyframes mail-pending-pulse {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}

	/* Reply + ⋯ — same row / height as the 36px profile pic */
	.mail-reply-pill {
		position: relative;
		z-index: 2;
		display: inline-flex;
		align-items: stretch;
		align-self: center;
		height: 36px;
		padding: 0;
		box-sizing: border-box;
		border: 0;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		overflow: visible;
		flex-shrink: 0;
	}

	.corner-btn {
		display: grid;
		place-items: center;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
		line-height: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.corner-main {
		width: 36px;
		border-radius: 9999px 0 0 9999px;
	}

	.corner-more {
		width: 36px;
		border-radius: 0 9999px 9999px 0;
	}

	.corner-btn:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.corner-divider {
		width: 1px;
		align-self: stretch;
		margin: 4px 0;
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		flex-shrink: 0;
	}

	.corner-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.corner-menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 50;
		min-width: 168px;
		padding: 0;
		border: 1px solid var(--glass-border);
		border-radius: 12px;
		background: var(--glass);
		overflow: hidden;
		box-shadow: 0 8px 28px var(--shadow);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.corner-menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.corner-menu button:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.corner-menu button:hover {
		background: var(--fg-4);
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

	.mail-panel-rule {
		height: 1px;
		margin: 0;
		width: 100%;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.mail-panel-content {
		padding: 12px 14px 10px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
		max-height: none;
		overflow: visible;
	}

	.mail-panel-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 0;
		margin-top: 0;
	}

	.mail-prose {
		width: 100%;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		line-height: 1.55;
		color: var(--fg-83);
		overflow-wrap: anywhere;
	}

	.mail-prose :global(p) {
		margin: 0 0 0.65em;
	}

	.mail-prose :global(p:last-child) {
		margin-bottom: 0;
	}

	.mail-prose :global(h1),
	.mail-prose :global(h2),
	.mail-prose :global(h3) {
		margin: 0.85em 0 0.4em;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.25;
		color: var(--fg);
	}

	.mail-prose :global(h1) {
		font-size: 1.45rem;
	}

	.mail-prose :global(h2) {
		font-size: 1.2rem;
	}

	.mail-prose :global(h3) {
		font-size: 1.05rem;
	}

	.mail-prose :global(ul),
	.mail-prose :global(ol) {
		margin: 0 0 0.65em;
		padding-left: 1.25rem;
	}

	.mail-prose :global(blockquote) {
		margin: 0 0 0.65em;
		padding-left: 0.85rem;
		border-left: 2px solid var(--fg-16, var(--fg-8));
		color: var(--fg-66);
	}

	.mail-prose :global(pre) {
		margin: 0 0 0.65em;
		padding: 0.65rem 0.75rem;
		border-radius: 8px;
		background: var(--fg-8);
		overflow-x: auto;
	}

	.mail-prose :global(a) {
		color: var(--link);
	}

	.mail-prose :global(img) {
		display: block;
		max-width: 100%;
		border-radius: 12px;
		margin: 0.5em 0;
	}

	.quote-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 18px;
		padding: 0 8px;
		margin: 0;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		color: var(--fg-33);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		flex-shrink: 0;
	}

	.quote-toggle:hover {
		color: var(--fg-66);
	}

	.quote-dots {
		display: inline-flex;
		align-items: center;
		gap: 2.5px;
		line-height: 0;
	}

	.quote-dots span {
		width: 2.5px;
		height: 2.5px;
		border-radius: 999px;
		background: currentColor;
	}

	.mail-reply-field {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		margin: 4px 0 0;
		padding: 0 14px;
		border: 1px solid var(--fg-8);
		border-radius: 14px;
		background: color-mix(in srgb, var(--fg) 2.5%, transparent);
		color: var(--fg-33);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
		-webkit-tap-highlight-color: transparent;
	}

	.mail-reply-field:hover {
		/* No hover wash — field chrome stays quiet */
		color: var(--fg-33);
		background: color-mix(in srgb, var(--fg) 2.5%, transparent);
	}

	.reply-field-icon {
		display: grid;
		place-items: center;
		line-height: 0;
		color: var(--fg-66);
		flex-shrink: 0;
	}

	.reply-field-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
