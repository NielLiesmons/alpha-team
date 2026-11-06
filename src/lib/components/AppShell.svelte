<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { mobileNavForRole, navForRole, websiteChildren } from '$lib/sections.js';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		enterprises,
		forceClearSelection,
		ledgerEntries,
		notes,
		openComposer,
		projects,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';
	import { onMount } from 'svelte';
	import { resetAccountingBrowse } from '$lib/accounting.svelte.js';
	import { chatUi, openChatChannel } from '$lib/chat.svelte.js';
	import { requestDriveUpload } from '$lib/drive/upload-ui.svelte.js';
	import { refreshAllDrive } from '$lib/drive-refresh.js';
	import { bindDetailPopstate, isMobileNav } from '$lib/nav-stack.js';
	import {
		PLANNING_ZOOM_LABELS,
		PLANNING_ZOOMS,
		planningView,
		setPlanningZoom
	} from '$lib/planning-view.svelte.js';
	import { syncUi } from '$lib/sync-progress.svelte.js';
	import ListTitleChrome from '@alpha/ui/ListTitleChrome.svelte';
	import UiShell from '@alpha/ui/UiShell.svelte';
	import CostCreate from './CostCreate.svelte';
	import DetailColumn from './DetailColumn.svelte';
	import EnterpriseCreate from './EnterpriseCreate.svelte';
	import FormCreate from './FormCreate.svelte';
	import LedgerCreate from './LedgerCreate.svelte';
	import MailFolderTitle from './MailFolderTitle.svelte';
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
	const tasksList = $derived(path.startsWith('/tasks'));

	const filterOptions = $derived.by(() => {
		if (path.startsWith('/notes')) {
			return [
				{ id: 'all', label: 'All' },
				{ id: 'recent', label: 'Recent' },
				{ id: 'linked', label: 'With project' },
				{ id: 'unlinked', label: 'Unlinked' }
			];
		}
		if (path.startsWith('/projects')) {
			return [
				{ id: 'all', label: 'All' },
				{ id: 'active', label: 'Active' },
				{ id: 'archived', label: 'Archived' }
			];
		}
		if (path.startsWith('/entreprises')) {
			return [
				{ id: 'all', label: 'All' },
				{ id: 'active', label: 'Active' },
				{ id: 'closed', label: 'Closed' }
			];
		}
		if (path.startsWith('/tasks')) {
			return [
				{ id: 'all', label: 'All' },
				{ id: 'open', label: 'Open' },
				{ id: 'done', label: 'Done' }
			];
		}
		if (path.startsWith('/mail')) {
			return [
				{ id: 'all', label: 'All' },
				{ id: 'unread', label: 'Unread' }
			];
		}
		return null;
	});

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	const roleNav = $derived(navForRole());
	const roleMobileNav = $derived(mobileNavForRole());

	const activeItem = $derived.by(() => {
		const child = websiteChildren.find((item) => active(item.href));
		if (child) return child;
		const top = roleNav.find((item) => active(item.href));
		if (top) return top;
		if (active('/settings')) return { href: '/settings', label: 'Settings', icon: 'settings' };
		return roleNav[0];
	});

	const websiteOpen = $derived(
		active('/website') || active('/publications') || websiteChildren.some((c) => active(c.href))
	);

	const counts = $derived({
		tasks: tasks.length,
		projects: projects.length,
		notes: notes.length,
		enterprises: enterprises.length,
		ledger: ledgerEntries.length
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
		/* Desktop only: third column opens last/General. Mobile stays list-first. */
		if (p.startsWith('/chat') && !isMobileNav()) {
			openChatChannel(chatUi.activeChannelId || 'general');
		}
	});

	const planningList = $derived(path.startsWith('/planning'));
	/** Planning fills list+detail columns (no third-column pane). */
	const wideList = $derived(planningList);
	const driveList = $derived(path.startsWith('/drive'));
	const mailList = $derived(path.startsWith('/mail'));
	/** Planning / Drive own list actions; Mail keeps filter + plus with custom title. */
	const customChrome = $derived(planningList || driveList);

	const createMenuItems = [
		{ kind: 'task', label: 'New task' },
		{ kind: 'project', label: 'New project' },
		{ kind: 'note', label: 'New note' },
		{ kind: 'newsletter', label: 'New newsletter' },
		{ kind: 'ledger', label: 'New ledger entry' },
		{ kind: 'cost', label: 'New cost' },
		{ kind: 'sales', label: 'New sales line' },
		{ kind: 'enterprise', label: 'New enterprise' }
	];

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
		if (kind) openComposer(/** @type {any} */ (kind));
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
	{wideList}
	syncing={syncUi.active}
	filterOptions={customChrome ? null : filterOptions}
	filterValue={ui.listFilter}
	{createMenuItems}
	createKind={customChrome ? undefined : createKind}
	defaultListActions={!customChrome}
	{isSectionActive}
	onNavigate={go}
	onCreate={create}
	onNavPlus={onNavPlus}
	onFilterChange={(id) => {
		ui.listFilter = id;
	}}
	onRefresh={() => refreshAllDrive()}
	feedPadClass={tasksList ? 'tasks-pad' : ''}
>
	{#snippet banners()}
		<PwaInstallBanner />
	{/snippet}

	{#snippet sidebarLead()}
		<button type="button" class="pfp-btn" aria-label="Settings" onclick={() => go('/settings')}>
			<ProfilePic
				name={displayNameFromEmail()}
				email={actor.email}
				pictureUrl={pictureUrlFor(actor.email)}
				size={32}
			/>
		</button>
	{/snippet}

	{#snippet listTitleSlot()}
		{#if mailList}
			<MailFolderTitle />
		{:else}
			<ListTitleChrome
				title={activeItem.label}
				syncing={syncUi.active}
				titleClass={planningList ? 'planning-title' : ''}
			/>
		{/if}
	{/snippet}

	{#snippet listActionsSlot()}
		{#if planningList}
			<div class="zoom-seg" role="group" aria-label="Timeframe">
				{#each PLANNING_ZOOMS as z (z)}
					<button type="button" class:on={planningView.zoom === z} onclick={() => setPlanningZoom(z)}
						>{PLANNING_ZOOM_LABELS[z]}</button
					>
				{/each}
			</div>
		{:else if driveList}
			{#if createKind}
				<button
					type="button"
					class="chrome-btn list-plus"
					aria-label={createKind === 'file' ? 'Upload file' : `New ${createKind}`}
					onclick={onListPlus}
				>
					<svg class="chrome-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
			{/if}
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
	.pfp-btn {
		border: 0;
		padding: 0;
		background: transparent;
		border-radius: 999px;
		cursor: pointer;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		transition: opacity 0.15s ease;
	}

	.pfp-btn:hover {
		opacity: 0.85;
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
