<script>
	import DropdownMenu from '$lib/components/DropdownMenu.svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import Reply from '$lib/components/icons/Reply.svelte';
	import ReplyAll from '$lib/components/icons/ReplyAll.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import ProfilePicStack from '$lib/components/ProfilePicStack.svelte';
	import SegmentedControl from '@alpha/ui/SegmentedControl.svelte';
	import TaskFieldPicker from '$lib/components/TaskFieldPicker.svelte';
	import { actor, asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import { chatFeed, commentsByKey } from '$lib/chat.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		formatMailWhen,
		isUnreadFor,
		mailAuthorLabel,
		mailComposeSeed,
		mailLatestMessage,
		mailMessages,
		mailPreview,
		mailThreadsForCurrentView,
		mailUi,
		mailUnreadCountForCategory,
		markMailRead,
		markMailUnread,
		moveMailThreadLocal,
		preferReplyAll,
		refreshMail,
		threadMessages,
		threadParticipantProfiles
	} from '$lib/mail.svelte.js';
	import {
		MAIL_CATEGORIES,
		mailCategoryLabel,
		mailFolderLabel,
		mailView,
		setMailCategory
	} from '$lib/mail-view.svelte.js';
	import {
		forceClearSelection,
		openComposer,
		selectEntity,
		taskByMailThreadId,
		ui
	} from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const categoryOptions = $derived(
		MAIL_CATEGORIES.map((c) => ({
			value: c,
			label: mailCategoryLabel(c),
			badge: mailUnreadCountForCategory(c)
		}))
	);

	$effect(() => {
		mailView.folder;
		void refreshMail();
	});

	let menuOpen = $state(false);
	/** @type {HTMLElement | null} */
	let menuAnchor = $state(null);
	/** @type {any | null} */
	let menuThread = $state(null);

	/** @param {MouseEvent} e @param {any} thread */
	function openRowMenu(e, thread) {
		e.preventDefault();
		e.stopPropagation();
		menuAnchor = /** @type {HTMLElement} */ (e.currentTarget);
		menuThread = thread;
		menuOpen = true;
	}

	function closeRowMenu() {
		menuOpen = false;
		menuThread = null;
	}

	/** @param {'reply' | 'replyAll' | 'forward'} mode */
	function menuCompose(mode) {
		const thread = menuThread;
		closeRowMenu();
		if (!thread?.id) return;
		selectEntity('mail', thread.id);
		const seed = mailComposeSeed(thread, mode);
		openComposer('mail', `act:${mode}:${thread.id}`, undefined, seed);
	}

	function menuToggleRead() {
		const thread = menuThread;
		closeRowMenu();
		if (!thread?.id) return;
		if (isUnreadFor(thread)) {
			void markMailRead(thread.id);
			return;
		}
		void markMailUnread(thread.id);
		if (ui.selection?.kind === 'mail' && ui.selection.id === thread.id) {
			forceClearSelection();
		}
	}

	/** @param {'junk' | 'trash'} folder */
	function menuMove(folder) {
		const thread = menuThread;
		closeRowMenu();
		if (!thread?.id) return;
		moveMailThreadLocal(thread.id, folder);
		if (ui.selection?.kind === 'mail' && ui.selection.id === thread.id) {
			forceClearSelection();
		}
	}

	const menuItems = $derived.by(() => {
		const thread = menuThread;
		if (!thread) return [];
		const unread = isUnreadFor(thread);
		return [
			{ id: 'reply', label: t('mail.reply'), onclick: () => menuCompose('reply') },
			{ id: 'replyAll', label: t('mail.replyAll'), onclick: () => menuCompose('replyAll') },
			{ id: 'forward', label: t('mail.forward'), onclick: () => menuCompose('forward') },
			{
				id: 'read',
				label: unread ? t('mail.markRead') : t('mail.markUnread'),
				onclick: () => menuToggleRead()
			},
			{ id: 'junk', label: t('mail.moveToJunk'), onclick: () => menuMove('junk') },
			{
				id: 'trash',
				label: t('mail.moveToTrash'),
				danger: true,
				onclick: () => menuMove('trash')
			}
		];
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
			showPfp: isFollowUp,
			replyAll: isFollowUp && preferReplyAll(last)
		};
	}
</script>

<svelte:head
	><title
		>{mailCategoryLabel(mailView.category)} · {mailFolderLabel(mailView.folder)} · {t('nav.mail')}</title
	></svelte:head
>

<div class="feed mail">
	{#if mailView.folder === 'inbox'}
		<div class="category-seg">
			<SegmentedControl
				options={categoryOptions}
				value={mailView.category}
				label={t('mail.category')}
				onchange={(next) => setMailCategory(/** @type {typeof MAIL_CATEGORIES[number]} */ (next))}
			/>
		</div>
	{/if}

	{#if driveSession.error}
		<p class="banner"><span class="err">{driveSession.error}</span></p>
	{/if}
	{#if mailUi.error}
		<p class="banner"><span class="err">{mailUi.error}</span></p>
	{/if}

	{#if !appBoot.listsReady || (mailUi.loading && threadsList.length === 0)}
		<FeedSkeleton rows={6} />
	{:else if !actor.email}
		<div class="empty">
			<p class="empty-title">{t('mail.chooseWho')}</p>
			<p class="empty-body">{t('mail.settingsPathHint')}</p>
		</div>
	{:else if threadsList.length === 0}
		<div class="empty">
			<p class="empty-title">
				{ui.listFilter === 'unread'
					? t('mail.noUnread')
					: t('mail.emptyFolder', {
							category: mailCategoryLabel(mailView.category).toLowerCase(),
							folder: mailFolderLabel(mailView.folder)
						})}
			</p>
			<p class="empty-body">
				{#if mailView.category === 'primary'}
					{t('mail.primaryHint')}
				{:else}
					{t('mail.forEmail', { email: actor.email })}
				{/if}
			</p>
		</div>
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
				{@const convo = threadParticipantProfiles(thread)}
				{@const linkedTask = taskByMailThreadId(thread.id)}
				<button
					type="button"
					class="row"
					class:on={ui.selection?.kind === 'mail' && ui.selection.id === thread.id}
					class:unread
					class:has-comments={hasComments}
					onclick={() => selectEntity('mail', thread.id)}
					oncontextmenu={(e) => openRowMenu(e, thread)}
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
									<svg viewBox="0 0 31 16" fill="none" aria-hidden="true">
										<path
											d="M1 0 A 15 15 0 0 0 16 15 L31 15"
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
								{#if linkedTask}
									<span class="task-hit" onclick={(e) => e.stopPropagation()}>
										<TaskFieldPicker
											taskId={linkedTask.id}
											field="status"
											value={linkedTask.status || 'open'}
											size={16}
										/>
									</span>
									<span class="task-hit" onclick={(e) => e.stopPropagation()}>
										<TaskFieldPicker
											taskId={linkedTask.id}
											field="priority"
											value={linkedTask.priority || 'none'}
											size={16}
											align="right"
										/>
									</span>
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
									{#if preview.replyAll}
										<ReplyAll size={12} />
									{:else}
										<Reply size={12} />
									{/if}
								</span>
							{/if}
							<span class="snippet">{preview.text || ''}</span>
							{#if convo.length}
								<span class="convo-stack">
									<ProfilePicStack
										profiles={convo}
										size="xxs"
										text={thread.count > 1 ? String(thread.count) : ''}
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

<DropdownMenu
	open={menuOpen}
	anchor={menuAnchor}
	placement="below"
	align="end"
	width={220}
	maxHeight={360}
	items={menuItems}
	onclose={closeRowMenu}
/>

<style>
	.mail {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	/* Inbox triage only — stroked SegmentedControl; sit 2px under list chrome. */
	.category-seg {
		margin: 2px 10px 10px;
	}

	.banner {
		margin: 0 12px 8px;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--fg-4);
		font-size: 13px;
	}

	.err {
		color: var(--fg-66);
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin: auto;
		padding: 2rem 1.5rem;
		text-align: center;
	}

	.empty-title {
		margin: 0;
		font-family: var(--font);
		font-size: 1.65rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--fg-33);
	}

	.empty-body {
		margin: 0.55rem 0 0;
		max-width: 16rem;
		font-size: 14px;
		line-height: 1.5;
		color: var(--fg-16);
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
		/* Span to col-main start (36px col + 12px gap − rail inset) — zero gap to team stack */
		width: 31px;
		height: 16px;
	}

	.l-elbow svg {
		display: block;
		width: 31px;
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

	.task-hit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		line-height: 0;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.unread-dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--fg);
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

	/* Fixed to stack xxs (20px); +2px air under the subject/title line */
	.snippet-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		height: 20px;
		margin-top: 2px;
	}

	.reply-ico {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		color: var(--fg-33);
	}

	.convo-stack {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		height: 20px;
		max-width: 42%;
		min-width: 0;
	}

	.convo-stack :global(.profile-pic-stack) {
		max-width: 100%;
	}

	.convo-stack :global(.pill) {
		padding: 0 8px 0 12px;
		background: var(--fg-8);
	}

	.convo-stack :global(.pill span) {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		font-variant-numeric: lining-nums;
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
		/* Align stack flush with L-elbow tip — no horizontal gap */
		padding-left: 0;
		margin-left: 0;
	}

	.team-stack {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		height: 20px;
		margin-left: 0;
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
