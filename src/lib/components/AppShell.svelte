<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		activeWebsite,
		mobileNavForRole,
		navForRole,
		space,
		websites
	} from '$lib/sections.js';
	import { spaceBrand } from '$lib/space-brand.svelte.js';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		activityUnreadByKind,
		activityUnreadCount
	} from '$lib/chat-activity.svelte.js';
	import {
		hydratePersonCursorsLocal,
		loadPersonCursors,
		markCursorsSeen,
		newChatCount,
		newNotesCount,
		newTasksCount
	} from '$lib/person-cursors.svelte.js';
	import { chatFeed } from '$lib/chat.svelte.js';
	import {
		forceClearSelection,
		notes,
		openComposer,
		selectEntity,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';
	import UnreadMark from '@alpha/ui/UnreadMark.svelte';
	import At from './icons/At.svelte';
	import Heart from './icons/Heart.svelte';
	import Reply from './icons/Reply.svelte';
	import { onMount, untrack } from 'svelte';
	import { resetAccountingBrowse } from '$lib/accounting.svelte.js';
	import { requestDriveUpload } from '$lib/drive/upload-ui.svelte.js';
	import { requestPhotosUpload } from '$lib/photos-upload.svelte.js';
	import { refreshAllDrive } from '$lib/drive-refresh.js';
	import { bindDetailPopstate } from '$lib/nav-stack.js';
	import {
		PLANNING_ZOOMS,
		planningView,
		setPlanningZoom
	} from '$lib/planning-view.svelte.js';
	import {
		MAIL_FOLDERS,
		mailFolderLabel,
		mailView,
		setMailFolder
	} from '$lib/mail-view.svelte.js';
	import { chatUi } from '$lib/chat.svelte.js';
	import { sectionForPath } from '$lib/drive/change-summary.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { mailUi } from '$lib/mail.svelte.js';
	import { isSectionSyncing } from '$lib/sync-progress.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';
	import ListTitleChrome from '@alpha/ui/ListTitleChrome.svelte';
	import ChatVoiceNowPlaying from '$lib/components/ChatVoiceNowPlaying.svelte';
	import ChatCallActions from '$lib/components/ChatCallActions.svelte';
	import { voicePlayerVisible } from '$lib/chat-voice-player.svelte.js';
	import UiShell from '@alpha/ui/UiShell.svelte';
	import CostCreate from './CostCreate.svelte';
	import DetailColumn from './DetailColumn.svelte';
	import EnterpriseCreate from './EnterpriseCreate.svelte';
	import FormCreate from './FormCreate.svelte';
	import LedgerCreate from './LedgerCreate.svelte';
	import MetricCreate from './MetricCreate.svelte';
	import TableCreate from './TableCreate.svelte';
	import ViewCreate from './ViewCreate.svelte';
	import MailCreate from './MailCreate.svelte';
	import MailFolderTitle from './MailFolderTitle.svelte';
	import NewsletterCreate from './NewsletterCreate.svelte';
	import NoteCreate from './NoteCreate.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import SalesCreate from './SalesCreate.svelte';
	import MediaLightbox from './MediaLightbox.svelte';
	import TaskCreate from './TaskCreate.svelte';
	import WelcomeEdit from './WelcomeEdit.svelte';
	import PwaInstallBanner from './PwaInstallBanner.svelte';

	let { children } = $props();

	/*
	 * Drive chrome from the live $page store. Custom beforeNavigate path + listBlank
	 * + history traps raced SvelteKit and left Chat UI / widths stuck across sections.
	 */
	const path = $derived($page.url.pathname);
	const chatList = $derived(path.startsWith('/chat'));
	const mailList = $derived(path.startsWith('/mail'));
	const commsFeed = $derived(chatList || mailList);
	/** Entity detail from chat tips — not the notifications synopsis. */
	const chatCompact = $derived.by(() => {
		if (!chatList || !ui.selection) return false;
		if (ui.selection.kind === 'chat' && ui.selection.id === 'notifications') return false;
		return true;
	});
	const chatNotifCount = $derived.by(() => {
		if (!chatList) return 0;
		return activityUnreadCount();
	});
	const chatNotifCats = $derived.by(() => {
		if (!chatList) return { reaction: 0, reply: 0, assigned: 0 };
		return activityUnreadByKind();
	});
	const chatNotifHasCats = $derived(
		chatNotifCats.reaction + chatNotifCats.reply + chatNotifCats.assigned > 0
	);

	function openChatActivity() {
		if (
			ui.selection?.kind === 'chat' &&
			ui.selection.id === 'notifications'
		) {
			forceClearSelection();
			return;
		}
		/* Desktop: clear entity so the synopsis fills the 3rd col. Mobile: open as detail. */
		if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
			forceClearSelection();
			return;
		}
		selectEntity('chat', 'notifications');
	}

	const filterOptions = $derived.by(() => {
		locale.value;
		if (path.startsWith('/notes')) {
			return [
				{ id: 'all', label: t('filter.all') },
				{ id: 'recent', label: t('filter.recent') },
				{ id: 'linked', label: t('filter.linked') },
				{ id: 'unlinked', label: t('filter.unlinked') }
			];
		}
		if (path.startsWith('/projects')) {
			return [
				{ id: 'all', label: t('filter.all') },
				{ id: 'active', label: t('filter.active') },
				{ id: 'archived', label: t('filter.archived') }
			];
		}
		if (path.startsWith('/entreprises')) {
			return [
				{ id: 'all', label: t('filter.all') },
				{ id: 'active', label: t('filter.active') },
				{ id: 'closed', label: t('filter.closed') }
			];
		}
		if (path.startsWith('/tasks')) {
			return [
				{ id: 'all', label: t('filter.all') },
				{ id: 'open', label: t('filter.open') },
				{ id: 'done', label: t('filter.done') }
			];
		}
		if (path.startsWith('/mail')) {
			return [
				{ id: 'all', label: t('filter.all') },
				{ id: 'unread', label: t('filter.unread') }
			];
		}
		if (path.startsWith('/photos')) {
			/* Upload quality — default `all` = compressed (filter chrome inactive). */
			return [
				{ id: 'all', label: t('photos.filterCompressed') },
				{ id: 'hd', label: t('photos.filterHd') }
			];
		}
		/* Publications filters live inside PublicationsFeed (detail column). */
		return null;
	});

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	/** @param {string} href */
	function navLabel(href) {
		const key =
			{
				'/chat': 'nav.chat',
				'/mail': 'nav.mail',
				'/drive': 'nav.drive',
				'/photos': 'nav.photos',
				'/projects': 'nav.projects',
				'/tasks': 'nav.tasks',
				'/notes': 'nav.notes',
				'/entreprises': 'nav.entreprises',
				'/planning': 'nav.planning',
				'/website': 'nav.website',
				'/publications': 'nav.publications',
				'/settings': 'nav.settings'
			}[href] || '';
		return key ? t(key) : '';
	}

	/** @param {import('$lib/sections.js').NavItem} item */
	function withNavLabel(item) {
		/* Site rows keep domain host as label. */
		if (item.faviconUrl) return item;
		const translated = navLabel(item.href);
		return translated ? { ...item, label: translated } : item;
	}

	/** @param {import('$lib/sections.js').NavItem | import('$lib/sections.js').NavGroup} entry */
	function withMailChildren(entry) {
		if (entry && /** @type {any} */ (entry).type === 'group') {
			const group = /** @type {import('$lib/sections.js').NavGroup} */ (entry);
			locale.value;
			websites.length;
			return {
				...group,
				label: t('nav.website'),
				items: group.items.map((item) => withNavLabel(item))
			};
		}
		const item = /** @type {import('$lib/sections.js').NavItem} */ (entry);
		const labeled = withNavLabel(item);
		if (item.href !== '/mail') return labeled;
		mailView.folder;
		locale.value;
		return {
			...labeled,
			children: MAIL_FOLDERS.map((id) => ({
				id,
				label: mailFolderLabel(id),
				active: mailView.folder === id
			}))
		};
	}

	const roleNav = $derived.by(() => {
		locale.value;
		mailView.folder;
		websites.length;
		spaceBrand.iconUrl;
		space.iconUrl;
		return navForRole().map(withMailChildren);
	});
	const roleMobileNav = $derived.by(() => {
		locale.value;
		mailView.folder;
		websites.length;
		spaceBrand.iconUrl;
		space.iconUrl;
		return mobileNavForRole().map(withMailChildren);
	});

	const websiteOpen = $derived(active('/website') || active('/publications'));

	const activeItem = $derived.by(() => {
		const p = path;
		locale.value;
		websites.length;
		const site = activeWebsite();
		if (websiteOpen && site) {
			return {
				href: '/website',
				label: site.host,
				icon: 'website',
				faviconUrl: site.faviconUrl,
				createKind: 'newsletter'
			};
		}
		for (const entry of roleNav) {
			if (/** @type {any} */ (entry).type === 'group') continue;
			const item = /** @type {import('$lib/sections.js').NavItem} */ (entry);
			if (active(item.href)) return item;
		}
		if (p.startsWith('/settings'))
			return { href: '/settings', label: t('nav.settings'), icon: 'settings' };
		/*
		 * Never fall back to roleNav[0] (Chat) for an unmatched path — that left
		 * activeHref/title/icon stuck on Chat after leaving the section.
		 */
		const labeled = navLabel(p) || t('nav.chat');
		return { href: p || '/chat', label: labeled, icon: 'dot' };
	});

	/** Muted nav totals = “new since last visit” (not inventory size). */
	const counts = $derived({
		chat: newChatCount(),
		tasks: newTasksCount(),
		notes: newNotesCount()
	});
	/** Accent = targeted-at-you notifications. */
	const unreadCounts = $derived({
		chat: activityUnreadCount()
	});

	/**
	 * Advance section cursors on enter / when new items arrive while viewing.
	 * `untrack` is mandatory: markCursorsSeen reads personCursors; without it the
	 * effect re-subscribes to those writes and tip-thrashes the Drive forever.
	 */
	let cursorSection = /** @type {string} */ ('');
	$effect(() => {
		const p = path;
		/** @type {'chat' | 'notes' | 'tasks' | null} */
		let section = null;
		let len = 0;
		if (p.startsWith('/chat')) {
			section = 'chat';
			len = chatFeed.length;
		} else if (p.startsWith('/notes')) {
			section = 'notes';
			len = notes.length;
		} else if (p.startsWith('/tasks')) {
			section = 'tasks';
			len = tasks.length;
		}
		if (!section) {
			cursorSection = '';
			return;
		}
		void len; /* subscribe to list growth */
		const entered = cursorSection !== p;
		cursorSection = p;
		untrack(() => {
			if (entered) {
				markCursorsSeen(section);
				return;
			}
			const pending =
				section === 'chat'
					? newChatCount()
					: section === 'notes'
						? newNotesCount()
						: newTasksCount();
			if (pending > 0) markCursorsSeen(section);
		});
	});

	$effect(() => {
		const email = actor.email;
		if (!email) return;
		untrack(() => {
			hydratePersonCursorsLocal();
			void loadPersonCursors();
		});
	});

	const createKind = $derived(
		'createKind' in activeItem
			? /** @type {string | undefined} */ (activeItem.createKind)
			: undefined
	);

	/** @param {string | undefined} pathname */
	function sectionRoot(pathname) {
		const seg = String(pathname || '/')
			.split('/')
			.filter(Boolean)[0];
		return seg || '';
	}

	let lastSectionRoot = /** @type {string | null} */ (null);
	$effect(() => {
		const root = sectionRoot(path);
		if (lastSectionRoot === root) return;
		const first = lastSectionRoot === null;
		lastSectionRoot = root;
		if (!first) {
			/* Leaving any section — drop selection so Chat notifs / entities never leak. */
			forceClearSelection();
			ui.listFilter = 'all';
			resetAccountingBrowse();
		}
	});

	const planningList = $derived(path.startsWith('/planning'));
	const photosList = $derived(path.startsWith('/photos'));
	/** Planning / Photos fill list+detail columns (no third-column pane). */
	const wideList = $derived(planningList || photosList);
	const driveList = $derived(path.startsWith('/drive'));
	/** Planning / Drive own list actions. */
	const customChrome = $derived(planningList || driveList);

	/**
	 * Top-bar title from path (not activeItem fallback).
	 * activeItem falls back to the first nav row (Chat) when no href matches —
	 * that left “Chat” stuck on Mail/Tasks after leaving Chat.
	 */
	const chromeTitle = $derived.by(() => {
		const p = path;
		locale.value;
		mailView.folder;
		if (p.startsWith('/mail')) return mailFolderLabel(mailView.folder) || t('mail.inbox');
		if (p.startsWith('/photos')) return t('nav.photos');
		if (p.startsWith('/website') || p.startsWith('/publications')) {
			return activeWebsite()?.host || t('nav.website');
		}
		const bases = [
			'/chat',
			'/drive',
			'/projects',
			'/tasks',
			'/notes',
			'/entreprises',
			'/planning',
			'/settings'
		];
		for (const href of bases) {
			if (p === href || p.startsWith(`${href}/`)) {
				return navLabel(href) || activeItem.label || '';
			}
		}
		const labeled = navLabel(activeItem.href);
		return labeled || activeItem.label || '';
	});

	/**
	 * Title-chrome loading: section sync + feed/list loads for the open section.
	 * Keeps the metaball visible during real refreshes, not only tip-mismatch crawls.
	 */
	const titleSyncing = $derived.by(() => {
		const section = sectionForPath(path);
		if (isSectionSyncing(section)) return true;
		if (section === 'chat' && (chatUi.loading || !chatUi.settled)) return true;
		if (section === 'mail' && mailUi.loading) return true;
		/* Active Drive refresh — covers tip-match PTR before section flags stamp. */
		if (section && driveSession.syncing) return true;
		return false;
	});

	const createMenuItems = $derived.by(() => {
		locale.value;
		return [
			{ kind: 'task', label: t('create.task'), icon: 'tasks' },
			{ kind: 'project', label: t('create.project'), icon: 'projects' },
			{ kind: 'note', label: t('create.note'), icon: 'notes' },
			{ kind: 'newsletter', label: t('create.newsletter'), icon: 'publications' },
			{ kind: 'photo', label: t('create.photo'), icon: 'photos' },
			{ kind: 'file', label: t('create.file'), icon: 'folder' },
			{ kind: 'ledger', label: t('create.ledger'), icon: 'accounting' },
			{ kind: 'cost', label: t('create.cost'), icon: 'accounting' },
			{ kind: 'sales', label: t('create.sales'), icon: 'accounting' },
			{ kind: 'enterprise', label: t('create.enterprise'), icon: 'enterprise' }
		];
	});

	onMount(() =>
		bindDetailPopstate({
			onSelection: () => forceClearSelection()
		})
	);

	/** @param {string} href */
	function go(href) {
		if (/^https?:\/\//i.test(href)) {
			window.location.assign(href);
			return;
		}
		const replace = Boolean(typeof history !== 'undefined' && history.state?.alphaLayer);
		/* Clear before goto so detail never keeps Chat activity on Mail/Photos. */
		forceClearSelection();
		/* Fresh entry to Mail always lands on Inbox; in-section folder picks keep state. */
		if (href === '/mail' && !path.startsWith('/mail')) setMailFolder('inbox');
		goto(href, { replaceState: replace });
	}

	/** @param {string} kind */
	function create(kind) {
		if (kind === 'file') {
			if (!path.startsWith('/drive')) go('/drive');
			requestDriveUpload();
			return;
		}
		if (kind === 'photo') {
			if (!path.startsWith('/photos')) go('/photos');
			requestPhotosUpload();
			return;
		}
		openComposer(/** @type {any} */ (kind));
		if (kind === 'task') go('/tasks');
		else if (kind === 'project') go('/projects');
		else if (kind === 'note') go('/notes');
		else if (kind === 'newsletter') {
			if (path.startsWith('/website')) {
				selectEntity('pubs', 'hub');
			} else {
				void goto('/website').then(() => selectEntity('pubs', 'hub'));
			}
		} else if (kind === 'mail') go('/mail');
		else if (
			kind === 'ledger' ||
			kind === 'cost' ||
			kind === 'sales' ||
			kind === 'enterprise' ||
			kind === 'table' ||
			kind === 'metric' ||
			kind === 'form' ||
			kind === 'view'
		) {
			go('/entreprises');
		}
	}

	/** @param {string | undefined} kind */
	function onNavPlus(kind) {
		if (kind === 'file') {
			if (!path.startsWith('/drive')) go('/drive');
			requestDriveUpload();
			return;
		}
		if (kind === 'photo') {
			if (!path.startsWith('/photos')) go('/photos');
			requestPhotosUpload();
			return;
		}
		if (kind === 'website') {
			alert(t('web.addSiteSoon'));
			return;
		}
		if (kind) openComposer(/** @type {any} */ (kind));
	}

	/** @param {string} groupId */
	function onGroupPlus(groupId) {
		if (groupId === 'websites') {
			alert(t('web.addSiteSoon'));
		}
	}

	/**
	 * @param {string} parentHref
	 * @param {string} childId
	 */
	function onNavChild(parentHref, childId) {
		if (parentHref === '/mail') {
			setMailFolder(/** @type {import('$lib/mail-view.svelte.js').MailFolder} */ (childId));
			if (!path.startsWith('/mail')) go('/mail');
		}
	}

	function onListPlus() {
		if (createKind === 'file') {
			requestDriveUpload();
			return;
		}
		if (createKind === 'photo') {
			requestPhotosUpload();
			return;
		}
		if (createKind) openComposer(/** @type {any} */ (createKind));
	}

	/** @param {string} href */
	function isSectionActive(href) {
		if (href === '/website') return websiteOpen;
		return active(href);
	}
</script>

<UiShell
	sections={roleNav}
	mobileSections={roleMobileNav}
	activeHref={activeItem.href}
	title={chromeTitle}
	{counts}
	{unreadCounts}
	{wideList}
	listSize={chatList ? 'chat' : 'default'}
	listCompact={chatCompact}
	{commsFeed}
	syncing={titleSyncing}
	filterOptions={customChrome ? null : filterOptions}
	filterValue={ui.listFilter}
	{createMenuItems}
	createKind={customChrome ? undefined : createKind}
	defaultListActions={!customChrome && !chatList}
	{isSectionActive}
	onNavigate={go}
	onNavChild={onNavChild}
	onCreate={create}
	onNavPlus={onNavPlus}
	onGroupPlus={onGroupPlus}
	onFilterChange={(id) => {
		ui.listFilter = id;
	}}
	onRefresh={() => refreshAllDrive()}
	feedPadClass={chatList ? '' : 'feed-pad'}
	accountLabel={displayNameFromEmail()}
>
	{#snippet banners()}
		<PwaInstallBanner />
	{/snippet}

	{#snippet sidebarLead()}
		<!-- 34px: 10px smaller than the 44px round chrome; pad lives on .account-pill -->
		<ProfilePic
			name={displayNameFromEmail()}
			email={actor.email}
			pictureUrl={pictureUrlFor(actor.email)}
			size={34}
		/>
	{/snippet}

	{#snippet sidebarTrail()}
		{#if chatList && voicePlayerVisible()}
			<ChatVoiceNowPlaying placement="sidebar" />
		{/if}
	{/snippet}

	{#snippet listTitleSlot()}
		{#if mailList}
			<MailFolderTitle />
		{:else}
			<!--
				display:contents — do NOT wrap with width:100% here.
				list-title-slot is already display:contents; a full-width stack
				became a list-top flex child and crushed the mobile title pill
				+ ovalized the 44px chat activity button.
			-->
			<ListTitleChrome
				title={chromeTitle}
				syncing={titleSyncing}
				titleClass={planningList ? 'planning-title' : ''}
			/>
			{#if chatList}
				<div class="chat-voice-slot" class:on={voicePlayerVisible()}>
					<ChatVoiceNowPlaying placement="bar" />
				</div>
			{/if}
		{/if}
	{/snippet}

	{#snippet listActionsSlot()}
		{#if planningList}
			<div class="zoom-seg" role="group" aria-label={t('planning.timeframe')}>
				{#each PLANNING_ZOOMS as z (z)}
					<button type="button" class:on={planningView.zoom === z} onclick={() => setPlanningZoom(z)}
						>{t(`planning.${z}`)}</button
					>
				{/each}
			</div>
		{:else if driveList}
			{#if createKind}
				<button
					type="button"
					class="chrome-btn list-plus"
					aria-label={createKind === 'file'
						? t('create.file')
						: createKind === 'photo'
							? t('create.photo')
							: t('create.newKind', { kind: createKind })}
					onclick={onListPlus}
				>
					<svg class="chrome-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
			{/if}
		{:else if chatList}
			<ChatCallActions />
			<button
				type="button"
				class="chrome-btn chat-activity-btn"
				class:cats={chatNotifHasCats}
				class:on={ui.selection?.kind === 'chat' && ui.selection.id === 'notifications'}
				aria-label={t('chat.activityOpen')}
				onclick={openChatActivity}
			>
				<span class="activity-mark">
					<UnreadMark count={chatNotifCount || 0} />
				</span>
				<span class="activity-cats" aria-hidden="true">
					{#if chatNotifCats.reaction > 0}
						<span class="cat">
							<Heart size={14} />
							<span class="cat-n">{chatNotifCats.reaction > 9 ? '9+' : chatNotifCats.reaction}</span>
						</span>
					{/if}
					{#if chatNotifCats.reply > 0}
						<span class="cat">
							<Reply size={14} />
							<span class="cat-n">{chatNotifCats.reply > 9 ? '9+' : chatNotifCats.reply}</span>
						</span>
					{/if}
					{#if chatNotifCats.assigned > 0}
						<span class="cat">
							<At size={14} />
							<span class="cat-n">{chatNotifCats.assigned > 9 ? '9+' : chatNotifCats.assigned}</span>
						</span>
					{/if}
				</span>
			</button>
		{/if}
	{/snippet}

	{#snippet detail()}
		{#if !wideList}
			<DetailColumn />
		{/if}
	{/snippet}

	{#snippet sheets()}
		<TaskCreate />
		<ProjectCreate />
		<NoteCreate />
		<LedgerCreate />
		<CostCreate />
		<SalesCreate />
		<EnterpriseCreate />
		<TableCreate />
		<MetricCreate />
		<FormCreate />
		<ViewCreate />
		<NewsletterCreate />
		<MailCreate />
		<WelcomeEdit />
		<MediaLightbox />
	{/snippet}

	{@render children()}
</UiShell>

<style>
	/*
	 * Mobile: compact voice pill in list-top between Chat title and notifications.
	 * (list-title-slot is display:contents → this is a list-top flex child.)
	 * Desktop uses sidebarTrail player panel instead.
	 */
	.chat-voice-slot {
		display: none;
	}

	@media (max-width: 767px) {
		.chat-voice-slot.on {
			display: flex;
			flex: 1 1 auto;
			align-items: center;
			min-width: 0;
			position: relative;
			z-index: 2;
		}
	}

	/* Planning zoom chrome rendered into UiShell list actions */
	.zoom-seg {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 28px;
		padding: 2px;
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: 10px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.zoom-seg button {
		height: 100%;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		line-height: 1;
	}

	.zoom-seg button.on {
		background: var(--fg-8);
		color: var(--fg);
	}

	.chrome-btn {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 10px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66);
		cursor: pointer;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.chat-activity-btn {
		position: relative;
		/* Stay a round chrome control — never width:auto (that ovalized mobile). */
		width: 28px;
		min-width: 28px;
		padding: 0;
		gap: 0;
		flex-shrink: 0;
	}

	.activity-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.activity-cats {
		display: none;
		align-items: center;
		gap: 8px;
		color: var(--fg-66);
	}

	.activity-cats .cat {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		line-height: 0;
	}

	.activity-cats .cat-n {
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
		color: var(--fg-66);
		font-variant-numeric: lining-nums;
	}

	@media (max-width: 767px) {
		/* Match UiShell mobile chrome-btn — fixed 44 round glass. */
		.chat-activity-btn {
			width: 44px;
			min-width: 44px;
			height: 44px;
			padding: 0;
			border-radius: 9999px;
			flex-shrink: 0;
		}

		.chat-activity-btn.cats {
			width: auto;
			min-width: 44px;
			height: 44px;
			padding: 0 12px;
			border-radius: 9999px;
		}

		.chat-activity-btn.cats .activity-mark {
			display: none;
		}

		.chat-activity-btn.cats .activity-cats {
			display: inline-flex;
		}

		.chat-activity-btn:not(.cats) .activity-cats {
			display: none;
		}
	}

	@media (min-width: 768px) {
		.activity-cats {
			display: none !important;
		}
	}

	.chrome-ico {
		display: block;
		width: 16px;
		height: 16px;
	}

	@media (max-width: 767px) {
		.chrome-btn {
			width: 44px;
			height: 44px;
			border-radius: 9999px;
		}

		.chrome-ico {
			width: 22px;
			height: 22px;
		}
	}
</style>
