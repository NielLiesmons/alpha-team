<script>
	/**
	 * Mail thread panels only — private chat lives in CommentThread (FAB panel),
	 * same pattern as Tasks / Notes / Projects.
	 */
	import ArrowRight from './icons/ArrowRight.svelte';
	import MoreDots from './icons/MoreDots.svelte';
	import Reply from './icons/Reply.svelte';
	import ReplyAll from './icons/ReplyAll.svelte';
	import DropdownMenu from './DropdownMenu.svelte';
	import MailRichBody from './MailRichBody.svelte';
	import DetailMetaPills from './DetailMetaPills.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { loadComments } from '$lib/chat.svelte.js';
	import { isHtmlMailBody, resolveExpandedQuote, safeMailHtml, splitMailQuote } from '$lib/mail-body.js';
	import { t } from '$lib/i18n.svelte.js';
	import {
		formatMailWhen,
		mailAuthorLabel,
		mailComposeSeed,
		mailLatestMessage,
		mailPriorityFor,
		mailPreview,
		mailTipCache,
		preferReplyAll,
		rememberMailTip,
		threadMessages
	} from '$lib/mail.svelte.js';
	import { mailView } from '$lib/mail-view.svelte.js';
	import { swipeLeftReply } from '$lib/swipe-left-reply.js';
	import { openComposer, taskByMailThreadId } from '$lib/workspace.svelte.js';

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
	const firstMail = $derived(mails[0] || mailMsg);
	const threadTitle = $derived(
		String(firstMail?.subject || mailMsg?.subject || '').trim() || t('common.noSubject')
	);
	const linkedTask = $derived(taskByMailThreadId(threadId));
	const lastMail = $derived(mails[mails.length - 1] || mailMsg);
	/* Touch tip cache so mail-only priority updates re-render the title chrome. */
	const mailOnlyPriority = $derived.by(() => {
		mailTipCache;
		return mailPriorityFor(threadId, mailMsg);
	});
	const mailPromoteSeed = $derived.by(() => {
		if (!threadId) return null;
		const latest = mailLatestMessage(mailMsg) || mailMsg;
		const body = String(mailPreview(latest) || '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 2000);
		return {
			id: threadId,
			subject: threadTitle === t('common.noSubject') ? '' : threadTitle,
			body,
			flagged: Boolean(mailMsg?._flagged),
			_priority: mailOnlyPriority
		};
	});
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
	/** @type {HTMLElement | null} */
	let replyMenuAnchor = $state(null);
	const menuMail = $derived(mails.find((m) => String(m?.id || '') === replyMenuId) || null);

	$effect(() => {
		const id = threadId;
		if (!id) return;
		rememberMailTip(mailMsg);
		/* Prefetch comments for the FAB panel; keep mail feed independent. */
		void loadComments('mail', id).catch(() => {});
		if (id === loadedThreadId) return;
		loadedThreadId = id;
		quoteOpen = {};
		replyMenuId = '';
		replyMenuAnchor = null;
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
		closeReplyMenu();
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

	/**
	 * @param {string} id
	 * @param {HTMLElement | null} anchor
	 */
	function toggleReplyMenu(id, anchor) {
		if (replyMenuId === id) {
			replyMenuId = '';
			replyMenuAnchor = null;
			return;
		}
		replyMenuId = id;
		replyMenuAnchor = anchor;
	}

	function closeReplyMenu() {
		replyMenuId = '';
		replyMenuAnchor = null;
	}
</script>

<div class="mail-thread-shell">
	<div class="feed mail-feed" bind:this={feedEl}>
		<div class="feed-body">
			<div class="mail-thread-title-row">
				<span class="title-status">
					{#if linkedTask}
						<TaskFieldPicker
							taskId={linkedTask.id}
							field="status"
							value={linkedTask.status || 'open'}
							size={24}
						/>
					{:else if mailPromoteSeed}
						<TaskFieldPicker
							field="status"
							value="open"
							size={24}
							mailThread={mailPromoteSeed}
						/>
					{/if}
				</span>
				<h1 class="mail-thread-title">{threadTitle}</h1>
				<span class="title-priority">
					{#if linkedTask}
						<TaskFieldPicker
							taskId={linkedTask.id}
							field="priority"
							value={linkedTask.priority || 'none'}
							size={26}
							align="right"
						/>
					{:else if mailPromoteSeed}
						<TaskFieldPicker
							field="priority"
							value={mailOnlyPriority}
							size={26}
							align="right"
							mailThread={mailPromoteSeed}
						/>
					{/if}
				</span>
			</div>
			{#if linkedTask}
				<DetailMetaPills entity={linkedTask} kind="task" />
			{/if}
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
				<article
					class="mail-panel"
					class:draft={isDraft(m)}
					class:pending={m._pending}
					use:swipeLeftReply={{
						onReply: () => composeAction(m, msgReplyAll ? 'replyAll' : 'reply')
					}}
				>
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
						<div class="mail-panel-trail" data-no-swipe-reply>
							<button
								type="button"
								class="mail-panel-trail-hit"
								aria-label={t('common.more')}
								aria-expanded={menuFor}
								aria-haspopup="menu"
								onclick={(e) => toggleReplyMenu(quoteId, e.currentTarget)}
							>
								<span class="mail-more-icon" aria-hidden="true">
									<MoreDots size={14} />
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
							</button>
						</div>
					</header>
					<div class="mail-panel-rule" aria-hidden="true"></div>
					<div class="mail-panel-content">
						{#if rich}
							<div class="mail-prose">{@html safeMailHtml(m.body || '')}</div>
						{:else if parts.collapsible}
							{#if parts.htmlMain}
								<div class="mail-prose">{@html safeMailHtml(parts.htmlMain)}</div>
							{:else if parts.main}
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
						<ReplyAll size={15} strokeWidth={1.05} />
					{:else}
						<Reply size={15} strokeWidth={1.05} />
					{/if}
				</span>
				<span class="reply-field-label">{t('mail.replyPrompt', { name: replyName || '…' })}</span>
			</button>
		</div>
	</div>
	<!-- Top fade: DetailColumn .detail-top::after / ChromeMobileBar (scroll-driven --chrome-scroll-fade) -->
	<div class="mail-bottom-fade" aria-hidden="true"></div>
</div>

<DropdownMenu
	open={Boolean(menuMail)}
	anchor={replyMenuAnchor}
	placement="below"
	align="end"
	width={188}
	onclose={closeReplyMenu}
>
	{#if menuMail}
		{@const m = menuMail}
		<div class="dropdown-list" role="menu">
			<button type="button" class="dropdown-item" role="menuitem" onclick={() => composeAction(m, 'reply')}>
				<Reply size={14} />
				<span>{t('mail.reply')}</span>
			</button>
			<button
				type="button"
				class="dropdown-item"
				role="menuitem"
				onclick={() => composeAction(m, 'replyAll')}
			>
				<ReplyAll size={14} />
				<span>{t('mail.replyAll')}</span>
			</button>
			<button
				type="button"
				class="dropdown-item"
				role="menuitem"
				onclick={() => composeAction(m, 'forward')}
			>
				<ArrowRight size={14} strokeWidth={1.45} />
				<span>{t('mail.forward')}</span>
			</button>
		</div>
	{/if}
</DropdownMenu>

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
		/* Clear detail-top control row; FAB clearance from .detail.has-comments-fab */
		padding: 56px 24px
			max(
				calc(28px + env(safe-area-inset-bottom, 0px)),
				var(--comments-fab-clearance, 0px)
			);
		box-sizing: border-box;
	}

	.mail-bottom-fade {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 2;
		height: max(
			calc(72px + env(safe-area-inset-bottom, 0px)),
			var(--comments-fab-clearance, 0px)
		);
		pointer-events: none;
		background: linear-gradient(
			to top,
			var(--bg) 0%,
			color-mix(in srgb, var(--bg) 80%, transparent)
				calc(24px + env(safe-area-inset-bottom, 0px) * 0.5),
			transparent 100%
		);
	}

	@media (max-width: 767px) {
		.mail-feed {
			/* Match chat channel: clear ChromeMobileBar (88px + safe) */
			padding: calc(88px + env(safe-area-inset-top, 0px)) 14px
				max(
					calc(28px + env(safe-area-inset-bottom, 0px)),
					var(--comments-fab-clearance, 0px)
				);
		}

		.mail-thread-title-row {
			/* Match DetailColumn .title-row mobile top pad */
			padding-top: 10px;
		}

		.mail-bottom-fade {
			background: linear-gradient(
				to top,
				var(--shell, var(--bg)) 0%,
				color-mix(in srgb, var(--shell, var(--bg)) 80%, transparent)
					calc(24px + env(safe-area-inset-bottom, 0px) * 0.5),
				transparent 100%
			);
		}
	}

	.feed-body {
		display: block;
		width: 100%;
	}

	.mail-thread-title-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		/* Match DetailColumn .title-row desktop top pad (4px) */
		margin: 0;
		padding: 4px 2px 10px;
		min-width: 0;
	}

	.title-status,
	.title-priority {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 0;
		/* Optical center with first title line (28px / 1.15) */
		padding-top: 4px;
	}

	.mail-thread-title {
		flex: 1 1 auto;
		min-width: 0;
		max-width: 100%;
		margin: 0;
		padding: 0;
		font-size: 28px;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.15;
		color: var(--fg);
		overflow-wrap: anywhere;
		word-break: break-word;
		white-space: normal;
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
		touch-action: pan-y;
	}

	.mail-panel.swipe-replying {
		z-index: 3;
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
		align-items: stretch;
		gap: 10px;
		min-width: 0;
		/* 1px less vertical pad offsets the +2px name→To gap so head height stays put */
		/* Right inset keeps ⋯ + timestamp as a pair, slightly off the edge */
		padding: 11px 8px 9px 14px;
		box-sizing: border-box;
	}

	.mail-panel-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		justify-content: center;
		padding-right: 4px;
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
		position: relative;
		z-index: 2;
		flex-shrink: 0;
		display: flex;
		align-items: stretch;
		align-self: stretch;
		min-width: 0;
	}

	.mail-panel-trail-hit {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: space-between;
		gap: 6px;
		min-width: 44px;
		margin: 0;
		padding: 0 0 0 10px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
		line-height: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.mail-panel-trail-hit:hover,
	.mail-panel-trail-hit[aria-expanded='true'] {
		background: transparent;
		color: var(--fg-33);
	}

	.mail-more-icon {
		display: grid;
		place-items: center;
		margin: 0;
		padding: 0;
		line-height: 0;
		color: inherit;
	}

	.mail-panel-when,
	.mail-panel-status {
		margin: 0;
		/* +2px vs dots optical edge (⋯ glyph sits inside its box) */
		padding: 0 4px 0 0;
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
		color: var(--accent-2, var(--fg-33));
	}

	.mail-panel-status.err {
		color: var(--accent-3, var(--fg-66));
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--accent-2, var(--fg-33));
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

	.mail-prose :global(li) {
		margin: 0.2em 0;
	}

	.mail-prose :global(strong),
	.mail-prose :global(b) {
		font-weight: 600;
		color: var(--fg);
	}

	.mail-prose :global(em),
	.mail-prose :global(i) {
		font-style: italic;
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
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.mail-prose :global(a:hover) {
		color: var(--link-hover);
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
		color: var(--fg-33);
		flex-shrink: 0;
		opacity: 0.9;
	}

	.reply-field-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
