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
					from: m.from,
					from_name: m.from_name,
					to: m.to,
					subject: m.subject,
					body: m.body,
					created_at: m.created_at
				},
				mode
			)
		);
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
				{@const useReplyAll = preferReplyAll(m, me)}
				{@const menuFor = replyMenuId === quoteId}
				{@const hasQuote = Boolean(parts.collapsible && parts.quoted)}
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
								class="mail-more"
								aria-label={t('common.more')}
								aria-expanded={menuOpen}
								onclick={onMore}
							>
								<MoreDots size={12} />
							</button>
							<span class="mail-panel-when">{formatMailWhen(m.created_at)}</span>
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
						<div class="mail-panel-actions">
							{#if hasQuote}
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
							{/if}
							<div class="mail-reply-pill" role="group" aria-label={t('mail.reply')}>
								<button
									type="button"
									class="corner-btn corner-main"
									aria-label={useReplyAll ? t('mail.replyAll') : t('mail.reply')}
									onclick={() => composeAction(m, useReplyAll ? 'replyAll' : 'reply')}
								>
									{#if useReplyAll}
										<ReplyAll size={13} />
									{:else}
										<Reply size={13} />
									{/if}
								</button>
								<span class="corner-divider" aria-hidden="true"></span>
								<button
									type="button"
									class="corner-btn corner-chev"
									aria-label={t('common.more')}
									aria-expanded={menuFor}
									aria-haspopup="menu"
									onclick={() => toggleReplyMenu(quoteId)}
								>
									<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
										<path
											d="M3 4.5 6 7.5 9 4.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
								{#if menuFor}
									<button
										type="button"
										class="corner-scrim"
										aria-label={t('common.close')}
										onclick={() => (replyMenuId = '')}
									></button>
									<div class="corner-menu" role="menu">
										<button
											type="button"
											role="menuitem"
											onclick={() => composeAction(m, 'reply')}
										>
											<Reply size={14} />
											<span>{t('mail.reply')}</span>
										</button>
										<button
											type="button"
											role="menuitem"
											onclick={() => composeAction(m, 'replyAll')}
										>
											<ReplyAll size={14} />
											<span>{t('mail.replyAll')}</span>
										</button>
										<button
											type="button"
											role="menuitem"
											onclick={() => composeAction(m, 'forward')}
										>
											<Forward size={14} />
											<span>{t('mail.forward')}</span>
										</button>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</article>
			{/each}
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
		margin: 0 0 18px;
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

	.mail-panel-trail {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		gap: 4px;
		min-width: 0;
		align-self: flex-start;
	}

	/* Half the pfp hit target; glyph ~⅓ smaller than before */
	.mail-more {
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 9999px;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
		line-height: 0;
		flex-shrink: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.mail-more:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	/* Reply + actions — same quiet fill as view-more (no glass) */
	.mail-reply-pill {
		position: relative;
		z-index: 2;
		display: inline-flex;
		align-items: stretch;
		height: 26px;
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
		width: 30px;
		border-radius: 9999px 0 0 9999px;
	}

	.corner-chev {
		width: 24px;
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
		bottom: calc(100% + 6px);
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

	.mail-panel-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 28px;
		margin-top: 2px;
	}

	.mail-panel-actions .mail-reply-pill {
		margin-left: auto;
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
		height: 28px;
		padding: 0 12px;
		margin: 0;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		color: var(--fg-33);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		flex-shrink: 0;
	}

	.quote-toggle:hover {
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		color: var(--fg-66);
	}

	.quote-dots {
		display: inline-flex;
		align-items: center;
		gap: 3.5px;
		line-height: 0;
	}

	.quote-dots span {
		width: 3.5px;
		height: 3.5px;
		border-radius: 999px;
		background: currentColor;
	}
</style>
