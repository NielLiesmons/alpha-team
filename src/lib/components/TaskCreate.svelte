<script>
	import CreateSheet from './CreateSheet.svelte';
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { closeComposer, people, projects, saveTask, tasks, ui } from '$lib/workspace.svelte.js';

	const statuses = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'open', label: 'Open' },
		{ value: 'inProgress', label: 'In progress' },
		{ value: 'inReview', label: 'In review' },
		{ value: 'closed', label: 'Closed' },
		{ value: 'canceled', label: 'Canceled' }
	];

	const priorities = [
		{ value: 'none', label: 'None' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'urgent', label: 'Urgent' }
	];

	let title = $state('');
	let body = $state('');
	let status = $state('open');
	let priority = $state('none');
	let statusOpen = $state(false);
	let priorityOpen = $state(false);
	/** @type {string[]} */
	let labels = $state([]);
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {{ email?: string, name?: string }[]} */
	let assignees = $state([]);
	/** @type {null | 'assignees' | 'projects' | 'labels'} */
	let bottomMenu = $state(null);
	let labelDraft = $state('');

	const editing = $derived(ui.composer?.kind === 'task' ? tasks.find((item) => item.id === ui.composer.id) : null);
	const open = $derived(ui.composer?.kind === 'task');

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		body = editing?.body ?? '';
		status = editing?.status ?? ui.composer?.status ?? 'open';
		priority = editing?.priority ?? 'none';
		labels = [...(editing?.labels ?? [])];
		projectIds = [...(editing?.project_ids ?? [])];
		assignees = [...(editing?.assignees ?? [])];
		statusOpen = false;
		priorityOpen = false;
		bottomMenu = null;
		labelDraft = '';
	});

	/** @param {string} id */
	function toggleProject(id) {
		if (projectIds.includes(id)) projectIds = projectIds.filter((p) => p !== id);
		else projectIds = [...projectIds, id];
	}

	/** @param {{ email?: string, name?: string }} person */
	function toggleAssignee(person) {
		const key = person.email || person.name;
		const has = assignees.some((a) => (a.email || a.name) === key);
		assignees = has
			? assignees.filter((a) => (a.email || a.name) !== key)
			: [...assignees, person];
	}

	function addLabel() {
		const text = labelDraft.trim();
		if (!text) return;
		if (!labels.includes(text)) labels = [...labels, text];
		labelDraft = '';
		bottomMenu = null;
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		const draft = {
			id: editing?.id,
			title: nextTitle,
			body,
			status,
			priority,
			labels,
			targets: projectIds.map((id) => ({
				id,
				label: projects.find((p) => p.id === id)?.title ?? id
			})),
			project_ids: projectIds,
			author: editing?.author,
			assignees,
			commenters: editing?.commenters ?? [],
			_drive: editing?._drive
		};
		try {
			await saveTask(draft, !editing);
			closeComposer();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<CreateSheet {open} label={editing ? 'Edit task' : 'New task'} onclose={closeComposer}>
	<div class="task-title-row">
		<div class="status-wrapper">
			<button
				type="button"
				class="icon-hit"
				aria-label="Set task status"
				onclick={() => {
					statusOpen = !statusOpen;
					priorityOpen = false;
				}}
			>
				<TaskBox state={status} size={24} />
			</button>
			{#if statusOpen}
				<button type="button" class="menu-backdrop" aria-label="Close status menu" onclick={() => (statusOpen = false)}
				></button>
				<div class="status-menu" role="listbox">
					{#each statuses as opt (opt.value)}
						<button
							type="button"
							class="status-option"
							class:active={status === opt.value}
							onclick={() => {
								status = opt.value;
								statusOpen = false;
							}}
						>
							<TaskBox state={opt.value} size={18} />
							<span class="status-label">{opt.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<input class="task-title-input" placeholder="Title of Task" bind:value={title} aria-label="Task title" />

		<div class="priority-wrapper">
			<button
				type="button"
				class="icon-hit"
				aria-label="Set task priority"
				onclick={() => {
					priorityOpen = !priorityOpen;
					statusOpen = false;
				}}
			>
				<PriorityBox {priority} size={22} />
			</button>
			{#if priorityOpen}
				<button
					type="button"
					class="menu-backdrop"
					aria-label="Close priority menu"
					onclick={() => (priorityOpen = false)}
				></button>
				<div class="status-menu priority-menu" role="listbox">
					{#each priorities as opt (opt.value)}
						<button
							type="button"
							class="status-option"
							class:active={priority === opt.value}
							onclick={() => {
								priority = opt.value;
								priorityOpen = false;
							}}
						>
							<PriorityBox priority={opt.value} size={18} />
							<span class="status-label">{opt.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div class="post-form-divider"></div>

	<textarea class="task-body" placeholder="Describe your task" bind:value={body} aria-label="Describe your task"
	></textarea>

	<div class="post-action-row">
		<div class="action-buttons-left">
			<button type="button" class="action-btn" aria-label="Add photo">
				<!-- Bley filled camera -->
				<svg width="20" height="16" viewBox="0 0 23 18" fill="none" aria-hidden="true">
					<path
						fill="currentColor"
						d="M0 4.5C0 3.2625 1.0125 2.25 2.25 2.25H4.79657C5.32701 2.25 5.83571 2.03929 6.21079 1.66421L7.28921 0.585786C7.66429 0.210713 8.17299 0 8.70343 0H13.7966C14.327 0 14.8357 0.210714 15.2108 0.585786L16.2892 1.66421C16.6643 2.03929 17.173 2.25 17.7034 2.25H20.25C20.8467 2.25 21.419 2.48705 21.841 2.90901C22.2629 3.33097 22.5 3.90326 22.5 4.5V15.75C22.5 16.3467 22.2629 16.919 21.841 17.341C21.419 17.7629 20.8467 18 20.25 18H2.25C1.65326 18 1.08097 17.7629 0.65901 17.341C0.237053 16.919 0 16.3467 0 15.75V4.5ZM11.25 15.75C12.7418 15.75 14.1726 15.1574 15.2275 14.1025C16.2824 13.0476 16.875 11.6168 16.875 10.125C16.875 8.63316 16.2824 7.20242 15.2275 6.14752C14.1726 5.09263 12.7418 4.5 11.25 4.5C9.75816 4.5 8.32742 5.09263 7.27252 6.14752C6.21763 7.20242 5.625 8.63316 5.625 10.125C5.625 11.6168 6.21763 13.0476 7.27252 14.1025C8.32742 15.1574 9.75816 15.75 11.25 15.75ZM11.25 13.5C10.8068 13.5 10.3679 13.4127 9.95844 13.2431C9.54897 13.0735 9.17691 12.8249 8.86351 12.5115C8.55012 12.1981 8.30152 11.826 8.13191 11.4166C7.9623 11.0071 7.875 10.5682 7.875 10.125C7.875 9.68179 7.9623 9.24292 8.13191 8.83344C8.30152 8.42397 8.55012 8.05191 8.86351 7.73851C9.17691 7.42512 9.54897 7.17652 9.95844 7.00691C10.3679 6.8373 10.8068 6.75 11.25 6.75C12.1451 6.75 13.0036 7.10558 13.6365 7.73851C14.2694 8.37145 14.625 9.22989 14.625 10.125C14.625 11.0201 14.2694 11.8786 13.6365 12.5115C13.0036 13.1444 12.1451 13.5 11.25 13.5Z"
					/>
				</svg>
			</button>
			<button type="button" class="action-btn" aria-label="Add emoji">
				<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
					<path
						fill="currentColor"
						fill-rule="evenodd"
						d="M0 10C0 4.47715 4.47715 0 10 0C15.5228 0 20 4.47715 20 10C20 15.5228 15.5228 20 10 20C4.47715 20 0 15.5228 0 10ZM7.00002 6.00006C6.24063 6.00006 5.62502 6.61567 5.62502 7.37506C5.62502 8.13445 6.24063 8.75006 7.00002 8.75006C7.75941 8.75006 8.37502 8.13445 8.37502 7.37506C8.37502 6.61567 7.75941 6.00006 7.00002 6.00006ZM13 6.00006C12.2406 6.00006 11.625 6.61567 11.625 7.37506C11.625 8.13445 12.2406 8.75006 13 8.75006C13.7594 8.75006 14.375 8.13445 14.375 7.37506C14.375 6.61567 13.7594 6.00006 13 6.00006ZM6.51915 11.5005C6.18536 11.0976 5.58814 11.0415 5.18523 11.3753C4.78231 11.7091 4.72627 12.3063 5.06006 12.7093C6.3885 14.3128 8.1725 15.1575 10.0001 15.1575C11.8278 15.1575 13.6118 14.3128 14.9402 12.7093C15.274 12.3063 15.2179 11.7091 14.815 11.3753C14.4121 11.0415 13.8149 11.0976 13.4811 11.5005C12.4841 12.7039 11.2203 13.2628 10.0001 13.2628C8.77993 13.2628 7.51612 12.7039 6.51915 11.5005Z"
					/>
				</svg>
			</button>
			<button type="button" class="action-btn" aria-label="Add attachment">
				<svg width="16" height="16" viewBox="-0.5 -0.5 15 15" fill="none" aria-hidden="true">
					<path
						d="M6.70018 0.699219L6.70018 12.6992M12.7002 6.69912L0.700195 6.69912"
						stroke="currentColor"
						stroke-width="2.8"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>
	</div>

	<div class="post-form-divider"></div>

	<div class="task-bottom-row">
		<div class="bottom-pills">
			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={assignees.length === 0}
					aria-label="Assignees"
					aria-expanded={bottomMenu === 'assignees'}
					onclick={() => (bottomMenu = bottomMenu === 'assignees' ? null : 'assignees')}
				>
					{#if assignees.length === 0}
						<span class="empty-avatar" aria-hidden="true"></span>
						<span>Assignee</span>
					{:else}
						{#each assignees.slice(0, 2) as person, i (person.email ?? person.name ?? i)}
							<span class="stack-pic" style:margin-left={i > 0 ? '-6px' : '0'}>
								<ProfilePic name={person.name ?? ''} size={22} />
							</span>
						{/each}
						<span class="pill-names">{assignees.map((a) => a.name).filter(Boolean).join(', ')}</span>
					{/if}
				</button>
				{#if bottomMenu === 'assignees'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#each people as person (person.email)}
							{@const on = assignees.some((a) => a.email === person.email)}
							<button type="button" class="option" class:active={on} onclick={() => toggleAssignee(person)}>
								<ProfilePic name={person.name} size={20} />
								<span>{person.name}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="pill-wrap">
				<button
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					aria-label="Projects"
					aria-expanded={bottomMenu === 'projects'}
					onclick={() => (bottomMenu = bottomMenu === 'projects' ? null : 'projects')}
				>
					{#if projectIds.length === 0}
						<span>Project</span>
					{:else}
						<span class="pill-names"
							>{projectIds.map((id) => projects.find((p) => p.id === id)?.title ?? id).join(', ')}</span
						>
					{/if}
				</button>
				{#if bottomMenu === 'projects'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu" role="listbox">
						{#if projects.length === 0}
							<p class="menu-empty">No projects yet</p>
						{:else}
							{#each projects as project (project.id)}
								{@const on = projectIds.includes(project.id)}
								<button
									type="button"
									class="option"
									class:active={on}
									onclick={() => toggleProject(project.id)}
								>
									<span>{project.title}</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<div class="pill-wrap">
				<button
					type="button"
					class="labels-trigger"
					class:has-labels={labels.length > 0}
					aria-label="Add labels"
					aria-expanded={bottomMenu === 'labels'}
					onclick={() => (bottomMenu = bottomMenu === 'labels' ? null : 'labels')}
				>
					<span class="labels-trigger-body">
						<span class="trigger-count">{labels.length}</span>
						<span class="trigger-text">Label{labels.length === 1 ? '' : 's'}</span>
					</span>
					<svg class="labels-trigger-tip" width="27" height="36" viewBox="0 0 24 32" fill="none" aria-hidden="true">
						<path
							d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z"
							fill="var(--trigger-bg)"
						/>
					</svg>
				</button>
				{#if bottomMenu === 'labels'}
					<button type="button" class="menu-backdrop" aria-label="Close" onclick={() => (bottomMenu = null)}
					></button>
					<div class="bottom-menu labels-menu" role="dialog">
						<form
							class="label-form"
							onsubmit={(e) => {
								e.preventDefault();
								addLabel();
							}}
						>
							<input class="label-input" placeholder="New label" bind:value={labelDraft} aria-label="New label" />
							<button type="submit" class="label-submit" disabled={!labelDraft.trim()}>Add</button>
						</form>
					</div>
				{/if}
			</div>
		</div>

		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>
			{editing ? 'Save' : 'Publish'}
		</button>
	</div>
</CreateSheet>

<style>
	.task-title-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		/* Match left pad on top/bottom around the TaskBox row */
		padding: 16px;
		position: relative;
		z-index: 2;
	}

	.status-wrapper,
	.priority-wrapper {
		position: relative;
		flex-shrink: 0;
	}

	.icon-hit {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 19;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}

	.status-menu,
	.bottom-menu {
		position: absolute;
		z-index: 20;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		overflow: hidden;
		min-width: 168px;
		box-shadow: 0 8px 28px color-mix(in srgb, var(--fg-raw) 18%, transparent);
	}

	.status-menu {
		top: calc(100% + 8px);
		left: 0;
	}

	.priority-menu {
		left: auto;
		right: 0;
	}

	.bottom-menu {
		bottom: calc(100% + 6px);
		left: 0;
	}

	.status-option,
	.option {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		background: none;
		border: none;
		border-radius: 0;
		cursor: pointer;
		text-align: left;
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--fg-66);
	}

	.status-option:not(:last-child),
	.option:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.status-option:hover,
	.option:hover {
		background: var(--fg-4);
	}

	.status-label {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--fg-66);
	}

	.status-option.active .status-label,
	.option.active {
		color: var(--fg);
		font-weight: 600;
	}

	.task-title-input {
		flex: 1;
		min-width: 0;
		width: auto;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--fg);
		font-family: 'Inter', sans-serif;
		font-size: 18px;
		font-weight: 600;
	}

	.task-title-input::placeholder {
		color: var(--fg-33);
		font-weight: 500;
	}

	.post-form-divider {
		width: 100%;
		height: 1.4px;
		background: var(--fg-8);
		flex-shrink: 0;
	}

	.task-body {
		display: block;
		width: 100%;
		min-height: 160px;
		max-height: 400px;
		margin: 0;
		padding: 10px 16px;
		border: 0;
		outline: none;
		resize: none;
		background: transparent;
		color: var(--fg);
		font-family: 'Inter', sans-serif;
		font-size: 16px;
		font-weight: 400;
		line-height: 1.5;
		box-sizing: border-box;
	}

	.task-body::placeholder {
		color: var(--fg-33);
	}

	.post-action-row {
		display: flex;
		align-items: center;
		padding: 0 16px 6px;
	}

	.action-buttons-left {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}

	.action-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--fg-8);
		border: none;
		border-radius: 10px;
		padding: 0;
		cursor: pointer;
		color: var(--fg-33);
		box-sizing: border-box;
	}

	.action-btn:hover {
		color: var(--fg-66);
		background: var(--fg-11);
	}

	.task-bottom-row {
		--ctrl-h: 36px;
		display: flex;
		flex-direction: row;
		align-items: center;
		padding: 8px 16px 4px;
		gap: 8px;
	}

	.bottom-pills {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}

	.pill-wrap {
		position: relative;
		flex-shrink: 0;
		height: var(--ctrl-h);
		display: flex;
		align-items: center;
	}

	.meta-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: var(--ctrl-h);
		min-height: var(--ctrl-h);
		max-height: var(--ctrl-h);
		padding: 0 14px 0 10px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		font-size: 14px;
		font-weight: 500;
		line-height: 1;
		color: var(--fg-66);
		white-space: nowrap;
		cursor: pointer;
		font-family: inherit;
		box-sizing: border-box;
	}

	.meta-pill.empty {
		color: var(--fg-33);
		padding-left: 12px;
	}

	.meta-pill:hover {
		background: var(--fg-8);
	}

	.empty-avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px dashed var(--fg-16);
		box-sizing: border-box;
		flex-shrink: 0;
	}

	.stack-pic {
		display: inline-flex;
		flex-shrink: 0;
	}

	.pill-names {
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.labels-trigger {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		height: var(--ctrl-h);
		min-height: var(--ctrl-h);
		max-height: var(--ctrl-h);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		--trigger-bg: var(--fg-4);
		box-sizing: border-box;
	}

	.labels-trigger.has-labels {
		--trigger-bg: var(--fg-8);
	}

	.labels-trigger-body {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		height: var(--ctrl-h);
		min-height: var(--ctrl-h);
		max-height: var(--ctrl-h);
		padding: 0 2px 0 14px;
		background: var(--trigger-bg);
		border-radius: 14px 0 0 14px;
		white-space: nowrap;
		line-height: 1;
		box-sizing: border-box;
	}

	.trigger-count {
		font-size: 14px;
		font-weight: 600;
		line-height: 1;
		color: var(--fg-16);
	}

	.labels-trigger.has-labels .trigger-count {
		color: var(--fg-66);
	}

	.trigger-text {
		font-size: 14px;
		font-weight: 500;
		line-height: 1;
		color: var(--fg-33);
	}

	.labels-trigger.has-labels .trigger-text {
		color: var(--fg-66);
	}

	.labels-trigger-tip {
		flex-shrink: 0;
		display: block;
		width: 27px;
		height: var(--ctrl-h);
	}

	.labels-menu {
		padding: 8px;
		min-width: 200px;
	}

	.label-form {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.label-input {
		flex: 1;
		min-width: 0;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		outline: none;
	}

	.label-submit {
		height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.label-submit:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.menu-empty {
		margin: 0;
		padding: 10px 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

	.publish-btn {
		height: var(--ctrl-h);
		min-height: var(--ctrl-h);
		max-height: var(--ctrl-h);
		padding: 0 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--fg);
		border: none;
		border-radius: 9999px;
		color: var(--bg);
		font-size: 14px;
		font-weight: 500;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
		margin-left: auto;
		box-sizing: border-box;
	}

	.publish-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
