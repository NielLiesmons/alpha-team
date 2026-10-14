<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { mobileNav, primaryNav, space } from '$lib/sections.js';
	import {
		clearSelection,
		notes,
		openComposer,
		projects,
		tasks
	} from '$lib/workspace.svelte.js';
	import { tick } from 'svelte';
	import DetailColumn from './DetailColumn.svelte';
	import NavIcon from './NavIcon.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import NoteCreate from './NoteCreate.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import TaskCreate from './TaskCreate.svelte';

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
		notes: notes.length
	});

	const filteredNav = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return primaryNav;
		return primaryNav.filter((item) => item.label.toLowerCase().includes(q));
	});

	const createKind = $derived(
		'createKind' in activeItem ? /** @type {'task' | 'project' | 'note' | undefined} */ (activeItem.createKind) : undefined
	);

	/** Clear detail whenever the section changes — never carry a Task into Mail, etc. */
	$effect(() => {
		path;
		clearSelection();
		filter = 'all';
		filterOpen = false;
	});

	/** @param {string} href */
	function go(href) {
		goto(href);
	}

	/** @param {'task' | 'project' | 'note'} kind */
	function create(kind) {
		createMenuOpen = false;
		openComposer(kind);
		if (kind === 'task') go('/tasks');
		else if (kind === 'project') go('/projects');
		else if (kind === 'note') go('/notes');
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
</script>

<div class="shell">
	<aside class="sidebar">
		<header class="side-top">
			<button type="button" class="pfp-btn" aria-label="Settings" onclick={() => go('/settings')}>
				<ProfilePic name="Niel" size={32} />
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
									onclick={() => openComposer(/** @type {'task' | 'project' | 'note'} */ (item.createKind))}
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

		<div class="brand-panel">
			<div class="brand-media" aria-hidden="true">
				<picture>
					<source srcset="/space-cover.webp" type="image/webp" />
					<img src="/space-cover.jpg" alt="" width="800" height="800" />
				</picture>
			</div>
			<div class="brand-scrim" aria-hidden="true"></div>
			<div class="brand-copy">
				<p class="brand-name">{space.name}</p>
				<p class="brand-desc">{space.description}</p>
				<a class="brand-open" href={space.siteUrl} target="_blank" rel="noopener noreferrer">
					Website
					<svg class="brand-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path
							d="M3.5 8.5 8.5 3.5M4.25 3.5H8.5V7.75"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
			</div>
		</div>
	</aside>

	<div class="workspace-wrap">
		<div class="workspace" class:player-layout={active( '/player')}>
			<section class="list-col" aria-label={activeItem.label}>
				<header class="list-top">
					<h1 class="list-title">{activeItem.label}</h1>
					<div class="list-actions">
						<div class="filter-wrap">
							<button
								type="button"
								class="filter-btn"
								class:on={filter !== 'all'}
								aria-label="Filter"
								aria-expanded={filterOpen}
								aria-haspopup="listbox"
								onclick={() => (filterOpen = !filterOpen)}
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
					</div>
				</header>
				<div class="pane">
					{@render children()}
				</div>
			</section>
			<DetailColumn />
		</div>
	</div>

	<TaskCreate />
	<ProjectCreate />
	<NoteCreate />

	<button type="button" class="mobile-fab" aria-label="Create" onclick={onListPlus}>
		<svg width="22" height="22" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
		</svg>
	</button>

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

	.mobile-fab {
		display: none;
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
		top: calc(100% + 8px);
		right: 0;
		z-index: 50;
		min-width: 148px;
		padding: 4px;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
	}

	.create-menu button,
	.filter-menu button {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--white66);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.create-menu button:hover,
	.filter-menu button:hover,
	.filter-menu button.on {
		background: var(--white8);
		color: var(--white);
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
		background: var(--white8);
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
		font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
		font-size: 12px;
		font-weight: 500;
		font-style: normal;
		line-height: 1;
		letter-spacing: 0;
		color: var(--white33);
		text-align: center;
		font-synthesis: none;
		font-variant-numeric: normal;
		font-feature-settings: normal;
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

	.brand-panel {
		position: relative;
		isolation: isolate;
		flex-shrink: 0;
		margin-top: auto;
		min-height: 132px;
		padding: 14px;
		border: 1px solid color-mix(in srgb, #fff 12%, transparent);
		border-radius: 16px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.35rem;
	}

	.brand-media {
		position: absolute;
		inset: 0;
		z-index: 0;
		opacity: 0.42;
	}

	.brand-media picture,
	.brand-media img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center 35%;
		filter: blur(6px) saturate(0.85) brightness(0.72);
		transform: scale(1.06);
	}

	.brand-scrim {
		position: absolute;
		inset: 0;
		z-index: 1;
		background: linear-gradient(
			to top,
			color-mix(in srgb, #000 92%, transparent) 0%,
			color-mix(in srgb, #000 72%, transparent) 48%,
			color-mix(in srgb, #000 55%, transparent) 100%
		);
	}

	.brand-copy {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.brand-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #fff;
	}

	.brand-desc {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: color-mix(in srgb, #fff 66%, transparent);
	}

	.brand-open {
		margin-top: 0.35rem;
		align-self: flex-start;
		height: 30px;
		padding: 0 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, #fff 18%, transparent);
		background: color-mix(in srgb, #fff 8%, transparent);
		color: #fff;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 550;
		text-decoration: none;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	.brand-arrow {
		display: block;
		flex-shrink: 0;
	}

	.brand-open:hover {
		background: color-mix(in srgb, #fff 14%, transparent);
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
		flex: 0 0 var(--list);
		width: var(--list);
		min-width: 280px;
		min-height: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--hairline);
		overflow: hidden;
	}

	/* Player: narrow browse rail, wide library + now-playing */
	.workspace.player-layout .list-col {
		flex-basis: 220px;
		width: 220px;
		min-width: 200px;
	}

	.list-top {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		height: 40px;
		padding: 0 8px 0 16px;
		border-bottom: 1px solid var(--hairline);
		box-sizing: border-box;
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
		gap: 4px;
	}

	.filter-btn {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--white33);
		cursor: pointer;
		box-sizing: border-box;
	}

	.filter-btn:hover,
	.filter-btn.on,
	.filter-btn[aria-expanded='true'] {
		color: var(--white);
		background: var(--white4);
	}

	.pane {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: auto;
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
		.shell {
			flex-direction: column;
			padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
			background: var(--bg);
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
		}

		.list-col {
			flex: 1;
			width: 100%;
			max-width: none;
			min-width: 0;
			border-right: 0;
		}

		.mobile-fab {
			display: grid;
			place-items: center;
			position: fixed;
			z-index: 45;
			right: 16px;
			bottom: calc(78px + env(safe-area-inset-bottom, 0px));
			width: 56px;
			height: 56px;
			padding: 0;
			border: 0;
			border-radius: 999px;
			background: var(--accent);
			color: #fff;
			box-shadow: 0 10px 28px var(--shadow-strong);
			cursor: pointer;
		}

		.mobile-fab:hover {
			filter: brightness(1.06);
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
			background: var(--modal-bg);
			border: 1px solid var(--hairline);
			box-shadow: 0 8px 28px var(--shadow-strong);
			overflow: hidden;
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
