<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		activeWebsite,
		mobileNavForRole,
		navForRole,
		websiteChildren,
		websites
	} from '$lib/sections.js';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		activityUnreadByKind,
		activityUnreadCount
	} from '$lib/chat-activity.svelte.js';
	import {
		enterprises,
		forceClearSelection,
		ledgerEntries,
		notes,
		openComposer,
		projects,
		selectEntity,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';
	import UnreadMark from '@alpha/ui/UnreadMark.svelte';
	import At from './icons/At.svelte';
	import Heart from './icons/Heart.svelte';
	import Reply from './icons/Reply.svelte';
	import { onMount } from 'svelte';
	import { resetAccountingBrowse } from '$lib/accounting.svelte.js';
	import { requestDriveUpload } from '$lib/drive/upload-ui.svelte.js';
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
	import { syncUi } from '$lib/sync-progress.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';
	import ListTitleChrome from '@alpha/ui/ListTitleChrome.svelte';
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
	import NewsletterCreate from './NewsletterCreate.svelte';
	import NoteCreate from './NoteCreate.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import SalesCreate from './SalesCreate.svelte';
	import TaskCreate from './TaskCreate.svelte';
	import WelcomeEdit from './WelcomeEdit.svelte';
	import PwaInstallBanner from './PwaInstallBanner.svelte';

	let { children } = $props();

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
		if (path.startsWith('/publications')) {
			return [
				{ id: 'all', label: t('filter.all') },
				{ id: 'blog', label: t('filter.blog') },
				{ id: 'post', label: t('filter.posts') },
				{ id: 'event', label: t('filter.events') },
				{ id: 'draft', label: t('filter.drafts') }
			];
		}
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
				'/projects': 'nav.projects',
				'/tasks': 'nav.tasks',
				'/notes': 'nav.notes',
				'/entreprises': 'nav.entreprises',
				'/planning': 'nav.planning',
				'/website': 'nav.website',
				'/website/shop': 'nav.shop',
				'/website/content': 'nav.content',
				'/website/activity': 'nav.activity',
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
		return navForRole().map(withMailChildren);
	});
	const roleMobileNav = $derived.by(() => {
		locale.value;
		mailView.folder;
		websites.length;
		return mobileNavForRole().map(withMailChildren);
	});

	const websiteOpen = $derived(
		active('/website') ||
			active('/publications') ||
			websiteChildren.some((c) => active(c.href))
	);

	const activeItem = $derived.by(() => {
		locale.value;
		websites.length;
		const site = activeWebsite();
		if (websiteOpen && site) {
			const child = websiteChildren.find((item) => active(item.href));
			if (child) {
				return {
					href: child.href,
					label: t(child.labelKey),
					icon: child.icon,
					createKind: child.createKind
				};
			}
			if (active('/website') && path === '/website') {
				return {
					href: '/website',
					label: site.host,
					icon: 'website',
					faviconUrl: site.faviconUrl
				};
			}
			if (active('/publications')) {
				return {
					href: '/publications',
					label: t('nav.publications'),
					icon: 'publications',
					createKind: 'newsletter'
				};
			}
		}
		for (const entry of roleNav) {
			if (/** @type {any} */ (entry).type === 'group') continue;
			const item = /** @type {import('$lib/sections.js').NavItem} */ (entry);
			if (active(item.href)) return item;
		}
		if (active('/settings'))
			return { href: '/settings', label: t('nav.settings'), icon: 'settings' };
		const first = roleNav[0];
		return /** @type {any} */ (first)?.type === 'group'
			? /** @type {any} */ (first).items?.[0]
			: first;
	});

	const counts = $derived({
		tasks: tasks.length,
		projects: projects.length,
		notes: notes.length,
		enterprises: enterprises.length,
		ledger: ledgerEntries.length
	});
	const unreadCounts = $derived({
		chat: activityUnreadCount()
	});

	const createKind = $derived(
		'createKind' in activeItem
			? /** @type {string | undefined} */ (activeItem.createKind)
			: undefined
	);

	let lastSectionPath = /** @type {string | null} */ (null);
	$effect(() => {
		const p = path;
		if (lastSectionPath === p) return;
		const first = lastSectionPath === null;
		lastSectionPath = p;
		if (!first) {
			forceClearSelection();
			ui.listFilter = 'all';
			resetAccountingBrowse();
		}
		/* Chat feed lives in the list column — don't open it as a detail pane. */
	});

	const planningList = $derived(path.startsWith('/planning'));
	/** Planning fills list+detail columns (no third-column pane). */
	const wideList = $derived(planningList);
	const driveList = $derived(path.startsWith('/drive'));
	/** Planning / Drive own list actions. */
	const customChrome = $derived(planningList || driveList);

	const createMenuItems = $derived.by(() => {
		locale.value;
		return [
			{ kind: 'task', label: t('create.task') },
			{ kind: 'project', label: t('create.project') },
			{ kind: 'note', label: t('create.note') },
			{ kind: 'newsletter', label: t('create.newsletter') },
			{ kind: 'ledger', label: t('create.ledger') },
			{ kind: 'cost', label: t('create.cost') },
			{ kind: 'sales', label: t('create.sales') },
			{ kind: 'enterprise', label: t('create.enterprise') }
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
		forceClearSelection();
		/* Fresh entry to Mail always lands on Inbox; in-section folder picks keep state. */
		if (href === '/mail' && !path.startsWith('/mail')) setMailFolder('inbox');
		goto(href, { replaceState: replace });
	}

	/** @param {string} kind */
	function create(kind) {
		openComposer(/** @type {any} */ (kind));
		if (kind === 'task') go('/tasks');
		else if (kind === 'project') go('/projects');
		else if (kind === 'note') go('/notes');
		else if (kind === 'newsletter') go('/publications');
		else if (kind === 'mail') go('/mail');
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
	title={activeItem.label}
	{counts}
	{unreadCounts}
	{wideList}
	listSize={chatList ? 'chat' : 'default'}
	listCompact={chatCompact}
	{commsFeed}
	syncing={syncUi.active}
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

	{#snippet listTitleSlot()}
		<ListTitleChrome
			title={activeItem.label}
			syncing={syncUi.active}
			titleClass={planningList ? 'planning-title' : ''}
		/>
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
					aria-label={createKind === 'file' ? t('create.file') : t('create.newKind', { kind: createKind })}
					onclick={onListPlus}
				>
					<svg class="chrome-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
			{/if}
		{:else if chatList}
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
	{/snippet}

	{@render children()}
</UiShell>

<style>
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
		width: auto;
		min-width: 28px;
		padding: 0 8px;
		gap: 0;
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
		.chat-activity-btn.cats {
			height: 32px;
			padding: 0 10px;
			border-radius: 999px;
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
