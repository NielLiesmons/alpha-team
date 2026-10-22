<script>
	import CreateSheet from './CreateSheet.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import Spinner from './Spinner.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import LabelsPicker from './LabelsPicker.svelte';
	import NavIcon from './NavIcon.svelte';
	import { projectDisplayIcon, projectLifecycle } from '$lib/project-status.js';
	import {
		closeComposer,
		enterprises,
		moments,
		people,
		projects,
		saveTask,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const statuses = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'open', label: 'Open' },
		{ value: 'inProgress', label: 'In progress' },
		{ value: 'inReview', label: 'In review' },
		{ value: 'recurring', label: 'Recurring' },
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
	/** @type {HTMLButtonElement | undefined} */
	let statusBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let priorityBtn = $state();
	let deadlineDate = $state('');
	let scheduleStart = $state('');
	let scheduleEnd = $state('');
	/** @type {string[]} */
	let labels = $state([]);
	/** @type {string[]} */
	let projectIds = $state([]);
	/** @type {{ email?: string, name?: string }[]} */
	let assignees = $state([]);
	/** @type {null | 'schedule' | 'projects' | 'labels'} */
	let bottomMenu = $state(null);
	/** @type {HTMLButtonElement | undefined} */
	let scheduleBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let projectsBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let labelsBtn = $state();
	let saving = $state(false);
	const hasSchedule = $derived(
		Boolean(deadlineDate || scheduleStart || scheduleEnd || assignees.length)
	);

	/** Keep title/body keyboard open while tapping pills / menus. */
	/** @param {PointerEvent} e */
	function keepKeyboard(e) {
		e.preventDefault();
	}

	const editing = $derived(ui.composer?.kind === 'task' ? tasks.find((item) => item.id === ui.composer.id) : null);
	const open = $derived(ui.composer?.kind === 'task');

	$effect(() => {
		if (!open) {
			saving = false;
			return;
		}
		title = editing?.title ?? '';
		body = editing?.body ?? '';
		status = editing?.status ?? ui.composer?.status ?? 'open';
		priority = editing?.priority ?? 'none';
		labels = [...(editing?.labels ?? [])];
		projectIds = [
			...(editing?.project_ids ??
				(Array.isArray(ui.composer?.project_ids) ? ui.composer.project_ids : []))
		];
		assignees = [...(editing?.assignees ?? [])];
		deadlineDate = toDateInput(editing?.deadline_at);
		const linked = editing
			? moments.find((m) => m.task_id === editing.id && !m.recurrence)
			: null;
		scheduleStart = toDateInput(linked?.start_at ?? editing?._schedule?.start_at);
		scheduleEnd = toDateInput(linked?.end_at ?? editing?._schedule?.end_at);
		statusOpen = false;
		priorityOpen = false;
		bottomMenu = null;
		saving = false;
		/* No autofocus — mobile PWAs scroll the sheet into the keyboard and hide chrome. */
	});

	/** @param {string | null | undefined} iso */
	function toDateInput(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toISOString().slice(0, 10);
	}

	/** @param {string} ymd */
	function fromDateInput(ymd) {
		if (!ymd) return null;
		return `${ymd}T12:00:00Z`;
	}

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

	/** @param {string} text */
	function addLabel(text) {
		const t = text.trim();
		if (!t) return;
		if (!labels.includes(t)) labels = [...labels, t];
	}

	/** @param {string} text */
	function toggleLabel(text) {
		if (labels.includes(text)) labels = labels.filter((l) => l !== text);
		else labels = [...labels, text];
	}

	/** @param {null | 'schedule' | 'projects' | 'labels'} next */
	function toggleBottom(next) {
		bottomMenu = bottomMenu === next ? null : next;
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle || saving) return;
		const isNew = !editing;
		saving = true;
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
			deadline_at: fromDateInput(deadlineDate),
			depends_on: editing?.depends_on ?? [],
			author: editing?.author,
			assignees,
			commenters: editing?.commenters ?? [],
			_schedule:
				scheduleStart || scheduleEnd
					? {
							start_at: fromDateInput(scheduleStart) || fromDateInput(scheduleEnd),
							end_at: fromDateInput(scheduleEnd) || fromDateInput(scheduleStart)
						}
					: null,
			_drive: editing?._drive
		};
		try {
			const pending = saveTask(draft, isNew);
			closeComposer();
			await pending;
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			saving = false;
		}
	}
</script>

<CreateSheet
	{open}
	label={editing ? 'Edit task' : 'New task'}
	onclose={() => {
		if (bottomMenu) {
			bottomMenu = null;
			return;
		}
		closeComposer();
	}}
>
	<div class="task-title-row">
		<div class="status-wrapper">
			<button
				bind:this={statusBtn}
				type="button"
				class="icon-hit"
				aria-label="Set task status"
				aria-expanded={statusOpen}
				onpointerdown={keepKeyboard}
				onclick={() => {
					statusOpen = !statusOpen;
					priorityOpen = false;
				}}
			>
				<TaskBox state={status} size={24} />
			</button>
		</div>

		<input
			class="task-title-input"
			placeholder="Title of Task"
			bind:value={title}
			aria-label="Task title"
		/>

		<div class="priority-wrapper">
			<button
				bind:this={priorityBtn}
				type="button"
				class="icon-hit"
				aria-label="Set task priority"
				aria-expanded={priorityOpen}
				onpointerdown={keepKeyboard}
				onclick={() => {
					priorityOpen = !priorityOpen;
					statusOpen = false;
				}}
			>
				<PriorityBox {priority} size={22} />
			</button>
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
					bind:this={scheduleBtn}
					type="button"
					class="round-meta"
					class:on={hasSchedule || bottomMenu === 'schedule'}
					aria-label="Deadline, moment, and assignees"
					aria-expanded={bottomMenu === 'schedule'}
					onpointerdown={keepKeyboard}
					onclick={() => toggleBottom('schedule')}
				>
					{#if assignees.length > 0}
						<span class="schedule-pfps">
							{#each assignees.slice(0, 2) as a, i (a.email ?? a.name ?? i)}
								<span class="schedule-pfp" style:z-index={2 - i}>
									<ProfilePic name={a.name ?? ''} size={18} />
								</span>
							{/each}
						</span>
					{:else}
						<NavIcon name="calendar" size={18} />
					{/if}
				</button>
			</div>

			<div class="pill-wrap">
				<button
					bind:this={projectsBtn}
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					aria-label="Projects"
					aria-expanded={bottomMenu === 'projects'}
					onpointerdown={keepKeyboard}
					onclick={() => toggleBottom('projects')}
				>
					<ProjectPillsDisplay {projectIds} size={22} />
				</button>
			</div>

			<div class="pill-wrap">
				<button
					bind:this={labelsBtn}
					type="button"
					class="labels-trigger"
					class:has-labels={labels.length > 0}
					aria-label="Add labels"
					aria-expanded={bottomMenu === 'labels'}
					onpointerdown={keepKeyboard}
					onclick={() => toggleBottom('labels')}
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
			</div>
		</div>

		<button type="button" class="publish-btn" disabled={!title.trim() || saving} onclick={save}>
			{#if saving}
				<Spinner size={14} label="Saving" />
			{/if}
			{editing ? 'Save' : 'Publish'}
		</button>
	</div>
</CreateSheet>

<FloatPanel
	open={statusOpen}
	anchor={statusBtn}
	placement="below"
	width={200}
	maxHeight={320}
	onclose={() => (statusOpen = false)}
>
	<div class="float-list" role="listbox">
		{#each statuses as opt (opt.value)}
			<button
				type="button"
				class="option"
				class:active={status === opt.value}
				onclick={() => {
					status = opt.value;
					statusOpen = false;
				}}
			>
				<TaskBox state={opt.value} size={18} />
				<span class="option-text">{opt.label}</span>
			</button>
		{/each}
	</div>
</FloatPanel>

<FloatPanel
	open={priorityOpen}
	anchor={priorityBtn}
	placement="below"
	align="end"
	width={180}
	maxHeight={280}
	onclose={() => (priorityOpen = false)}
>
	<div class="float-list" role="listbox">
		{#each priorities as opt (opt.value)}
			<button
				type="button"
				class="option"
				class:active={priority === opt.value}
				onclick={() => {
					priority = opt.value;
					priorityOpen = false;
				}}
			>
				<PriorityBox priority={opt.value} size={18} />
				<span class="option-text">{opt.label}</span>
			</button>
		{/each}
	</div>
</FloatPanel>

<FloatPanel
	open={bottomMenu === 'schedule'}
	anchor={scheduleBtn}
	placement="above"
	width={280}
	maxHeight={420}
	onclose={() => (bottomMenu = null)}
>
	<div class="schedule-panel">
		<label class="date-field">
			<span class="date-label">Deadline</span>
			<input class="date-input" type="date" bind:value={deadlineDate} />
		</label>
		<label class="date-field">
			<span class="date-label">Moment start</span>
			<input class="date-input" type="date" bind:value={scheduleStart} />
		</label>
		<label class="date-field">
			<span class="date-label">Moment end</span>
			<input class="date-input" type="date" bind:value={scheduleEnd} />
		</label>
		<div class="assignee-block">
			<span class="date-label">Assignees</span>
			<div class="float-list assignee-list" role="listbox">
				{#each people as person (person.email)}
					{@const on = assignees.some((a) => a.email === person.email)}
					<button type="button" class="option" class:active={on} onclick={() => toggleAssignee(person)}>
						<ProfilePic name={person.name} size={20} />
						<span class="option-text">{person.name}</span>
						{#if on}
							<svg class="option-check" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M3.2 8.2 L6.4 11.3 L12.8 4.5"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
</FloatPanel>

<FloatPanel
	open={bottomMenu === 'projects'}
	anchor={projectsBtn}
	placement="above"
	width={240}
	maxHeight={280}
	onclose={() => (bottomMenu = null)}
>
	<div class="float-list" role="listbox">
		{#if projects.length === 0}
			<p class="menu-empty">No projects yet</p>
		{:else}
			{#each projects as project (project.id)}
				{@const on = projectIds.includes(project.id)}
				<button type="button" class="option" class:active={on} onclick={() => toggleProject(project.id)}>
					<ProjectBox
						state={projectLifecycle(project, tasks)}
						icon={projectDisplayIcon(project, enterprises)}
						size={18}
					/>
					<span class="option-text">{project.title}</span>
					{#if on}
						<svg class="option-check" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M3.2 8.2 L6.4 11.3 L12.8 4.5"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</FloatPanel>

<FloatPanel
	open={bottomMenu === 'labels'}
	anchor={labelsBtn}
	placement="above"
	width={280}
	maxHeight={360}
	onclose={() => (bottomMenu = null)}
>
	<LabelsPicker selected={labels} ontoggle={toggleLabel} onadd={addLabel} />
</FloatPanel>

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

	.float-list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 4px 0;
	}

	.menu-empty {
		margin: 0;
		padding: 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

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
		color: var(--fg);
	}

	.option:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.option:hover {
		background: var(--fg-4);
	}

	.option-text {
		flex: 1;
		min-width: 0;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option.active .option-text {
		color: var(--fg);
		font-weight: 600;
	}

	.option-check {
		flex-shrink: 0;
		color: var(--fg-66);
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

	.schedule-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		min-height: 0;
		overflow: auto;
	}

	.date-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.date-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.date-input {
		height: 36px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
	}

	.assignee-block {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 0;
		margin-top: 2px;
	}

	.assignee-list {
		max-height: 160px;
		border-radius: 10px;
		background: var(--fg-4);
	}

	.schedule-pfps {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.schedule-pfp {
		display: flex;
		margin-left: -6px;
	}

	.schedule-pfp:first-child {
		margin-left: 0;
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
		padding: 0 16px 10px;
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
		padding: 12px 16px 0;
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

	.round-meta {
		width: var(--ctrl-h);
		height: var(--ctrl-h);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		color: var(--fg-33);
		cursor: pointer;
		box-sizing: border-box;
	}

	.round-meta:hover,
	.round-meta.on,
	.round-meta[aria-expanded='true'] {
		background: var(--float-trigger-on);
		color: var(--fg-66);
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
		padding-left: 8px;
	}

	.meta-pill:hover {
		background: var(--fg-8);
	}

	.meta-pill[aria-expanded='true'],
	.labels-trigger[aria-expanded='true'] {
		background: var(--float-trigger-on);
		--trigger-bg: var(--float-trigger-on);
	}

	.pill-projects {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.pill-project {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		font-size: 13px;
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
		gap: 8px;
		border: 1px solid transparent;
		border-radius: 9999px;
		background:
			var(--button-primary-bg) padding-box,
			var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font-size: 14px;
		font-weight: 500;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
		margin-left: auto;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition: transform 0.2s var(--ease);
	}

	.publish-btn:hover:not(:disabled) {
		transform: scale(1.015);
	}

	.publish-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.publish-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
