<script>
	/**
	 * Compact project trigger: up to 3 hexagons, then "N Projects" when count > 1.
	 */
	import ProjectBox from './ProjectBox.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
	import { projects, tasks } from '$lib/workspace.svelte.js';

	/** @type {{ projectIds?: string[], size?: number }} */
	let { projectIds = [], size = 16 } = $props();

	const shown = $derived(projectIds.slice(0, 3));
	const count = $derived(projectIds.length);
</script>

{#if count === 0}
	<span>Project</span>
{:else}
	<span class="pill-projects">
		{#each shown as pid (pid)}
			{@const p = projects.find((x) => x.id === pid)}
			<span class="hex">
				<ProjectBox
					state={p ? deriveProjectStatus(p.id, tasks) : 'planned'}
					icon={p?.icon}
					{size}
				/>
			</span>
		{/each}
		{#if count > 1}
			<span class="count">{count} Projects</span>
		{/if}
	</span>
{/if}

<style>
	.pill-projects {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	.hex {
		display: inline-flex;
		flex-shrink: 0;
	}

	.count {
		margin-left: 2px;
		font-size: inherit;
		font-weight: 500;
		color: inherit;
		white-space: nowrap;
	}
</style>
