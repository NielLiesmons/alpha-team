<script>
	/**
	 * Feed row: ProjectBox | title | milestone summary
	 * Row 2: linked task/note counts (optional)
	 */
	import ProjectBox from './ProjectBox.svelte';
	import MilestoneBox from './MilestoneBox.svelte';

	let {
		id = '',
		title = '',
		status = 'planned',
		icon = /** @type {string | null} */ (null),
		description = '',
		milestones = /** @type {{ id: string, title: string, percentage?: number }[]} */ ([]),
		taskCount = 0,
		noteCount = 0,
		selected = false,
		onclick = () => {}
	} = $props();

	const avgPct = $derived.by(() => {
		if (!milestones.length) return 0;
		const sum = milestones.reduce((a, m) => a + (Number(m.percentage) || 0), 0);
		return Math.round(sum / milestones.length);
	});

	const hasBottom = $derived(
		Boolean(description) || milestones.length > 0 || taskCount > 0 || noteCount > 0
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role a11y_click_events_have_key_events -->
<article
	class="project-card"
	class:selected
	role="button"
	tabindex="0"
	aria-current={selected ? 'true' : undefined}
	{onclick}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onclick())}
>
	<div class="row-main">
		<div class="box-col">
			<ProjectBox state={status} {icon} size={24} />
		</div>
		<span class="title" class:done={status === 'closed' || status === 'canceled'}>{title}</span>
		{#if milestones.length > 0}
			<div class="mile-col" title="{milestones.length} milestone{milestones.length === 1 ? '' : 's'}">
				<MilestoneBox percentage={avgPct} size={20} />
			</div>
		{/if}
	</div>

	{#if hasBottom}
		<div class="row-bottom">
			<div class="connector-col">
				<svg viewBox="0 0 22 22" width="22" height="22" fill="none" aria-hidden="true">
					<path d="M1 0 L1 9 Q1 21 10 21 L22 21" stroke="var(--white16)" stroke-width="1.5" fill="none" />
				</svg>
			</div>
			<div class="bottom-items">
				{#if description}
					<span class="sum">{description}</span>
				{/if}
				{#if taskCount > 0 || noteCount > 0}
					<span class="counts">
						{#if taskCount > 0}{taskCount} task{taskCount === 1 ? '' : 's'}{/if}
						{#if taskCount > 0 && noteCount > 0}
							<span class="dot">·</span>
						{/if}
						{#if noteCount > 0}{noteCount} note{noteCount === 1 ? '' : 's'}{/if}
					</span>
				{/if}
			</div>
		</div>
	{/if}
</article>

<style>
	.project-card {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 12px 12px 10px;
		border: 0;
		background: transparent;
		border-radius: 12px;
		cursor: pointer;
		outline: none;
	}

	.project-card:hover {
		background: var(--fg-4);
	}

	.project-card:focus-visible {
		background: var(--fg-4);
	}

	.project-card.selected {
		background: var(--fg-8);
	}

	.row-main {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 24px;
	}

	.box-col {
		width: 24px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.title {
		flex: 1;
		min-width: 0;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--white);
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.title.done {
		color: var(--white66);
	}

	.mile-col {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.row-bottom {
		display: flex;
		align-items: flex-start;
		margin-left: 12px;
		width: calc(100% - 12px);
	}

	.connector-col {
		width: 22px;
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
	}

	.bottom-items {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		padding-top: 7px;
	}

	.sum {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		max-width: 70%;
	}

	.counts {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--white33);
		white-space: nowrap;
	}

	.dot {
		margin: 0 0.2em;
	}
</style>
