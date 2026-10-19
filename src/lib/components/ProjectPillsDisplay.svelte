<script>
	/**
	 * Compact project trigger: overlapping hex stack (like ProfilePicStack), then count.
	 */
	import ProjectBox from './ProjectBox.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
	import { projects, tasks } from '$lib/workspace.svelte.js';

	/** @type {{ projectIds?: string[], size?: number }} */
	let { projectIds = [], size = 22 } = $props();

	const shown = $derived(projectIds.slice(0, 3));
	const count = $derived(projectIds.length);
	const overlap = $derived(Math.round(size * 0.38));
</script>

{#if count === 0}
	<span>Project</span>
{:else}
	<span class="pill-projects">
		<span class="hex-stack">
			{#each shown as pid, i (pid)}
				{@const p = projects.find((x) => x.id === pid)}
				<span
					class="hex"
					style:z-index={shown.length - i}
					style:margin-left={i === 0 ? '0' : `-${overlap}px`}
				>
					<ProjectBox
						state={p ? deriveProjectStatus(p.id, tasks) : 'planned'}
						icon={p?.icon}
						{size}
					/>
				</span>
			{/each}
		</span>
		{#if count > 1}
			<span class="count">{count} Projects</span>
		{:else if count === 1}
			{@const p = projects.find((x) => x.id === shown[0])}
			{#if p?.title}
				<span class="count one">{p.title}</span>
			{/if}
		{/if}
	</span>
{/if}

<style>
	.pill-projects {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.hex-stack {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		flex-shrink: 0;
	}

	.hex {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
	}

	.count {
		font-size: inherit;
		font-weight: 500;
		color: inherit;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 9rem;
	}
</style>
