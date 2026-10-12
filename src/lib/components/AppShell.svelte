<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { primaryNav, space } from '$lib/sections.js';
	import { openComposer } from '$lib/workspace.svelte.js';
	import NavIcon from './NavIcon.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import TaskCreate from './TaskCreate.svelte';

	let { children } = $props();
	let mobileOpen = $state(false);

	const path = $derived($page.url.pathname);

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	const activeLabel = $derived(
		primaryNav.find((item) => active(item.href))?.label ??
			(active('/settings') ? 'Settings' : 'Alpha')
	);

	/** @param {string} href */
	function go(href) {
		mobileOpen = false;
		goto(href);
	}
</script>

<div class="dashboard">
	<div class="mobile-nav">
		<button
			type="button"
			class="mobile-zone"
			aria-expanded={mobileOpen}
			onclick={() => (mobileOpen = !mobileOpen)}
		>
			<span>{activeLabel}</span>
			<span class="chev" class:open={mobileOpen}>⌄</span>
		</button>
		{#if mobileOpen}
			<div class="mobile-panel">
				{@render nav()}
			</div>
		{/if}
	</div>

	<aside class="sidebar">
		<a class="brand" href="/tasks">
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

{#snippet nav()}
	<nav class="sidebar-nav" aria-label="Sections">
		{#each primaryNav as item (item.href)}
			<div class="nav-row" class:active={active(item.href)}>
				<button type="button" class="nav-item" onclick={() => go(item.href)}>
					<span class="icon-wrap"><NavIcon name={item.icon} /></span>
					<span class="nav-label">{item.label}</span>
				</button>
				{#if item.href === '/tasks' || item.href === '/projects'}
					<button
						type="button"
						class="plus"
						aria-label={item.href === '/tasks' ? 'New task' : 'New project'}
						onclick={() => {
							mobileOpen = false;
							openComposer(item.href === '/tasks' ? 'task' : 'project');
						}}
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

	<div class="sidebar-foot">
		<div class="nav-row" class:active={active('/settings')}>
			<button type="button" class="nav-item" onclick={() => go('/settings')}>
				<span class="icon-wrap"><NavIcon name="settings" /></span>
				<span class="nav-label">Settings</span>
			</button>
		</div>
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
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 700;
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
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.nav-row {
		display: flex;
		align-items: center;
		gap: 2px;
		border-radius: 8px;
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

	.icon-wrap {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.9;
	}

	.nav-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.plus {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--white33);
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}

	.plus:hover {
		background: var(--white4);
		color: var(--white);
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
	}
</style>
