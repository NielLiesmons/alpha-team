<script>
	/**
	 * Mail thread panels only — private chat lives in CommentThread (FAB panel),
	 * same pattern as Tasks / Notes / Projects.
	 */
	import Forward from './icons/Forward.svelte';
	import MoreDots from './icons/MoreDots.svelte';
	import Reply from './icons/Reply.svelte';
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

	/** @param {string | undefined} subject */
	function replySubject(subject) {
		const s = String(subject || '').trim();
		if (!s) return 'Re:';
		return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
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
				{@const replyTarget =
					fromEmail === me ? m.to?.[0] || replyTo : fromEmail || replyTo}
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
								<MoreDots size={18} />
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
							{#if parts.quoted}
								{#if quoteOpen[mailKey]}
									{@const expanded = resolveExpandedQuote(parts.quoted, mails, quoteId)}
									{@const quoteFrom = quoteAuthorEmail(mails, quoteId, fromEmail)}
									<MailRichBody text={expanded} fallbackEmail={quoteFrom} minDepth={1} />
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
					<div class="mail-corner-pill" role="group" aria-label={t('mail.reply')}>
						<button
							type="button"
							class="corner-btn"
							aria-label={t('mail.reply')}
							onclick={() =>
								openComposer('mail', undefined, undefined, {
									to: replyTarget,
									subject: replySubject(m.subject)
								})
							}
						>
							<Reply size={14} />
						</button>
						<button
							type="button"
							class="corner-btn"
							aria-label={t('mail.forward')}
							onclick={() =>
								openComposer(
									'mail',
									`act:forward:${m.id}`,
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
										'forward'
									)
								)
							}
						>
							<Forward size={14} />
						</button>
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
		/* Side room so the corner reply/forward pill isn’t clipped */
		padding: 56px 18px 96px;
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
		background: color-mix(in srgb, var(--fg) 4.5%, transparent);
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

	/* Same outer size as the author pfp */
	.mail-more {
		width: 36px;
		height: 36px;
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

	/* Reply + Forward — half off the bottom-right corner of the card */
	.mail-corner-pill {
		position: absolute;
		right: 0;
		bottom: 0;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 36px;
		padding: 3px;
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: 9999px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transform: translate(28%, 42%);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--fg-raw, #000) 12%, transparent);
	}

	.corner-btn {
		width: 30px;
		height: 30px;
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
		-webkit-tap-highlight-color: transparent;
	}

	.corner-btn:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 6%, transparent);
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
		/* Extra bottom/right so body clears the corner action pill */
		padding: 12px 14px 28px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
		max-height: none;
		overflow: visible;
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
</style>
