<script>
	/**
	 * Feed row copied from Chateau TaskCard.
	 * Row 1: status | title | priority
	 * Row 2: L connector, people, labels
	 */
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import LabelStack from './LabelStack.svelte';

	let {
		title = '',
		status = 'open',
		priority = 'none',
		author = null,
		assignees = [],
		commenters = [],
		targets = [],
		labels = [],
		selected = false,
		onclick = () => {}
	} = $props();

	const allStackPeople = $derived.by(() => {
		const seen = new Set();
		/** @type {{ pubkey?: string, name?: string }[]} */
		const merged = [];
		for (const person of [author, ...assignees, ...commenters]) {
			const key = person?.pubkey || person?.name;
			if (person && key && !seen.has(key)) {
				seen.add(key);
				merged.push(person);
			}
		}
		return merged;
	});

	const stackProfiles = $derived(allStackPeople.slice(0, 4));

	const stackText = $derived.by(() => {
		const n = allStackPeople.length;
		if (n === 0) return '';
		const a = allStackPeople[0].name || 'Someone';
		if (n === 1) return a;
		if (n === 2) return `${a} & ${allStackPeople[1].name || 'Someone'}`;
		return `${a} & ${n - 1} Others`;
	});

	const hasBottomRow = $derived(stackProfiles.length > 0 || targets.length > 0 || labels.length > 0);
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
			<TaskBox state={status} size={24} />
		</div>
		<span class="task-title" class:task-title-closed={status === 'closed'}>{title}</span>
		{#if status !== 'closed'}
			<div class="priority-col">
				<PriorityBox {priority} size={22} />
			</div>
		{/if}
	</div>

	{#if hasBottomRow}
		<div class="row-bottom">
			<div class="connector-col">
				<svg viewBox="0 0 22 22" width="22" height="22" fill="none" aria-hidden="true">
					<path d="M1 0 L1 9 Q1 21 10 21 L22 21" stroke="var(--white16)" stroke-width="1.5" fill="none" />
				</svg>
			</div>
			<div class="bottom-items">
				{#if targets.length > 0}
					<div class="targets-container">
						{#each targets as target (target.id)}
							<span class="target-chip">{target.label}</span>
						{/each}
					</div>
				{/if}
				{#if stackProfiles.length > 0}
					<ProfilePicStack profiles={stackProfiles} text={stackText} size="xs" />
				{/if}
				{#if labels.length > 0}
					<div class="labels-right">
						<LabelStack {labels} />
					</div>
				{/if}
			</div>
		</div>
	{/if}
</article>

<style>
	.task-card {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 14px 16px;
		border-bottom: 1.4px solid var(--white11);
		background: transparent;
		border-radius: 0;
		cursor: pointer;
		outline: none;
	}

	.task-card:focus-visible {
		background: var(--white4);
	}

	.task-card.selected {
		background: var(--white8);
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
		flex-wrap: nowrap;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		padding-top: 7px;
	}

	.labels-right {
		margin-left: auto;
		flex-shrink: 0;
	}

	.targets-container {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 10px;
		background: var(--white8);
		border-radius: 9999px;
		flex-shrink: 0;
		max-width: 50%;
		overflow: hidden;
	}

	.target-chip {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
</style>
