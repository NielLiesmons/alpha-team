<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { mobileNavForRole, navForRole, websiteChildren } from '$lib/sections.js';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { canManageMembers } from '$lib/members.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		enterprises,
		forceClearSelection,
		ledgerEntries,
		notes,
		openComposer,
		projects,
		tasks
	} from '$lib/workspace.svelte.js';
	import { onMount, tick } from 'svelte';
	import {
		currentTrack,
		ensureDesktopPlayerDetail,
		forceClosePlayerDetail
	} from '$lib/player.svelte.js';
	import { resetAccountingBrowse } from '$lib/accounting.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { requestDriveUpload } from '$lib/drive/upload-ui.svelte.js';
	import { refreshAllDrive } from '$lib/drive-refresh.js';
	import { attachChromeScrollFade } from '$lib/chrome-scroll-fade.js';
	import { bindDetailPopstate } from '$lib/nav-stack.js';
	import { PLANNING_ZOOM_LABELS, PLANNING_ZOOMS, planningView, setPlanningZoom } from '$lib/planning-view.svelte.js';
	import {
		MAIL_FOLDER_LABELS,
		MAIL_FOLDERS,
		mailView,
		setMailFolder
	} from '$lib/mail-view.svelte.js';
	import CostCreate from './CostCreate.svelte';
	import DetailColumn from './DetailColumn.svelte';
	import PullToRefresh from './PullToRefresh.svelte';
	import SyncProgressBar from './SyncProgressBar.svelte';
	import EnterpriseCreate from './EnterpriseCreate.svelte';
	import FormCreate from './FormCreate.svelte';
	import LedgerCreate from './LedgerCreate.svelte';
	import MetricCreate from './MetricCreate.svelte';
	import TableCreate from './TableCreate.svelte';
	import ViewCreate from './ViewCreate.svelte';
	import MobilePlayerPill from './MobilePlayerPill.svelte';
	import NavIcon from './NavIcon.svelte';
	import MailCreate from './MailCreate.svelte';
	import NewsletterCreate from './NewsletterCreate.svelte';
	import NoteCreate from './NoteCreate.svelte';
	import NowPlayingScreen from './NowPlayingScreen.svelte';
	import PlayerEngine from './PlayerEngine.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import SalesCreate from './SalesCreate.svelte';
	import SidebarPlayer from './SidebarPlayer.svelte';
	import TaskCreate from './TaskCreate.svelte';
	import PlaylistCreate from './PlaylistCreate.svelte';
	import TrackEdit from './TrackEdit.svelte';
	import UploadModal from './UploadModal.svelte';
	import WelcomeEdit from './WelcomeEdit.svelte';
	import PwaInstallBanner from './PwaInstallBanner.svelte';

	let { children } = $props();

	/** @type {HTMLDivElement | undefined} */
	let pillTrack = $state();
	/** @type {HTMLElement | undefined} */
	let listColEl = $state();
	/** 0 at rest → 1 after ~16px scroll (list-top fade veil) */
	let listFade = $state(0);
	let search = $state('');
	let createMenuOpen = $state(false);
	let filterOpen = $state(false);
	/** @type {string} */
	let filter = $state('all');

	const path = $derived($page.url.pathname);
	const tasksList = $derived(path.startsWith('/tasks'));

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	const showAccounts = $derived(canManageMembers(actor.email));
	const roleNav = $derived(navForRole(showAccounts));
	const roleMobileNav = $derived(mobileNavForRole(showAccounts));

	const activeItem = $derived.by(() => {
		const child = websiteChildren.find((item) => active(item.href));
		if (child) return child;
		const top = roleNav.find((item) => active(item.href));
		if (top) return top;
		if (active('/accounts')) return { href: '/accounts', label: 'Accounts', icon: 'accounts' };
		if (active('/settings')) return { href: '/settings', label: 'Settings', icon: 'settings' };
		return roleNav[0];
	});

	const websiteOpen = $derived(
		active('/website') || active('/publications') || websiteChildren.some((c) => active(c.href))
	);

	const activeHref = $derived(activeItem.href);

	const counts = $derived({
		tasks: tasks.length,
		projects: projects.length,
		notes: notes.length,
		enterprises: enterprises.length,
		ledger: ledgerEntries.length
	});

	const filteredNav = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return roleNav;
		return roleNav.filter((item) => item.label.toLowerCase().includes(q));
	});

	const createKind = $derived(
		'createKind' in activeItem
			? /** @type {'task' | 'project' | 'note' | 'newsletter' | 'ledger' | 'mail' | 'file' | undefined} */ (
					activeItem.createKind
				)
			: undefined
	);

	/** Clear detail only when the section path changes — never on search/query or re-renders. */
	let lastSectionPath = /** @type {string | null} */ (null);
	$effect(() => {
		const p = path;
		if (lastSectionPath === p) return;
		const first = lastSectionPath === null;
		lastSectionPath = p;
		/* Skip clear on first paint so deep links / child onMount selection survive. */
		if (!first) {
			forceClearSelection();
			filter = 'all';
			filterOpen = false;
			resetAccountingBrowse();
		}
		if (p.startsWith('/player')) {
			ensureDesktopPlayerDetail();
		} else {
			forceClosePlayerDetail();
		}
	});

	/** Full-width list (no detail column) — Planning needs the whole workspace. */
	const wideList = $derived(path.startsWith('/planning'));
	const mailList = $derived(path.startsWith('/mail'));
	const driveList = $derived(path.startsWith('/drive'));

	onMount(() =>
		bindDetailPopstate({
			onPlayer: () => forceClosePlayerDetail(),
			onSelection: () => forceClearSelection()
		})
	);

	/** @param {string} href */
	function go(href) {
		/* If a mobile detail layer is on the stack, replace it so Back from the
		 * next tab returns to that section’s root — not through the overlay. */
		const replace = Boolean(
			typeof history !== 'undefined' && history.state?.alphaLayer
		);
		forceClearSelection();
		forceClosePlayerDetail();
		goto(href, { replaceState: replace });
	}

	/** @param {'task' | 'project' | 'note' | 'newsletter' | 'ledger' | 'cost' | 'sales' | 'enterprise' | 'mail' | 'table' | 'metric' | 'form'} kind */
	function create(kind) {
		createMenuOpen = false;
		openComposer(kind);
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

	function onListPlus() {
		if (createKind === 'file') {
			requestDriveUpload();
			return;
		}
		if (createKind) openComposer(createKind);
		else createMenuOpen = true;
	}

	/** @param {string | undefined} kind */
	function onNavPlus(kind) {
		if (kind === 'file') {
			if (!path.startsWith('/drive')) go('/drive');
			requestDriveUpload();
			return;
		}
		if (kind) {
			openComposer(
				/** @type {'task' | 'project' | 'note' | 'newsletter' | 'ledger' | 'mail'} */ (kind)
			);
		}
	}

	async function centerActivePill() {
		await tick();
		const track = pillTrack;
		if (!track) return;
		const el = track.querySelector(`[data-href="${activeHref}"]`);
		if (!(el instanceof HTMLElement)) return;
		const left = el.offsetLeft - track.clientWidth / 2 + el.offsetWidth / 2;
		track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
	}

	$effect(() => {
		activeHref;
		if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
			centerActivePill();
		}
	});

	$effect(() => {
		path;
		const root = listColEl;
		return attachChromeScrollFade(root, (v) => {
			listFade = v;
		});
	});

	const hasMiniPlayer = $derived(Boolean(currentTrack()));
</script>

<div class="shell" class:has-mini-player={hasMiniPlayer} class:tasks-pad={tasksList}>
	<PwaInstallBanner />
	<PlayerEngine />
	<aside class="sidebar">
		<header class="side-top">
			<button type="button" class="pfp-btn" aria-label="Settings" onclick={() => go('/settings')}>
				<ProfilePic
					name={displayNameFromEmail()}
					email={actor.email}
					pictureUrl={pictureUrlFor(actor.email)}
					size={32}
				/>
			</button>
			<label class="search">
				<span class="sr-only">Search</span>
				<svg class="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M7 12.5A5.5 5.5 0 1 0 7 1.5a5.5 5.5 0 0 0 0 11Zm0 0L14 14.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
				<input type="search" placeholder="Search" bind:value={search} autocomplete="off" />
			</label>
			<div class="create-wrap">
				<button
					type="button"
					class="top-plus"
					aria-label="Create"
					aria-expanded={createMenuOpen}
					onclick={() => (createMenuOpen = !createMenuOpen)}
				>
					<svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
					</svg>
				</button>
				{#if createMenuOpen}
					<button
						type="button"
						class="menu-scrim"
						aria-label="Close"
						onclick={() => (createMenuOpen = false)}
					></button>
					<div class="create-menu" role="menu">
						<button type="button" role="menuitem" onclick={() => create('task')}>New task</button>
						<button type="button" role="menuitem" onclick={() => create('project')}>New project</button>
						<button type="button" role="menuitem" onclick={() => create('note')}>New note</button>
						<button type="button" role="menuitem" onclick={() => create('newsletter')}
							>New newsletter</button
						>
						<button type="button" role="menuitem" onclick={() => create('ledger')}
							>New ledger entry</button
						>
						<button type="button" role="menuitem" onclick={() => create('cost')}>New cost</button>
						<button type="button" role="menuitem" onclick={() => create('sales')}>New sales line</button>
						<button type="button" role="menuitem" onclick={() => create('enterprise')}
							>New enterprise</button
						>
					</div>
				{/if}
			</div>
		</header>

		<nav class="sidebar-nav" aria-label="Sections">
			{#each filteredNav as item (item.href)}
				{@const count = item.countKey ? counts[item.countKey] : null}
				{@const isWebsite = item.href === '/website'}
				{@const rowActive = isWebsite ? websiteOpen : active(item.href)}
				<div
					class="nav-row"
					class:active={rowActive}
					class:creatable={Boolean(item.createKind)}
				>
					<button
						type="button"
						class="nav-item"
						class:active={rowActive}
						onclick={() => go(item.href)}
					>
						<span class="icon-wrap"><NavIcon name={item.icon} size={18} /></span>
						<span class="nav-label">{item.label}</span>
					</button>
					{#if item.createKind || count != null}
						<span class="row-end">
							{#if count != null}
								<span class="count">{count}</span>
							{/if}
							{#if item.createKind}
								<button
									type="button"
									class="row-plus"
									aria-label={item.createKind === 'file' ? 'Upload file' : `New ${item.createKind}`}
									onclick={() => onNavPlus(item.createKind)}
								>
									<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
										<path
											d="M6 1.5v9M1.5 6h9"
											stroke="currentColor"
											stroke-width="1.6"
											stroke-linecap="round"
										/>
									</svg>
								</button>
							{/if}
						</span>
					{/if}
				</div>
			{/each}
		</nav>

		<SidebarPlayer />
	</aside>

	<div class="workspace-wrap">
		<div class="workspace">
			<section
				class="list-col"
				class:wide={wideList}
				aria-label={activeItem.label}
				bind:this={listColEl}
			>
				<header
					class="list-top"
					class:planning-top={wideList}
					class:mail-top={mailList}
					style="--chrome-scroll-fade: {listFade}"
				>
					{#if mailList}
						<div class="mail-title-stack">
							<div class="mail-top-row">
								<div class="zoom-seg mail-folder-seg" role="group" aria-label="Mailbox">
									{#each MAIL_FOLDERS as f (f)}
										<button
											type="button"
											class:on={mailView.folder === f}
											onclick={() => setMailFolder(f)}
										>{MAIL_FOLDER_LABELS[f]}</button
										>
									{/each}
								</div>
								<SyncProgressBar variant="inline" class="mail-sync desktop-mail-sync" />
							</div>
							<SyncProgressBar variant="under" class="mobile-sync-bar" />
						</div>
					{:else}
						<div class="list-title-row desktop-only-title">
							<h1 class="list-title" class:planning-title={wideList}>{activeItem.label}</h1>
							<SyncProgressBar variant="inline" />
						</div>
						<div class="mobile-page-title">
							<span class="mobile-title-stack">
								<h1 class="mobile-page-name">{activeItem.label}</h1>
								<SyncProgressBar variant="under" class="mobile-sync-bar" />
							</span>
						</div>
					{/if}
					<div class="list-actions">
						{#if wideList}
							<div class="zoom-seg" role="group" aria-label="Timeframe">
								{#each PLANNING_ZOOMS as z (z)}
									<button
										type="button"
										class:on={planningView.zoom === z}
										onclick={() => setPlanningZoom(z)}
									>{PLANNING_ZOOM_LABELS[z]}</button
									>
								{/each}
							</div>
						{:else if mailList || driveList}
							{#if createKind}
								<button
									type="button"
									class="chrome-btn list-plus"
									aria-label={createKind === 'file' ? 'Upload file' : `New ${createKind}`}
									onclick={onListPlus}
								>
									<svg class="chrome-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
										<path
											d="M8 3.25v9.5M3.25 8h9.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
									</svg>
								</button>
							{/if}
						{:else}
							<div class="filter-wrap">
								<button
									type="button"
									class="chrome-btn"
									class:on={filter !== 'all'}
									aria-label="Filter"
									aria-expanded={filterOpen}
									aria-haspopup="listbox"
									onclick={() => (filterOpen = !filterOpen)}
								>
									<svg class="chrome-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
										<path
											d="M2.5 4h11M4.5 8h7M6.5 12h3"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
									</svg>
								</button>
								{#if filterOpen}
									<button
										type="button"
										class="menu-scrim"
										aria-label="Close filter"
										onclick={() => (filterOpen = false)}
									></button>
									<div class="filter-menu" role="listbox">
										<button
											type="button"
											class:on={filter === 'all'}
											onclick={() => {
												filter = 'all';
												filterOpen = false;
											}}>All</button
										>
										<button
											type="button"
											class:on={filter === 'open'}
											onclick={() => {
												filter = 'open';
												filterOpen = false;
											}}>Open</button
										>
										<button
											type="button"
											class:on={filter === 'done'}
											onclick={() => {
												filter = 'done';
												filterOpen = false;
											}}>Done</button
										>
									</div>
								{/if}
							</div>
							{#if createKind}
								<button
									type="button"
									class="chrome-btn list-plus"
									aria-label="New {createKind}"
									onclick={onListPlus}
								>
									<svg class="chrome-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
										<path
											d="M8 3.25v9.5M3.25 8h9.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
									</svg>
								</button>
							{/if}
						{/if}
					</div>
				</header>
				<PullToRefresh onRefresh={() => refreshAllDrive()}>
					<div class="pane-inner">
						{@render children()}
					</div>
				</PullToRefresh>
				<div class="list-bottom-fade" aria-hidden="true"></div>
			</section>
			{#if !wideList}
				<DetailColumn />
			{/if}
		</div>
	</div>

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
	<TrackEdit />
	<PlaylistCreate />
	<UploadModal />

	<MobilePlayerPill />
	<NowPlayingScreen />

	<nav class="bottom-pill" aria-label="Sections">
		<div class="pill-inner">
			<div class="pill-track" bind:this={pillTrack}>
				{#each roleMobileNav as item (item.href)}
					<button
						type="button"
						class="pill-item"
						class:on={active(item.href)}
						data-href={item.href}
						aria-label={item.label}
						aria-current={active(item.href) ? 'page' : undefined}
						onclick={() => go(item.href)}
					>
						<span class="pill-icon"><NavIcon name={item.icon} size={22} /></span>
						<span class="pill-label">{item.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</nav>
</div>

<style>
	.shell {
		/* Pad ≈ control row; fade is short/soft so content stays readable until the bar */
		/* Clears the solid control row; fade veil is scroll-driven */
		--feed-pad-top: 44px;
		--feed-pad-bottom: 36px;
		--chrome-fade: var(--bg);
		--chrome-scroll-fade: 0;
		display: flex;
		/* --app-height tracks visualViewport so the keyboard shrinks the app */
		height: var(--app-height, 100dvh);
		max-height: var(--app-height, 100dvh);
		width: 100%;
		overflow: hidden;
		background: var(--shell);
	}

	.sidebar {
		width: var(--side);
		flex-shrink: 0;
		padding: 17px 16px 12px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		gap: 10px;
		background: var(--shell);
		color: var(--white);
	}

	.side-top {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
		padding: 2px 0 4px;
	}

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

	.search {
		flex: 1;
		min-width: 0;
		height: 32px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		border: 1px solid var(--white16);
		border-radius: 12px;
		background: transparent;
		color: var(--white33);
		box-sizing: border-box;
	}

	.search-icon {
		flex-shrink: 0;
	}

	.search input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		background: transparent;
		color: var(--white);
		font: inherit;
		font-size: 13px;
		outline: none;
	}

	.search input::placeholder {
		color: var(--white33);
	}

	.create-wrap,
	.filter-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.top-plus {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 12px;
		background: var(--nav-plus-bg);
		color: var(--nav-plus-fg);
		cursor: pointer;
		padding: 0;
		box-sizing: border-box;
	}

	.top-plus:hover {
		color: var(--white);
		background: var(--white8);
	}

	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.create-menu,
	.filter-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 50;
		min-width: 168px;
		padding: 0;
		border: 1px solid var(--glass-border);
		border-radius: 12px;
		background: var(--glass);
		overflow: hidden;
		box-shadow: 0 8px 28px color-mix(in srgb, var(--fg-raw) 18%, transparent);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.create-menu button,
	.filter-menu button {
		display: block;
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

	.create-menu button:not(:last-child),
	.filter-menu button:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.create-menu button:hover,
	.filter-menu button:hover,
	.filter-menu button.on {
		background: var(--fg-4);
		color: var(--fg);
	}

	.filter-menu button.on {
		font-weight: 600;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.nav-row {
		position: relative;
		display: flex;
		align-items: center;
		border-radius: 999px;
		overflow: hidden;
	}

	.nav-row:hover {
		background: var(--white4);
	}

	.nav-row.active {
		border: 1px solid transparent;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.nav-row.active .nav-item {
		color: var(--white);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
		padding: 8px 10px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--white66);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.nav-item.active {
		color: var(--white);
	}

	.nav-sub {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 2px 8px 8px 36px;
	}

	.nav-sub-item {
		display: block;
		width: 100%;
		padding: 6px 10px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--white66);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.nav-sub-item:hover {
		background: var(--fg-4);
		color: var(--white);
	}

	.nav-sub-item.active {
		background: var(--fg-4);
		color: var(--white);
	}

	.nav-row.creatable .nav-item,
	.nav-row:has(.row-end) .nav-item {
		padding-right: 36px;
	}

	.icon-wrap {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: inherit;
	}

	.nav-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-end {
		position: absolute;
		right: 6px;
		top: 50%;
		width: 24px;
		height: 24px;
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	.count,
	.row-plus {
		grid-area: 1 / 1;
	}

	.count {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		margin: 0;
		padding: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 12px;
		font-weight: 500;
		font-style: normal;
		line-height: 1;
		letter-spacing: 0;
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		color: var(--white33);
		text-align: center;
		transition: opacity 0.22s var(--ease);
	}

	.nav-row.active .count {
		color: var(--white66);
	}

	.row-plus {
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--nav-plus-fg);
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		opacity: 0;
		pointer-events: none;
		box-sizing: border-box;
		transition:
			opacity 0.22s var(--ease),
			color 0.15s ease,
			background 0.15s ease;
	}

	.nav-row.creatable:hover .count,
	.nav-row.creatable:focus-within .count {
		opacity: 0;
	}

	.nav-row.creatable:hover .row-plus,
	.nav-row.creatable:focus-within .row-plus {
		opacity: 1;
		pointer-events: auto;
	}

	.row-plus:hover {
		color: var(--white);
		background: var(--white8);
	}

	.workspace-wrap {
		flex: 1;
		min-width: 0;
		min-height: 0;
		padding: 12px 12px 12px 0;
		box-sizing: border-box;
		display: flex;
	}

	.workspace {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: row;
		align-items: stretch;
		overflow: hidden;
		border-radius: 20px;
		/* Follows theme page bg (#121212-ish dark / soft light) */
		background: var(--bg);
		border: 1px solid var(--hairline);
		color: var(--white);
	}

	.list-col {
		position: relative;
		flex: 0 0 var(--list);
		width: var(--list);
		min-width: 280px;
		min-height: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--hairline);
		overflow: hidden;
	}

	.list-col.wide {
		flex: 1 1 auto;
		width: auto;
		min-width: 0;
		border-right: 0;
	}


	/* Floating header — solid control row; fade veil only as content scrolls under */
	.list-top {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 6;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		/* Control row ~48px; extra height is the scroll-driven fade zone */
		height: 72px;
		padding: 0 10px 0 16px;
		border-bottom: none;
		box-sizing: border-box;
		pointer-events: none;
		background: transparent;
	}

	/* Solid only to bar mid — buttons keep their own glass; avoids full opaque past midline */
	.list-top::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 24px;
		background: var(--chrome-fade);
		pointer-events: none;
		z-index: -1;
	}

	/* Three-stop fade: solid top → ~80% at control-row mid (24px) → clear */
	.list-top::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 72px;
		background: linear-gradient(
			to bottom,
			var(--chrome-fade) 0%,
			color-mix(in srgb, var(--chrome-fade) 80%, transparent) 24px,
			transparent 100%
		);
		opacity: var(--chrome-scroll-fade, 0);
		pointer-events: none;
		z-index: -1;
	}

	@media (min-width: 768px) {
		.list-top > .list-title-row,
		.list-top > .mail-title-stack,
		.list-top > .mail-top-row,
		.list-top > .list-actions,
		.list-top > .zoom-seg {
			height: 48px;
			display: flex;
			align-items: center;
		}
	}

	.list-top > * {
		pointer-events: auto;
	}

	.list-bottom-fade {
		display: none;
		pointer-events: none;
	}

	.list-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.list-title {
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--white33);
	}

	.mobile-page-title {
		display: none;
	}

	/* Sit over Planning’s fixed label column */
	.list-title.planning-title {
		width: 200px;
		max-width: 200px;
		box-sizing: border-box;
		padding-right: 8px;
	}

	.list-top.planning-top {
		padding-left: 16px;
		/* Merge visually with Planning’s sticky head row */
		background: transparent;
		z-index: 8;
	}

	.list-top.planning-top::before,
	.list-top.planning-top::after {
		display: none;
	}

	/* Tasks keep prior feed offset; other feeds sit ~4px higher */
	.shell.tasks-pad {
		--feed-pad-top: 48px;
	}

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
		position: relative;
		z-index: 2;
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

	.list-top.mail-top {
		gap: 10px;
	}

	.mail-title-stack {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.mail-top-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.mail-folder-seg {
		flex: 1;
		min-width: 0;
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.mail-title-stack :global(.mobile-sync-bar) {
		display: none;
		align-self: center;
	}

	.mail-folder-seg::-webkit-scrollbar {
		display: none;
	}

	.mail-folder-seg button {
		padding: 0 8px;
		white-space: nowrap;
	}

	.list-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	/* Desktop: 28px squared chrome (between prior 26 and nav 32); circles mobile-only */
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
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.15s var(--ease);
	}

	.chrome-btn:hover,
	.chrome-btn.on,
	.chrome-btn[aria-expanded='true'] {
		transform: scale(1.06);
	}

	.chrome-btn:active {
		transform: scale(0.96);
	}

	.chrome-ico {
		display: block;
		width: 16px;
		height: 16px;
	}

	.pane {
		flex: 1;
		min-width: 0;
		min-height: 0;
		/* Scroll on .feed so rows pass under absolute chrome fades */
		overflow: hidden;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.pane :global(.ptr) {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.pane-inner {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.bottom-pill {
		display: none;
	}

	@media (max-width: 767px) {
		/* Full-bleed shell — darker than desktop workspace; matches desktop sidebar */
		.shell {
			--chrome-fade: var(--shell);
			/* +4px vs prior so feed clears the floating bar with a little air */
			--feed-pad-top: calc(52px + env(safe-area-inset-top, 0px));
			--feed-pad-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
			flex-direction: column;
			padding-bottom: 0;
			background: var(--shell);
		}

		.shell.tasks-pad {
			--feed-pad-top: calc(56px + env(safe-area-inset-top, 0px));
		}

		.shell.has-mini-player {
			--feed-pad-bottom: calc(156px + env(safe-area-inset-bottom, 0px));
			padding-bottom: 0;
		}

		.sidebar {
			display: none;
		}

		.workspace-wrap {
			padding: 0;
		}

		.workspace {
			border-radius: 0;
			border: 0;
			background: var(--shell);
		}

		.list-col {
			flex: 1;
			width: 100%;
			max-width: none;
			min-width: 0;
			border-right: 0;
			background: var(--shell);
		}

		.list-top {
			height: calc(88px + env(safe-area-inset-top, 0px));
			padding: calc(6px + env(safe-area-inset-top, 0px)) 14px 34px 18px;
			align-items: center;
			background: transparent;
		}

		/* Solid to vertical center of the 44px chrome buttons (pad-top 6 + 22) */
		.list-top::before {
			height: calc(28px + env(safe-area-inset-top, 0px));
		}

		.list-top::after {
			top: 0;
			height: 100%;
			background: linear-gradient(
				to bottom,
				var(--chrome-fade) 0%,
				color-mix(in srgb, var(--chrome-fade) 80%, transparent)
					calc(28px + env(safe-area-inset-top, 0px)),
				transparent 100%
			);
		}

		/* Soft veil — three-stop; mid ≈ bottom-nav center */
		.list-bottom-fade {
			display: block;
			position: absolute;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 5;
			height: calc(88px + env(safe-area-inset-bottom, 0px));
			background: linear-gradient(
				to top,
				color-mix(in srgb, var(--chrome-fade) 90%, transparent) 0%,
				color-mix(in srgb, var(--chrome-fade) 80%, transparent) 50%,
				transparent 100%
			);
		}

		.desktop-only-title {
			display: none;
		}

		.mobile-page-title {
			display: flex;
			align-items: center;
			align-self: center;
			min-width: 0;
			flex: 1;
			height: 44px;
		}

		.mobile-title-stack {
			position: relative;
			display: flex;
			flex-direction: column;
			align-items: stretch;
			justify-content: center;
			min-width: 0;
			flex: 1;
			height: 44px;
		}

		.mobile-page-name {
			margin: 0;
			min-width: 0;
			font-family: 'Inter', var(--font), system-ui, sans-serif;
			font-size: 22px;
			font-weight: 700;
			letter-spacing: -0.02em;
			line-height: 1.1;
			color: var(--fg);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		:global(.mobile-sync-bar) {
			position: absolute;
			left: 50%;
			top: calc(100% + 4px);
			transform: translateX(-50%);
			align-self: center;
		}

		.mail-title-stack :global(.mobile-sync-bar) {
			display: block;
			position: static;
			transform: none;
			left: auto;
			top: auto;
		}

		.mail-title-stack :global(.desktop-mail-sync) {
			display: none;
		}

		.list-actions {
			gap: 8px;
		}

		.chrome-btn {
			width: 44px;
			height: 44px;
			border-radius: 9999px;
			border: 1px solid transparent;
			background:
				linear-gradient(var(--glass), var(--glass)) padding-box,
				var(--glass-shine) border-box;
			color: var(--fg-66);
			backdrop-filter: blur(var(--glass-blur));
			-webkit-backdrop-filter: blur(var(--glass-blur));
		}

		.chrome-btn:hover,
		.chrome-btn.on,
		.chrome-btn[aria-expanded='true'] {
			transform: scale(1.04);
		}

		.chrome-ico {
			width: 22px;
			height: 22px;
		}

		.pane {
			padding: 0;
		}

		.bottom-pill {
			display: block;
			position: fixed;
			z-index: 40;
			left: 0;
			right: 0;
			bottom: 0;
			padding: 0 12px calc(10px + env(safe-area-inset-bottom, 0px));
			pointer-events: none;
		}

		.pill-inner {
			pointer-events: auto;
			max-width: 100%;
			margin: 0 auto;
			border-radius: 999px;
			border: 1px solid var(--glass-border);
			background: var(--glass-panel);
			box-shadow: 0 8px 28px var(--shadow-strong);
			overflow: hidden;
			backdrop-filter: blur(var(--glass-blur));
			-webkit-backdrop-filter: blur(var(--glass-blur));
		}

		.pill-track {
			display: flex;
			align-items: stretch;
			gap: 0;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			scrollbar-width: none;
			-ms-overflow-style: none;
			padding: 6px 8px;
			scroll-padding-inline: 40%;
		}

		.pill-track::-webkit-scrollbar {
			display: none;
		}

		.pill-item {
			scroll-snap-align: center;
			flex: 0 0 auto;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 2px;
			min-width: 64px;
			padding: 6px 10px;
			border: 0;
			border-radius: 999px;
			background: transparent;
			color: var(--white33);
			cursor: pointer;
		}

		.pill-item.on {
			color: var(--white);
			background: var(--white8);
		}

		.pill-icon {
			display: flex;
			width: 24px;
			height: 24px;
			align-items: center;
			justify-content: center;
		}

		.pill-icon :global(svg) {
			display: block;
			max-width: 22px;
			max-height: 20px;
		}

		.pill-label {
			font-size: 9px;
			font-weight: 500;
			letter-spacing: 0.02em;
			max-width: 4.5rem;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
</style>
