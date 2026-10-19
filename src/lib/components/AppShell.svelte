<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { mobileNav, primaryNav } from '$lib/sections.js';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
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
	import { bindDetailPopstate } from '$lib/nav-stack.js';
	import ActivityCreate from './ActivityCreate.svelte';
	import DetailColumn from './DetailColumn.svelte';
	import LedgerCreate from './LedgerCreate.svelte';
	import MobilePlayerPill from './MobilePlayerPill.svelte';
	import NavIcon from './NavIcon.svelte';
	import NewsletterCreate from './NewsletterCreate.svelte';
	import NoteCreate from './NoteCreate.svelte';
	import NowPlayingScreen from './NowPlayingScreen.svelte';
	import PlayerEngine from './PlayerEngine.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import SidebarPlayer from './SidebarPlayer.svelte';
	import TaskCreate from './TaskCreate.svelte';
	import PlaylistCreate from './PlaylistCreate.svelte';
	import TrackEdit from './TrackEdit.svelte';
	import UploadModal from './UploadModal.svelte';
	import WelcomeEdit from './WelcomeEdit.svelte';

	let { children } = $props();

	/** @type {HTMLDivElement | undefined} */
	let pillTrack = $state();
	let search = $state('');
	let createMenuOpen = $state(false);
	let filterOpen = $state(false);
	/** @type {string} */
	let filter = $state('all');

	const path = $derived($page.url.pathname);

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	const activeItem = $derived(
		primaryNav.find((item) => active(item.href)) ??
			(active('/settings')
				? { href: '/settings', label: 'Settings', icon: 'settings' }
				: primaryNav[0])
	);

	const activeHref = $derived(activeItem.href);

	const counts = $derived({
		tasks: tasks.length,
		projects: projects.length,
		notes: notes.length,
		ledger: ledgerEntries.length
	});

	const filteredNav = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return primaryNav;
		return primaryNav.filter((item) => item.label.toLowerCase().includes(q));
	});

	const createKind = $derived(
		'createKind' in activeItem
			? /** @type {'task' | 'project' | 'note' | 'newsletter' | 'ledger' | undefined} */ (
					activeItem.createKind
				)
			: undefined
	);

	/** Clear detail whenever the section changes — never carry a Task into Mail, etc. */
	$effect(() => {
		const p = path;
		forceClearSelection();
		filter = 'all';
		filterOpen = false;
		if (p.startsWith('/player')) {
			ensureDesktopPlayerDetail();
		} else {
			forceClosePlayerDetail();
		}
	});

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

	/** @param {'task' | 'project' | 'note' | 'newsletter' | 'ledger' | 'activity'} kind */
	function create(kind) {
		createMenuOpen = false;
		openComposer(kind);
		if (kind === 'task') go('/tasks');
		else if (kind === 'project') go('/projects');
		else if (kind === 'note') go('/notes');
		else if (kind === 'newsletter') go('/publications');
		else if (kind === 'ledger' || kind === 'activity') go('/accounting');
	}

	function onListPlus() {
		if (createKind) openComposer(createKind);
		else createMenuOpen = true;
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

	const hasMiniPlayer = $derived(Boolean(currentTrack()));
</script>

<div class="shell" class:has-mini-player={hasMiniPlayer}>
	<PlayerEngine />
	<aside class="sidebar">
		<header class="side-top">
			<button type="button" class="pfp-btn" aria-label="Settings" onclick={() => go('/settings')}>
				<ProfilePic name={displayNameFromEmail()} size={32} />
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
						<button type="button" role="menuitem" onclick={() => create('activity')}
							>New activity</button
						>
					</div>
				{/if}
			</div>
		</header>

		<nav class="sidebar-nav" aria-label="Sections">
			{#each filteredNav as item (item.href)}
				{@const count = item.countKey ? counts[item.countKey] : null}
				<div class="nav-row" class:active={active(item.href)} class:creatable={Boolean(item.createKind)}>
					<button type="button" class="nav-item" onclick={() => go(item.href)}>
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
									aria-label="New {item.createKind}"
									onclick={() =>
										openComposer(
											/** @type {'task' | 'project' | 'note' | 'newsletter' | 'ledger'} */ (
												item.createKind
											)
										)}
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
			<section class="list-col" aria-label={activeItem.label}>
				<header class="list-top">
					<h1 class="list-title">{activeItem.label}</h1>
					<div class="list-actions">
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
					</div>
				</header>
				<div class="pane">
					{@render children()}
				</div>
				<div class="list-bottom-fade" aria-hidden="true"></div>
			</section>
			<DetailColumn />
		</div>
	</div>

	<TaskCreate />
	<ProjectCreate />
	<NoteCreate />
	<LedgerCreate />
	<ActivityCreate />
	<NewsletterCreate />
	<WelcomeEdit />
	<TrackEdit />
	<PlaylistCreate />
	<UploadModal />

	<MobilePlayerPill />
	<NowPlayingScreen />

	<nav class="bottom-pill" aria-label="Sections">
		<div class="pill-inner">
			<div class="pill-track" bind:this={pillTrack}>
				{#each mobileNav as item (item.href)}
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
		--feed-pad-top: 48px;
		--feed-pad-bottom: 36px;
		--chrome-fade: var(--bg);
		display: flex;
		height: 100dvh;
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
		font-family: var(--font);
		font-size: 12px;
		font-weight: 500;
		font-style: normal;
		line-height: 1;
		letter-spacing: 0;
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

	/* Floating header — soft short fade (not a solid veil over the list) */
	.list-top {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 6;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		height: 48px;
		padding: 0 10px 0 16px;
		border-bottom: none;
		box-sizing: border-box;
		pointer-events: none;
		background: linear-gradient(
			to bottom,
			var(--chrome-fade) 0%,
			color-mix(in srgb, var(--chrome-fade) 55%, transparent) 50%,
			transparent 100%
		);
	}

	.list-top > * {
		pointer-events: auto;
	}

	.list-bottom-fade {
		display: none;
		pointer-events: none;
	}

	.list-title {
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--white33);
	}

	.list-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	/* Desktop: squared chrome — circles are mobile-only; hover = scale only */
	.chrome-btn {
		width: 26px;
		height: 26px;
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
			--feed-pad-top: calc(56px + env(safe-area-inset-top, 0px));
			--feed-pad-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
			flex-direction: column;
			padding-bottom: 0;
			background: var(--shell);
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
			background: linear-gradient(
				to bottom,
				var(--chrome-fade) 0%,
				color-mix(in srgb, var(--chrome-fade) 75%, transparent) 42%,
				color-mix(in srgb, var(--chrome-fade) 28%, transparent) 72%,
				transparent 100%
			);
		}

		/* Soft veil only — keep content readable through glass bottom nav */
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
				color-mix(in srgb, var(--chrome-fade) 55%, transparent) 0%,
				color-mix(in srgb, var(--chrome-fade) 22%, transparent) 48%,
				transparent 100%
			);
		}

		.list-title {
			font-size: 30px;
			font-weight: 700;
			letter-spacing: -0.03em;
			line-height: 1.1;
			color: var(--fg);
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
