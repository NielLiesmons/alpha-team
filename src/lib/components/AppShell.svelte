<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { primaryNav, space } from '$lib/sections.js';
	import { notes, openComposer, projects, ui } from '$lib/workspace.svelte.js';
	import TaskCreate from './TaskCreate.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import NoteCreate from './NoteCreate.svelte';

	let { children } = $props();
	let mobileOpen = $state(false);

	const path = $derived($page.url.pathname);

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	const activeLabel = $derived(
		primaryNav.find((item) => active(item.href))?.label ??
			(active('/projects') ? 'Projects' : active('/notes') ? 'Notes' : active('/accounting') ? 'Accounting' : active('/settings') ? 'Settings' : 'Drive')
	);

	/** @param {string} href */
	function go(href) {
		mobileOpen = false;
		goto(href);
	}
</script>

<div class="dashboard">
	<div class="mobile-nav">
		<button type="button" class="mobile-zone" aria-expanded={mobileOpen} onclick={() => (mobileOpen = !mobileOpen)}>
			<span>{activeLabel}</span>
			<span class="chev" class:open={mobileOpen}>⌄</span>
		</button>
		{#if mobileOpen}
			<div class="mobile-panel">
				{@render nav()}
				<button type="button" class="mobile-rest" aria-label="Close menu" onclick={() => (mobileOpen = false)}></button>
			</div>
		{/if}
	</div>

	<aside class="sidebar">
		<a class="brand" href="/drive">
			<span class="brand-name">{space.name}</span>
			<span class="brand-host">{space.host}</span>
		</a>
		{@render nav()}
	</aside>

	<div class="content">
		<div class="pane">
			{@render children()}
		</div>
	</div>
</div>

<TaskCreate />
<ProjectCreate />
<NoteCreate />

{#snippet emoji(src)}
	<span class="emoji" class:empty={!src}>
		{#if src}<img src={src} alt="" />{/if}
	</span>
{/snippet}

{#snippet plus(label, onclick)}
	<button type="button" class="plus" aria-label={label} {onclick}>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
		</svg>
	</button>
{/snippet}

{#snippet nav()}
	<nav class="sidebar-nav" aria-label="Sections">
		{#each primaryNav as item (item.href)}
			<button type="button" class="nav-item" class:active={active(item.href)} onclick={() => go(item.href)}>
				<span class="icon-wrap">{@render emoji(item.emoji)}</span>
				<span class="nav-label">{item.label}</span>
			</button>
		{/each}
	</nav>

	<div class="sidebar-mid">
		<div class="side-section">
			<div class="section-head">
				<span class="eyebrow">Projects</span>
				{@render plus('New project', () => { mobileOpen = false; openComposer('project'); })}
			</div>
			{#if projects.length === 0}
				<button type="button" class="nav-item" onclick={() => openComposer('project')}>
					<span class="nav-label quiet">No projects yet</span>
				</button>
			{/if}
			{#each projects as project (project.id)}
				<button
					type="button"
					class="nav-item"
					class:active={active('/projects') && ui.projectId === project.id}
					onclick={() => { ui.projectId = project.id; go('/projects'); }}
				>
					<span class="icon-wrap">{@render emoji('/emoji/stack.png')}</span>
					<span class="nav-label">{project.title}</span>
				</button>
			{/each}
		</div>

		<div class="side-section">
			<div class="section-head">
				<span class="eyebrow">Notes</span>
				{@render plus('New note', () => { mobileOpen = false; openComposer('note'); })}
			</div>
			{#each notes as note (note.id)}
				<button
					type="button"
					class="nav-item"
					class:active={active('/notes') && ui.noteId === note.id}
					onclick={() => { ui.noteId = note.id; go('/notes'); }}
				>
					<span class="icon-wrap">{@render emoji('/emoji/note.png')}</span>
					<span class="nav-label">{note.title}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="sidebar-foot">
		<button type="button" class="nav-item" class:active={active('/accounting')} onclick={() => go('/accounting')}>
			<span class="icon-wrap">{@render emoji(null)}</span>
			<span class="nav-label">Accounting</span>
		</button>
		<button type="button" class="nav-item" class:active={active('/settings')} onclick={() => go('/settings')}>
			<span class="icon-wrap">{@render emoji(null)}</span>
			<span class="nav-label">Settings</span>
		</button>
	</div>
{/snippet}

<style>
	.dashboard {
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
	}

	.brand {
		display: flex;
		flex-direction: column;
		padding: 6px 12px 14px;
		text-decoration: none;
	}

	.brand-name {
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.brand-host {
		font-size: 12px;
		color: var(--white33);
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.sidebar-mid {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.side-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 16px;
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 10px;
		margin-bottom: 4px;
	}

	.eyebrow {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.plus {
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--white33);
		padding: 0;
		cursor: pointer;
	}

	.plus:hover {
		background: var(--white4);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--white66);
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.nav-item:hover:not(.active) {
		background: var(--white4);
	}

	.nav-item.active {
		color: var(--white);
		background: var(--white8);
	}

	.icon-wrap {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.emoji {
		width: 18px;
		height: 18px;
		display: block;
	}

	.emoji.empty {
		border-radius: 4px;
		background: var(--white8);
	}

	.emoji img {
		width: 18px;
		height: 18px;
		object-fit: cover;
		border-radius: 4px;
		display: block;
	}

	.nav-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.quiet {
		color: var(--white33);
	}

	.sidebar-foot {
		flex-shrink: 0;
		margin-top: auto;
		margin-left: -12px;
		margin-right: -12px;
		padding: 12px 12px 4px;
		border-top: 1px solid var(--shell-border);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.content {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-left: 1px solid var(--shell-border);
	}

	.content :global(.pane) {
		flex: 1;
		min-height: 0;
	}

	.mobile-nav {
		display: none;
	}

	@media (max-width: 767px) {
		.dashboard {
			flex-direction: column;
		}

		.sidebar {
			display: none;
		}

		.content {
			border-left: none;
		}

		.mobile-nav {
			display: block;
			position: relative;
			flex-shrink: 0;
		}

		.mobile-zone {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			padding: 10px 16px;
			background: transparent;
			border: 0;
			border-bottom: 1px solid var(--shell-border);
			color: var(--white);
			font-size: 14px;
			font-weight: 500;
		}

		.chev {
			color: var(--white33);
			transition: transform 0.2s;
		}

		.chev.open {
			transform: rotate(180deg);
		}

		.mobile-panel {
			position: absolute;
			z-index: 20;
			left: 0;
			right: 0;
			top: 100%;
			max-height: 70dvh;
			overflow: auto;
			background: var(--black);
			border-bottom: 1px solid var(--shell-border);
			padding: 8px 8px 12px;
			display: flex;
			flex-direction: column;
		}

		.mobile-rest {
			display: none;
		}
	}
</style>
