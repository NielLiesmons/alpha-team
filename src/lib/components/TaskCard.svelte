<script>
	/**
	 * Feed row: status picker | title | priority picker
	 */
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';

	let {
		id = '',
		title = '',
		status = 'open',
		priority = 'none',
		selected = false,
		onclick = () => {}
	} = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role a11y_click_events_have_key_events -->
<article
	class="task-card"
	class:selected
	role="button"
	tabindex="0"
	aria-current={selected ? 'true' : undefined}
	{onclick}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onclick())}
>
	<div class="row-main">
		<div class="taskbox-col">
			{#if id}
				<TaskFieldPicker taskId={id} field="status" value={status} size={24} />
			{:else}
				<TaskBox state={status} size={24} />
			{/if}
		</div>
		<span class="task-title" class:task-title-closed={status === 'closed'}>{title}</span>
		{#if status !== 'closed'}
			<div class="priority-col">
				{#if id}
					<TaskFieldPicker taskId={id} field="priority" value={priority} size={22} align="right" />
				{:else}
					<PriorityBox {priority} size={22} />
				{/if}
			</div>
		{/if}
	</div>
</article>

<style>
	.task-card {
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

	.task-card:hover {
		background: var(--fg-4);
	}

	.task-card:focus-visible {
		background: var(--fg-4);
	}

	.task-card.selected {
		background: var(--fg-4);
	}

	.row-main {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 24px;
	}

	.taskbox-col {
		width: 24px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.task-title {
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

	.task-title-closed {
		color: var(--white66);
	}

	.priority-col {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}
</style>
