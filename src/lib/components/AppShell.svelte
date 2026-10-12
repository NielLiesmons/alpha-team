<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { mobileNav, primaryNav, space } from '$lib/sections.js';
	import { openComposer } from '$lib/workspace.svelte.js';
	import { tick } from 'svelte';
	import NavIcon from './NavIcon.svelte';
	import ProjectCreate from './ProjectCreate.svelte';
	import TaskCreate from './TaskCreate.svelte';

	let { children } = $props();

	/** @type {HTMLDivElement | undefined} */
	let pillTrack = $state();

	const path = $derived($page.url.pathname);

	/** @param {string} href */
	function active(href) {
		return path === href || path.startsWith(`${href}/`);
	}

	const activeHref = $derived(
		primaryNav.find((item) => active(item.href))?.href ??
			(active('/settings') ? '/settings' : '/dashboard')
	);

	/** @param {string} href */
	function go(href) {
		goto(href);
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
		<a class="brand" href="/dashboard">
			<span class="brand-name">{space.name}</span>
			<span class="brand-host">{space.host}</span>
		</a>
		{@render desktopNav()}
	</aside>

	<div class="content">
		<div class="pane">
			{@render children()}
		</div>
		<TaskCreate />
		<ProjectCreate />
	</div>

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

{#snippet desktopNav()}
	<nav class="sidebar-nav" aria-label="Sections">
		{#each primaryNav as item (item.href)}
			<div class="nav-row" class:active={active(item.href)}>
				<button type="button" class="nav-item" onclick={() => go(item.href)}>
					<span class="icon-wrap"><NavIcon name={item.icon} size={18} /></span>
					<span class="nav-label">{item.label}</span>
				</button>
				{#if item.href === '/tasks' || item.href === '/projects'}
					<button
						type="button"
						class="plus"
						aria-label={item.href === '/tasks' ? 'New task' : 'New project'}
						onclick={() => openComposer(item.href === '/tasks' ? 'task' : 'project')}
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
				<span class="icon-wrap"><NavIcon name="settings" size={18} /></span>
				<span class="nav-label">Settings</span>
			</button>
		</div>
	</div>
{/snippet}

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
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: inherit;
	}

	.icon-wrap :global(svg) {
		display: block;
		max-width: 100%;
		max-height: 100%;
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
			background: color-mix(in srgb, var(--gray) 92%, transparent);
			border: 1px solid var(--white11);
			backdrop-filter: blur(16px);
			-webkit-backdrop-filter: blur(16px);
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
