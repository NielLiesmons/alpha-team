<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { mobileNav, primaryNav, space } from '$lib/sections.js';
	import { notes, openComposer, projects, tasks } from '$lib/workspace.svelte.js';
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

	const path = $derived($page.url.pathname);

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	const activeHref = $derived(
		primaryNav.find((item) => active(item.href))?.href ??
			(active('/settings') ? '/settings' : '/dashboard')
	);

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
			<button
				type="button"
				class="pfp-btn"
				aria-label="Settings"
				onclick={() => go('/settings')}
			>
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
					<button type="button" class="menu-scrim" aria-label="Close" onclick={() => (createMenuOpen = false)}
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
						{#if count != null}
							<span class="count">{count}</span>
						{/if}
					</button>
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
				</div>
			{/each}
		</nav>

		<div class="brand-panel">
			<p class="brand-name">{space.name}</p>
			<p class="brand-desc">{space.description}</p>
			<a class="brand-open" href={space.siteUrl} target="_blank" rel="noopener noreferrer">Open site</a>
		</div>
	</aside>

	<div class="content">
		<div class="pane">
			{@render children()}
		</div>
		<DetailColumn />
	</div>

	<TaskCreate />
	<ProjectCreate />
	<NoteCreate />

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
		background: var(--black);
	}

	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		gap: 10px;
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

	.create-wrap {
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
		background: var(--popover);
		color: var(--white66);
		cursor: pointer;
		padding: 0;
	}

	.top-plus:hover {
		color: var(--white);
	}

	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.create-menu {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 50;
		min-width: 160px;
		padding: 4px;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
	}

	.create-menu button {
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

	.create-menu button:hover {
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
		border-radius: 8px;
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
		/* 2px less left than previous 12px */
		padding: 8px 10px 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--white66);
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.nav-row.creatable .nav-item {
		/* Room for count; matches vertical pad rhythm on the right */
		padding-right: 8px;
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

	.count {
		flex-shrink: 0;
		min-width: 1.25rem;
		padding: 0 2px;
		font-size: 12px;
		font-weight: 500;
		color: var(--white33);
		text-align: right;
		font-variant-numeric: tabular-nums;
		transition:
			opacity 0.22s var(--ease),
			transform 0.22s var(--ease);
	}

	.row-plus {
		position: absolute;
		right: 8px;
		top: 50%;
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: var(--popover);
		color: var(--white66);
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		opacity: 0;
		transform: translate(10px, -50%);
		pointer-events: none;
		transition:
			opacity 0.22s var(--ease),
			transform 0.22s var(--ease),
			color 0.15s ease,
			background 0.15s ease;
	}

	.nav-row.creatable:hover .count,
	.nav-row.creatable:focus-within .count {
		opacity: 0;
		transform: translateX(-6px);
	}

	.nav-row.creatable:hover .row-plus,
	.nav-row.creatable:focus-within .row-plus {
		opacity: 1;
		transform: translate(0, -50%);
		pointer-events: auto;
	}

	.row-plus:hover {
		color: var(--white);
		background: var(--white8);
	}

	.brand-panel {
		flex-shrink: 0;
		margin-top: auto;
		padding: 14px;
		border: 1px solid var(--hairline);
		border-radius: 16px;
		background: var(--surface);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.brand-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--white);
	}

	.brand-desc {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--white33);
	}

	.brand-open {
		margin-top: 0.45rem;
		align-self: flex-start;
		height: 30px;
		padding: 0 12px;
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		border: 1px solid var(--hairline);
		background: transparent;
		color: var(--white66);
		font-size: 13px;
		font-weight: 550;
		text-decoration: none;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}

	.brand-open:hover {
		color: var(--white);
		background: var(--white4);
	}

	.content {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: row;
		align-items: stretch;
		overflow: hidden;
		border-left: 1px solid var(--shell-border);
	}

	.content :global(.pane) {
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
		}

		.sidebar {
			display: none;
		}

		.content {
			border-left: none;
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
			box-shadow: 0 8px 28px color-mix(in srgb, var(--ink-raw) 35%, transparent);
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
