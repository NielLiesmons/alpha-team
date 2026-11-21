<script>
	/**
	 * Mail thread panels only — private chat lives in CommentThread (FAB panel),
	 * same pattern as Tasks / Notes / Projects.
	 */
	import DetailTitleRow from '@alpha/ui/DetailTitleRow.svelte';
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
		mailCcEmails,
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

	/** @param {string} name */
	function shortAttachName(name) {
		const n = String(name || 'attachment').trim() || 'attachment';
		if (n.length <= 22) return n;
		const dot = n.lastIndexOf('.');
		if (dot > 0 && n.length - dot <= 6) {
			const ext = n.slice(dot);
			const stem = n.slice(0, Math.max(1, 18 - ext.length));
			return `${stem}…${ext}`;
		}
		return `${n.slice(0, 19)}…`;
	}
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
	/** Which message’s To/Cc recipients popover is open. */
	let recipientsMenuId = $state('');
	/** @type {HTMLElement | null} */
	let recipientsMenuAnchor = $state(null);
	const recipientsMail = $derived(
		mails.find((m) => String(m?.id || '') === recipientsMenuId) || null
	);
	const recipientsTo = $derived(recipientsMail ? mailRecipientPeople(recipientsMail, 'to') : []);
	const recipientsCc = $derived(recipientsMail ? mailRecipientPeople(recipientsMail, 'cc') : []);

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
		recipientsMenuId = '';
		recipientsMenuAnchor = null;
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
	 * Resolve To/Cc people for the recipients popover (name + email).
	 * @param {any} m
	 * @param {'to' | 'cc'} field
	 * @returns {{ email: string, name: string }[]}
	 */
	function mailRecipientPeople(m, field) {
		/** @type {{ email: string, name: string }[]} */
		const out = [];
		const seen = new Set();
		/** @param {string} email @param {string} [name] */
		const push = (email, name = '') => {
			const e = String(email || '')
				.trim()
				.toLowerCase();
			if (!e || seen.has(e)) return;
			seen.add(e);
			const n = String(name || '').trim() || displayNameFromEmail(e);
			out.push({ email: e, name: n });
		};

		if (field === 'to') {
			const people = Array.isArray(m?.to_people) ? m.to_people : [];
			if (people.length) {
				for (const p of people) push(p?.email, p?.name);
				return out;
			}
			for (const e of m?.to || []) push(e);
			return out;
		}

		const ccPeople = Array.isArray(m?.cc_people) ? m.cc_people : [];
		if (ccPeople.length) {
			for (const p of ccPeople) push(p?.email, p?.name);
			return out;
		}
		const jmapCc = Array.isArray(m?._jmap?.cc) ? m._jmap.cc : [];
		if (jmapCc.length) {
			for (const a of jmapCc) push(a?.email, a?.name);
			return out;
		}
		for (const e of mailCcEmails(m)) push(e);
		return out;
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
		closeRecipientsMenu();
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
					cc: m.cc || mailCcEmails(m),
					cc_people: m.cc_people,
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
		closeRecipientsMenu();
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

	/**
	 * @param {string} id
	 * @param {HTMLElement | null} anchor
	 * @param {MouseEvent | PointerEvent} [e]
	 */
	function toggleRecipientsMenu(id, anchor, e) {
		e?.stopPropagation?.();
		e?.preventDefault?.();
		closeReplyMenu();
		if (recipientsMenuId === id) {
			recipientsMenuId = '';
			recipientsMenuAnchor = null;
			return;
		}
		recipientsMenuId = id;
		recipientsMenuAnchor = anchor;
	}

	function closeRecipientsMenu() {
		recipientsMenuId = '';
		recipientsMenuAnchor = null;
	}
</script>

<div class="mail-thread-shell">
	<div class="feed mail-feed" bind:this={feedEl}>
		<div class="feed-body">
			<DetailTitleRow>
				{#snippet leading()}
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
				{/snippet}
				<h1 class="detail-title">{threadTitle}</h1>
				{#snippet trailing()}
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
				{/snippet}
			</DetailTitleRow>
			{#if linkedTask}
				<DetailMetaPills entity={linkedTask} kind="task" />
			{/if}
			{#each mails as m (m.id)}
				{@const fromEmail = String(m.from || '').toLowerCase()}
				{@const fromName = mailAuthorLabel(m) || displayNameFromEmail(m.from)}
				{@const domain = emailDomain(fromEmail)}
				{@const toPeople = mailRecipientPeople(m, 'to')}
				{@const ccPeople = mailRecipientPeople(m, 'cc')}
				{@const toLine = toPeople.map((p) => p.name).filter(Boolean).join(', ')}
				{@const parts = splitMailQuote(m.body || '')}
				{@const rich = isHtmlMailBody(m.body) && !parts.collapsible}
				{@const quoteId = String(m.id || '')}
				{@const mailKey = quoteId}
				{@const msgReplyAll = preferReplyAll(m, me)}
				{@const menuFor = replyMenuId === quoteId}
				{@const recipientsOpen = recipientsMenuId === quoteId}
				{@const hasQuote = Boolean(parts.collapsible && parts.quoted)}
				{@const attachments = Array.isArray(m.attachments) ? m.attachments : []}
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
								{#if toPeople.length || ccPeople.length}
									<button
										type="button"
										class="mail-panel-to"
										class:open={recipientsOpen}
										data-no-swipe-reply
										aria-label={`${t('mail.to')}: ${toLine}${
											ccPeople.length
												? `, ${t('mail.ccCount', { count: ccPeople.length })}`
												: ''
										}`}
										aria-expanded={recipientsOpen}
										aria-haspopup="dialog"
										onclick={(e) => toggleRecipientsMenu(quoteId, e.currentTarget, e)}
									>
										<span class="to-label">{t('mail.to')}:</span>
										{toLine || '—'}
										{#if ccPeople.length}
											<span class="cc-count"
												>{t('mail.ccCount', { count: ccPeople.length })}</span
											>
										{/if}
									</button>
								{:else}
									<p class="mail-panel-to static">
										<span class="to-label">{t('mail.to')}:</span>
										—
									</p>
								{/if}
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
					{#if attachments.length}
						<div class="mail-panel-rule" aria-hidden="true"></div>
						<div class="mail-attach">
							{#each attachments as att, i (`${att.blobId || att.name}-${i}`)}
								<span class="attach-pill" title={att.name}>{shortAttachName(att.name)}</span>
							{/each}
						</div>
					{/if}
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

<DropdownMenu
	open={Boolean(recipientsMail)}
	anchor={recipientsMenuAnchor}
	placement="below"
	align="start"
	width={280}
	maxHeight={360}
	onclose={closeRecipientsMenu}
>
	{#if recipientsMail}
		<div class="recipients-popover" role="dialog" aria-label={t('mail.to')}>
			<section class="recipients-section">
				<p class="recipients-heading">{t('mail.to')}</p>
				<ul class="recipients-list">
					{#each recipientsTo as person (person.email)}
						<li class="recipient-row">
							<span class="recipient-name">{person.name}</span>
							{#if person.email && person.name.toLowerCase() !== person.email}
								<span class="recipient-email">{person.email}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
			{#if recipientsCc.length}
				<section class="recipients-section">
					<p class="recipients-heading">{t('mail.cc')}</p>
					<ul class="recipients-list">
						{#each recipientsCc as person (person.email)}
							<li class="recipient-row">
								<span class="recipient-name">{person.name}</span>
								{#if person.email && person.name.toLowerCase() !== person.email}
									<span class="recipient-email">{person.email}</span>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
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
		/* Match Notes/Tasks DetailColumn .body pad; FAB clearance from .detail.has-comments-fab */
		padding: var(--detail-scroll-pad-top, 56px) 24px
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
			/* Same as Notes/Tasks .body — not full ChromeMobileBar 88px (that overshoots) */
			padding: var(--detail-scroll-pad-top-mobile, calc(56px + env(safe-area-inset-top, 0px)))
				14px
				max(
					calc(28px + env(safe-area-inset-bottom, 0px)),
					var(--comments-fab-clearance, 0px)
				);
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
		border: 0;
		border-radius: 0;
		background: transparent;
		font: inherit;
		font-size: 12px;
		font-weight: 450;
		color: var(--fg-33);
		line-height: 1.25;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		box-sizing: border-box;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.mail-panel-to.static {
		cursor: default;
	}

	.mail-panel-to:not(.static):hover,
	.mail-panel-to.open {
		color: var(--fg-66);
	}

	.to-label {
		font-weight: 550;
		color: inherit;
	}

	.cc-count {
		margin-left: 0.35em;
		font-weight: 550;
		color: inherit;
		opacity: 0.9;
	}

	.cc-count::before {
		content: '·';
		margin-right: 0.35em;
		opacity: 0.7;
	}

	.recipients-popover {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 0;
		min-width: 0;
	}

	.recipients-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.recipients-heading {
		margin: 0;
		padding: 2px 14px 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--fg-33);
	}

	.recipients-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.recipient-row {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		padding: 8px 14px;
		box-sizing: border-box;
	}

	.recipient-row:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.recipient-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.recipient-email {
		font-size: 12px;
		font-weight: 450;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mail-panel-rule {
		height: 1px;
		margin: 0;
		width: 100%;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.mail-attach {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		width: 100%;
		min-width: 0;
		padding: 10px 14px 12px;
		box-sizing: border-box;
	}

	.attach-pill {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		padding: 3px 9px;
		border-radius: 999px;
		background: var(--fg-8);
		font-size: 11px;
		font-weight: 500;
		line-height: 1.3;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
