<script>
	/**
	 * Feed row: ProjectBox | title | optional grayscale new-count
	 * Matches EnterpriseCard layout.
	 */
	import ProjectBox from './ProjectBox.svelte';

	let {
		id = '',
		title = '',
		status = 'planned',
		icon = /** @type {string | null} */ (null),
		newCount = 0,
		selected = false,
		onclick = () => {}
	} = $props();
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
		<span class="title" class:done={status === 'archived'}>{title}</span>
		{#if newCount > 0}
			<span class="new-count" aria-label="{newCount} new items">{newCount}</span>
		{/if}
	</div>
</article>

<style>
	.project-card {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 12px;
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
		background: var(--fg-4);
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

	.new-count {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 550;
		color: var(--fg-33);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
</style>
