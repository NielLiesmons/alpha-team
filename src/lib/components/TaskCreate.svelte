<script>
	import CreateSheet from './CreateSheet.svelte';
	import DropdownMenu from './DropdownMenu.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import Spinner from './Spinner.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import LabelsPicker from './LabelsPicker.svelte';
	import NavIcon from './NavIcon.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n.svelte.js';
	import { countTaskMoments } from '$lib/moment-expand.js';
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
		{ value: 'backlog', labelKey: 'tasks.statusBacklog' },
		{ value: 'open', labelKey: 'tasks.statusOpen' },
		{ value: 'planned', labelKey: 'tasks.statusPlanned' },
		{ value: 'inProgress', labelKey: 'tasks.statusInProgress' },
		{ value: 'inReview', labelKey: 'tasks.statusInReview' },
		{ value: 'closed', labelKey: 'tasks.statusClosed' },
		{ value: 'canceled', labelKey: 'tasks.statusCanceled' }
	];

	const priorities = [
		{ value: 'none', labelKey: 'tasks.priorityNone' },
		{ value: 'low', labelKey: 'tasks.priorityLow' },
		{ value: 'medium', labelKey: 'tasks.priorityMedium' },
		{ value: 'high', labelKey: 'tasks.priorityHigh' },
		{ value: 'urgent', labelKey: 'tasks.priorityUrgent' }
	];

	let title = $state('');
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	let body = $state('');
	/** @type {import('@tiptap/core').Editor | null} */
	let tipTap = $state(null);
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
	/** @type {string | null} */
	let mailThreadId = $state(null);
	/** @type {null | 'schedule' | 'projects' | 'labels'} */
	let bottomMenu = $state(null);
	/** @type {HTMLButtonElement | undefined} */
	let scheduleBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let projectsBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let labelsBtn = $state();
	let saving = $state(false);
	const momentCount = $derived(
		editing?.id ? countTaskMoments(moments, editing.id) : 0
	);
	const hasSchedule = $derived(
		Boolean(deadlineDate || scheduleStart || scheduleEnd || assignees.length || momentCount > 0)
	);

	function openPlanningForTask() {
		bottomMenu = null;
		closeComposer();
		void goto('/planning');
	}

	/** Keep title/body keyboard open while tapping pills / menus. */
	/** @param {PointerEvent} e */
	function keepKeyboard(e) {
		e.preventDefault();
	}

	const editing = $derived(ui.composer?.kind === 'task' ? tasks.find((item) => item.id === ui.composer.id) : null);
	const open = $derived(ui.composer?.kind === 'task');

	const mailContextTitle = $derived(
		mailThreadId
			? String(editing?.title || title || ui.composer?.title || '').trim()
			: ''
	);

	$effect(() => {
		if (!open) {
			saving = false;
			return;
		}
		const seed = ui.composer || {};
		title = editing?.title ?? (typeof seed.title === 'string' ? seed.title : '') ?? '';
		body = editing?.body ?? (typeof seed.body === 'string' ? seed.body : '') ?? '';
		status = editing?.status ?? seed.status ?? 'open';
		priority =
			editing?.priority ??
			(typeof seed.priority === 'string' ? seed.priority : 'none') ??
			'none';
		labels = [...(editing?.labels ?? [])];
		projectIds = [
			...(editing?.project_ids ??
				(Array.isArray(seed.project_ids) ? seed.project_ids : []))
		];
		assignees = [...(editing?.assignees ?? [])];
		mailThreadId =
			editing?.mail_thread_id ??
			editing?._drive?.mail_thread_id ??
			(typeof seed.mail_thread_id === 'string' ? seed.mail_thread_id : null) ??
			null;
		deadlineDate = toDateInput(editing?.deadline_at);
		/* One-off window only — recurring / many moments live on Planning. */
		const linked = editing
			? moments.find((m) => m.task_id === editing.id && !m.recurrence)
			: null;
		scheduleStart = toDateInput(linked?.start_at ?? editing?._schedule?.start_at);
		scheduleEnd = toDateInput(linked?.end_at ?? editing?._schedule?.end_at);
		statusOpen = false;
		priorityOpen = false;
		bottomMenu = null;
		saving = false;
		queueMicrotask(() => titleInput?.focus());
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
		const label = text.trim();
		if (!label) return;
		if (!labels.includes(label)) labels = [...labels, label];
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
			mail_thread_id: mailThreadId,
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
	label={editing ? t('tasks.task') : t('create.task')}
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
				aria-label={t('meta.status')}
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
			bind:this={titleInput}
			class="task-title-input"
			placeholder={t('tasks.titlePlaceholder')}
			bind:value={title}
			aria-label={t('tasks.titlePlaceholder')}
		/>

		<div class="priority-wrapper">
			<button
				bind:this={priorityBtn}
				type="button"
				class="icon-hit"
				aria-label={t('meta.priority')}
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

	{#if mailThreadId}
		<p class="mail-from-line">{t('tasks.fromMail', { subject: mailContextTitle || '…' })}</p>
	{/if}

	<div class="post-form-divider"></div>

	<div class="task-body-wrap">
		{#if open}
			<NoteEditor
				value={body}
				placeholder={t('tasks.typeCommands')}
				onChange={(html) => (body = html)}
				onReady={(ed) => (tipTap = ed)}
			/>
		{/if}
	</div>

	<div class="post-action-row">
		<EditorToolbar editor={tipTap} />
	</div>

	<div class="post-form-divider"></div>

	<div class="task-bottom-row">
		<div class="bottom-pills">
			<div class="pill-wrap">
				<button
					bind:this={scheduleBtn}
					type="button"
					class="meta-pill"
					class:empty={!hasSchedule}
					class:on={hasSchedule || bottomMenu === 'schedule'}
					aria-label={t('tasks.planning')}
					aria-expanded={bottomMenu === 'schedule'}
					onpointerdown={keepKeyboard}
					onclick={() => toggleBottom('schedule')}
				>
					{#if assignees.length > 0}
						<span class="schedule-pfps">
							{#each assignees.slice(0, 2) as a, i (a.email ?? a.name ?? i)}
								<span class="schedule-pfp" style:z-index={2 - i}>
									<ProfilePic name={a.name ?? ''} size={16} />
								</span>
							{/each}
						</span>
					{:else}
						<span class="planning-ico">
							<NavIcon name="planning" size={15} />
						</span>
					{/if}
					<span>{t('tasks.planning')}</span>
				</button>
			</div>

			<div class="pill-wrap">
				<button
					bind:this={projectsBtn}
					type="button"
					class="meta-pill"
					class:empty={projectIds.length === 0}
					aria-label={t('tasks.projects')}
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
					aria-label={t('tasks.addLabels')}
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

		<PrimaryButton size="sheet" disabled={!title.trim() || saving} onclick={save}>
			{#if saving}
				<Spinner size={14} label={t('common.saving')} />
			{/if}
			{editing ? t('common.save') : t('tasks.publish')}
		</PrimaryButton>
	</div>
</CreateSheet>

<DropdownMenu
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
				<span class="option-text">{t(opt.labelKey)}</span>
			</button>
		{/each}
	</div>
</DropdownMenu>

<DropdownMenu
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
				<span class="option-text">{t(opt.labelKey)}</span>
			</button>
		{/each}
	</div>
</DropdownMenu>

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
			<span class="date-label">{t('tasks.deadline')}</span>
			<input class="date-input" type="date" bind:value={deadlineDate} />
		</label>

		<div class="moments-block">
			<span class="date-label">{t('tasks.moments')}</span>
			<p class="moments-copy">
				{#if momentCount > 0}
					{t('tasks.linkedMoments', { n: momentCount.toLocaleString() })}
				{:else}
					{t('tasks.planningHint')}
				{/if}
			</p>
			<button type="button" class="planning-link" onclick={openPlanningForTask}>
				{t('tasks.openPlanning')}
			</button>
			<details class="one-off">
				<summary>{t('tasks.optionalWindow')}</summary>
				<label class="date-field">
					<span class="date-label">{t('tasks.start')}</span>
					<input class="date-input" type="date" bind:value={scheduleStart} />
				</label>
				<label class="date-field">
					<span class="date-label">{t('tasks.end')}</span>
					<input class="date-input" type="date" bind:value={scheduleEnd} />
				</label>
			</details>
		</div>

		<div class="assignee-block">
			<span class="date-label">{t('tasks.assignees')}</span>
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
			<p class="menu-empty">{t('tasks.noProjects')}</p>
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
		padding: 12px 16px 10px;
		position: relative;
		z-index: 2;
	}

	.mail-from-line {
		margin: 0;
		padding: 0 16px 8px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-33);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		font-size: 0.8125rem;
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
		font-size: 1.125rem;
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

	.moments-block {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 4px;
	}

	.moments-copy {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--fg-66);
	}

	.planning-link {
		align-self: flex-start;
		height: 32px;
		padding: 0 12px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}

	.planning-link:hover {
		background: var(--fg-12);
	}

	.one-off {
		margin: 0;
		font-size: 0.75rem;
		color: var(--fg-66);
	}

	.one-off summary {
		cursor: pointer;
		font-weight: 500;
		margin-bottom: 6px;
	}

	.one-off[open] summary {
		margin-bottom: 8px;
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
		font-size: 0.6875rem;
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
		font-size: 0.875rem;
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

	.planning-ico {
		display: inline-flex;
		color: var(--fg-33);
		line-height: 0;
	}

	.meta-pill:not(.empty) .planning-ico,
	.meta-pill.on .planning-ico,
	.meta-pill[aria-expanded='true'] .planning-ico {
		color: var(--fg-66);
	}

	.task-body-wrap {
		min-height: 140px;
		max-height: 360px;
		overflow: auto;
		padding: 10px 16px;
		box-sizing: border-box;
	}

	.post-action-row {
		display: flex;
		align-items: center;
		padding: 0 16px 10px;
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
		font-size: 0.875rem;
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
		font-size: 0.8125rem;
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
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.875rem;
		font-weight: 600;
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		line-height: 1;
		color: var(--fg-16);
	}

	.labels-trigger.has-labels .trigger-count {
		color: var(--fg-66);
	}

	.trigger-text {
		font-size: 0.875rem;
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
		font-size: 0.8125rem;
		color: var(--fg-33);
	}

</style>
