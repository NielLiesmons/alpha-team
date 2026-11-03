<script>
	/**
	 * Feed row: status | title | people stack | priority
	 */
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';

	let {
		id = '',
		title = '',
		status = 'open',
		priority = 'none',
		/** @type {string | null} */
		author = null,
		/** @type {Array<{ email?: string, name?: string } | string>} */
		assignees = [],
		/** Extra emails from linked moments (Drive) */
		/** @type {string[]} */
		momentAssignees = [],
		selected = false,
		onclick = () => {}
	} = $props();

	const people = $derived.by(() => {
		/** @type {Map<string, { name: string, email: string, pictureUrl: string | null }>} */
		const map = new Map();
		/** @param {string} email @param {string} [name] */
		function add(email, name) {
			const e = String(email || '')
				.trim()
				.toLowerCase();
			if (!e || map.has(e)) return;
			const who = asPerson(e);
			map.set(e, {
				email: e,
				name: who?.name || name || displayNameFromEmail(e) || '?',
				pictureUrl: pictureUrlFor(e)
			});
		}
		for (const a of assignees || []) {
			if (typeof a === 'string') add(a);
			else if (a?.email) add(a.email, a.name);
		}
		for (const email of momentAssignees || []) add(email);
		if (author) add(author);
		return [...map.values()];
	});
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
		{#if people.length}
			<span class="people" aria-hidden="true">
				<ProfilePicStack profiles={people} size="xxs" />
			</span>
		{/if}
	</div>
</article>

<style>
	.task-card {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 10px;
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
		min-height: 24px;
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

	.people {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		line-height: 0;
		opacity: 0.66;
	}

	.priority-col {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}
</style>
