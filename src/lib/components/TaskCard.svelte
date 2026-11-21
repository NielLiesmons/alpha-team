<script>
	/**
	 * Feed row: status | title | people stack | priority
	 * Mail-linked tasks: quiet “Mail” prefix (no description / no Mail Thread button).
	 */
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

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
		/** Quiet “Mail” prefix when linked from a thread */
		fromMail = false,
		/** Local-only until Drive put succeeds */
		pending = false,
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
	class:from-mail={fromMail}
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
		<span class="task-title" class:task-title-closed={status === 'closed'}>
			{#if fromMail}
				<span class="mail-prefix">{t('tasks.mailPrefix')}</span>
			{/if}
			{title}
		</span>
		{#if pending}
			<span class="local-only" title={t('common.localOnly')} aria-label={t('common.localOnly')}>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M4.5 12.5h7.2c1.7 0 3.1-1.3 3.1-3 0-1.5-1.1-2.7-2.5-2.9A4 4 0 0 0 4.8 5.2 3.2 3.2 0 0 0 2 8.3c0 1.8 1.3 3.2 2.5 3.2Z"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linejoin="round"
					/>
					<path
						d="M3 3.5 13 13.5"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
					/>
				</svg>
			</span>
		{/if}
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

	.mail-prefix {
		font-size: inherit;
		font-weight: 500;
		color: var(--fg-33);
		margin-right: 0.35em;
	}

	.local-only {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--fg-33);
		line-height: 0;
	}

	.task-title-closed {
		color: var(--white66);
	}

	.task-title-closed .mail-prefix {
		color: var(--fg-33);
		opacity: 0.85;
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
