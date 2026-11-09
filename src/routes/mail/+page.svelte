<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import Reply from '$lib/components/icons/Reply.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import ProfilePicStack from '$lib/components/ProfilePicStack.svelte';
	import { actor, asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import { chatFeed, commentsByKey } from '$lib/chat.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		formatMailWhen,
		isUnreadFor,
		mailAuthorLabel,
		mailLatestMessage,
		mailMessages,
		mailPreview,
		mailThreadsForCurrentView,
		mailUi,
		refreshMail,
		threadMessages
	} from '$lib/mail.svelte.js';
	import {
		MAIL_CATEGORIES,
		mailCategoryLabel,
		mailFolderLabel,
		mailView,
		setMailCategory
	} from '$lib/mail-view.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	$effect(() => {
		mailView.folder;
		void refreshMail();
	});

	const threadsList = $derived.by(() => {
		actor.email;
		mailView.folder;
		mailView.category;
		mailMessages.length;
		mailUi.loading;
		ui.listFilter;
		chatFeed.length;
		Object.keys(commentsByKey).length;
		const all = mailThreadsForCurrentView();
		if (ui.listFilter === 'unread') return all.filter((th) => isUnreadFor(th));
		return all;
	});

	/**
	 * Private team comments on a mail thread (chat feed + loaded comment index).
	 * @param {string} threadId
	 */
	function commentsForThread(threadId) {
		const id = String(threadId || '');
		if (!id) return [];
		/** @type {Map<string, any>} */
		const byId = new Map();
		for (const m of chatFeed) {
			if (
				m?.kind === 'comment' &&
				m?.ref?.type === 'mail' &&
				String(m.ref.id) === id &&
				!m._failed
			) {
				byId.set(String(m.id), m);
			}
		}
		for (const m of commentsByKey[`mail:${id}`] ?? []) {
			if (!m?._failed) byId.set(String(m.id), m);
		}
		return [...byId.values()].sort((a, b) =>
			String(b.created_at || '').localeCompare(String(a.created_at || ''))
		);
	}

	/**
	 * @param {any[]} comments
	 */
	function commentProfiles(comments) {
		const seen = new Set();
		/** @type {{ name: string, email: string, pictureUrl: string | null }[]} */
		const profiles = [];
		for (const m of comments) {
			const email = String(m.author || '')
				.trim()
				.toLowerCase();
			if (!email || seen.has(email)) continue;
			seen.add(email);
			const person = asPerson(m.author);
			profiles.push({
				name: person?.name || displayNameFromEmail(m.author),
				email,
				pictureUrl: pictureUrlFor(m.author)
			});
		}
		return profiles;
	}

	/**
	 * @param {any} thread
	 */
	function latestPreview(thread) {
		const last = mailLatestMessage(thread);
		const msgs = threadMessages(thread);
		const isFollowUp = msgs.length > 1;
		return {
			text: mailPreview(last),
			from: String(last?.from || '').toLowerCase(),
			fromName: mailAuthorLabel(last) || displayNameFromEmail(last?.from),
			showPfp: isFollowUp
		};
	}
</script>

<svelte:head
	><title
		>{mailCategoryLabel(mailView.category)} · {mailFolderLabel(mailView.folder)} · {t('nav.mail')}</title
	></svelte:head
>

<div class="feed mail">
	<div class="category-seg" role="group" aria-label={t('mail.category')}>
		{#each MAIL_CATEGORIES as c (c)}
			<button
				type="button"
				class="seg-btn"
				class:on={mailView.category === c}
				onclick={() => setMailCategory(c)}>{mailCategoryLabel(c)}</button
			>
		{/each}
	</div>

	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if mailUi.error}
		<p class="banner"><span class="err">{mailUi.error}</span></p>
	{/if}

	{#if !appBoot.listsReady || (mailUi.loading && threadsList.length === 0)}
		<FeedSkeleton rows={6} />
	{:else if !actor.email}
		<p class="empty">
			{t('mail.chooseWho')}
			<span class="hint">{t('mail.settingsPathHint')}</span>
		</p>
	{:else if threadsList.length === 0}
		<p class="empty">
			{ui.listFilter === 'unread'
				? t('mail.noUnread')
				: t('mail.emptyFolder', {
						category: mailCategoryLabel(mailView.category).toLowerCase(),
						folder: mailFolderLabel(mailView.folder)
					})}
			<span class="hint">
				{#if mailView.category === 'primary'}
					{t('mail.primaryHint')}
				{:else}
					{t('mail.forEmail', { email: actor.email })}
				{/if}
			</span>
		</p>
	{:else}
		<div class="card-stack">
			{#each threadsList as thread (thread.id)}
				{@const unread = isUnreadFor(thread)}
				{@const author = mailAuthorLabel(thread)}
				{@const authorEmail = String(thread.from || '').toLowerCase()}
				{@const preview = latestPreview(thread)}
				{@const comments = commentsForThread(thread.id)}
				{@const latestComment = comments[0] || null}
				{@const commentPreview = latestComment
					? String(latestComment.body || '')
							.replace(/\s+/g, ' ')
							.trim()
							.slice(0, 100)
					: ''}
				{@const commenters = commentProfiles(comments)}
				{@const hasComments = comments.length > 0}
				<button
					type="button"
					class="row"
					class:on={ui.selection?.kind === 'mail' && ui.selection.id === thread.id}
					class:unread
					class:has-comments={hasComments}
					onclick={() => selectEntity('mail', thread.id)}
				>
					<span class="col-pfp" aria-hidden="true">
						<span class="pfp-slot">
							<ProfilePic
								name={author}
								email={authorEmail}
								pictureUrl={pictureUrlFor(authorEmail)}
								size={36}
							/>
						</span>
						{#if hasComments}
							<span class="l-rail">
								<span class="l-vert"></span>
								<span class="l-elbow">
									<svg viewBox="0 0 27 16" fill="none" aria-hidden="true">
										<path
											d="M1 0 A 15 15 0 0 0 16 15 L27 15"
											stroke="currentColor"
											stroke-width="1.5"
											fill="none"
											stroke-linecap="round"
										/>
									</svg>
								</span>
							</span>
						{/if}
					</span>

					<span class="col-main">
						<span class="meta">
							<span class="author">{author}</span>
							<span class="meta-trail">
								{#if thread.count > 1}
									<span class="count">{thread.count}</span>
								{/if}
								{#if unread}
									<span class="unread-dot" aria-label={t('mail.unread')}></span>
								{/if}
							</span>
						</span>
						<span class="subject">
							<span class="subject-text">{thread.subject || t('common.noSubject')}</span>
							<span class="time">{formatMailWhen(thread.created_at)}</span>
						</span>
						<span class="snippet-row">
							{#if preview.showPfp}
								<span class="reply-ico" aria-hidden="true">
									<Reply size={12} />
								</span>
							{/if}
							<span class="snippet">{preview.text || ''}</span>
							{#if preview.showPfp}
								<span class="snippet-pfp">
									<ProfilePic
										name={preview.fromName}
										email={preview.from}
										pictureUrl={pictureUrlFor(preview.from)}
										size={20}
									/>
								</span>
							{/if}
						</span>
						{#if hasComments}
							<span class="team-row">
								<span class="team-stack">
									<ProfilePicStack profiles={commenters} size="xxs" />
								</span>
								{#if commentPreview}
									<span class="team-snippet">{commentPreview}</span>
								{/if}
							</span>
						{:else}
							<span class="team-row team-row-empty" aria-hidden="true"></span>
						{/if}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.mail {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* Recessed category track — no outer stroke; selected chip has a clear fill */
	.category-seg {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		align-items: center;
		gap: 2px;
		margin: 0 10px 10px;
		padding: 4px;
		border-radius: 999px;
		border: 0;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		overflow-x: auto;
		scrollbar-width: none;
		box-sizing: border-box;
	}

	.category-seg::-webkit-scrollbar {
		display: none;
	}

	.seg-btn {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		height: 30px;
		padding: 0 8px;
		border-radius: 999px;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.seg-btn:hover {
		color: var(--fg);
	}

	.seg-btn.on {
		background: color-mix(in srgb, var(--fg) 14%, var(--bg, transparent));
		color: var(--fg);
		box-shadow: 0 1px 2px color-mix(in srgb, #000 12%, transparent);
	}

	.banner {
		margin: 0 12px 8px;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--fg-4);
		font-size: 13px;
	}

	.err {
		color: var(--accent);
	}

	.empty {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 32px 20px;
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg-66);
	}

	.hint {
		font-size: 13px;
		font-weight: 400;
		line-height: 1.4;
		color: var(--fg-33);
		max-width: 28rem;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
	}

	.row {
		display: grid;
		grid-template-columns: 36px minmax(0, 1fr);
		column-gap: 12px;
		align-items: stretch;
		width: 100%;
		padding: 10px 12px 10px 10px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
		line-height: 1.25;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--fg-4);
	}

	.col-pfp {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 36px;
		min-height: 100%;
		--rail-line: 1.5px;
		--rail-inset: calc(18px - var(--rail-line) / 2);
		color: color-mix(in srgb, var(--fg) 16%, transparent);
	}

	.pfp-slot {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 999px;
		overflow: hidden;
	}

	.l-rail {
		position: absolute;
		top: 36px;
		bottom: 10px;
		left: 0;
		width: 36px;
		pointer-events: none;
	}

	.l-vert {
		position: absolute;
		left: var(--rail-inset);
		top: 0;
		bottom: 16px;
		width: var(--rail-line);
		background: currentColor;
	}

	.l-elbow {
		position: absolute;
		left: calc(var(--rail-inset) - 0.25px);
		bottom: 0;
		width: 27px;
		height: 16px;
	}

	.l-elbow svg {
		display: block;
		width: 27px;
		height: 16px;
	}

	.col-main {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 2px;
		min-width: 0;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.author {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 650;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row.unread .author {
		font-weight: 750;
	}

	.meta-trail {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		padding-right: 2px;
	}

	.count {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		font-variant-numeric: lining-nums;
		font-feature-settings:
			'lnum' 1,
			'tnum' 0,
			'onum' 0;
	}

	.unread-dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--accent);
		flex-shrink: 0;
	}

	.subject {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		margin-top: 1px; /* +1px between author row and subject */
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
	}

	.subject-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.time {
		flex-shrink: 0;
		padding-right: 2px;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}

	/* Fixed to stack xxs (20px) so height matches with/without reply pfp */
	.snippet-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		height: 20px;
	}

	.reply-ico {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		color: var(--fg-33);
	}

	.snippet-pfp {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		overflow: hidden;
	}

	/* Do not use class "preview" — app.css .preview adds 16px padding for editors */
	.snippet {
		display: block;
		flex: 1;
		margin: 0;
		padding: 0;
		min-width: 0;
		font-size: 12px;
		font-weight: 400;
		line-height: 20px;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.team-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		min-height: 20px;
		margin-top: 2px;
	}

	.team-row-empty {
		display: none;
	}

	.row.has-comments .team-row {
		/* Align stack center with L-elbow tip (~bottom of pfp column rail) */
		padding-left: 0;
	}

	.team-stack {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		height: 20px;
	}

	.team-snippet {
		min-width: 0;
		font-size: 12px;
		font-weight: 400;
		line-height: 1.3;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
