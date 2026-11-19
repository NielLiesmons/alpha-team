<script>
	import { activePerson } from '$lib/actor.svelte.js';
	import ProfilePic from './ProfilePic.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import LabelPill from './LabelPill.svelte';
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import LabelsPicker from './LabelsPicker.svelte';
	import NavIcon from './NavIcon.svelte';
	import { locale, t } from '$lib/i18n.svelte.js';
	import { projectDisplayIcon, projectLifecycle } from '$lib/project-status.js';
	import {
		enterprises,
		moments,
		patchNote,
		patchTask,
		people,
		projects,
		tasks
	} from '$lib/workspace.svelte.js';

	const STATUSES = [
		{ value: 'backlog', labelKey: 'tasks.statusBacklog' },
		{ value: 'open', labelKey: 'tasks.statusOpen' },
		{ value: 'planned', labelKey: 'tasks.statusPlanned' },
		{ value: 'inProgress', labelKey: 'tasks.statusInProgress' },
		{ value: 'inReview', labelKey: 'tasks.statusInReview' },
		{ value: 'closed', labelKey: 'tasks.statusClosed' },
		{ value: 'canceled', labelKey: 'tasks.statusCanceled' }
	];

	const PRIORITIES = [
		{ value: 'none', labelKey: 'tasks.priorityNone' },
		{ value: 'low', labelKey: 'tasks.priorityLow' },
		{ value: 'medium', labelKey: 'tasks.priorityMedium' },
		{ value: 'high', labelKey: 'tasks.priorityHigh' },
		{ value: 'urgent', labelKey: 'tasks.priorityUrgent' }
	];

	/**
	 * Shared property pills for opened Task / Note detail.
	 * @type {{ entity: any, kind: 'task' | 'note' }}
	 */
	let { entity, kind } = $props();

	/** @type {null | 'status' | 'priority' | 'schedule' | 'assignees' | 'projects' | 'labels'} */
	let menu = $state(null);
	let saving = $state(false);
	let deadlineDate = $state('');
	let scheduleStart = $state('');
	let scheduleEnd = $state('');
	/** @type {{ email?: string, name?: string }[]} */
	let scheduleAssignees = $state([]);

	/** @type {HTMLButtonElement | undefined} */
	let statusBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let priorityBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let scheduleBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let assigneeBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let projectsBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let labelsBtn = $state();
	/* Status + priority live in the open-task title row */
	const showStatusPriority = $derived(false);
	const showSchedule = $derived(kind === 'task');
	const showAssignees = $derived(kind === 'task');
	const assignees = $derived(entity?.assignees ?? []);
	const targets = $derived(entity?.targets ?? []);
	const labels = $derived(entity?.labels ?? []);
	const projectIds = $derived(entity?.project_ids ?? targets.map((/** @type {any} */ tg) => tg.id));
	const me = $derived(activePerson());
	const statusLabel = $derived.by(() => {
		locale.value;
		const key = STATUSES.find((s) => s.value === entity?.status)?.labelKey;
		return key ? t(key) : (entity?.status ?? t('tasks.statusOpen'));
	});
	const priorityLabel = $derived.by(() => {
		locale.value;
		const key = PRIORITIES.find((p) => p.value === entity?.priority)?.labelKey;
		return key ? t(key) : (entity?.priority ?? t('tasks.priorityNone'));
	});
	const linkedMoment = $derived(
		kind === 'task' && entity?.id
			? moments.find((m) => m.task_id === entity.id && !m.recurrence)
			: null
	);
	const hasSchedule = $derived(
		Boolean(entity?.deadline_at || linkedMoment?.start_at || linkedMoment?.end_at)
	);

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

	function loadScheduleDraft() {
		deadlineDate = toDateInput(entity?.deadline_at);
		scheduleStart = toDateInput(linkedMoment?.start_at);
		scheduleEnd = toDateInput(linkedMoment?.end_at);
		scheduleAssignees = [...(entity?.assignees ?? [])];
	}

	/**
	 * @param {null | 'status' | 'priority' | 'schedule' | 'assignees' | 'projects' | 'labels'} next
	 * @param {MouseEvent} [e]
	 */
	function toggleMenu(next, e) {
		e?.stopPropagation();
		const opening = menu !== next;
		menu = opening ? next : null;
		if (opening && next === 'schedule') loadScheduleDraft();
	}

	function closeMenu() {
		menu = null;
	}

	/** @param {PointerEvent} e */
	function keepKeyboard(e) {
		e.preventDefault();
	}

	/**
	 * @param {Record<string, unknown>} patch
	 */
	async function apply(patch) {
		if (!entity?.id || saving) return;
		saving = true;
		try {
			if (kind === 'note') await patchNote(entity.id, patch);
			else await patchTask(entity.id, patch);
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	/**
	 * @param {string} value
	 * @param {MouseEvent} e
	 */
	async function pickStatus(value, e) {
		e.stopPropagation();
		menu = null;
		if (value === entity?.status) return;
		await apply({ status: value });
	}

	/**
	 * @param {string} value
	 * @param {MouseEvent} e
	 */
	async function pickPriority(value, e) {
		e.stopPropagation();
		menu = null;
		if (value === entity?.priority) return;
		await apply({ priority: value });
	}

	async function persistSchedule() {
		await apply({
			deadline_at: fromDateInput(deadlineDate),
			_schedule:
				scheduleStart || scheduleEnd
					? {
							start_at: fromDateInput(scheduleStart) || fromDateInput(scheduleEnd),
							end_at: fromDateInput(scheduleEnd) || fromDateInput(scheduleStart)
						}
					: null
		});
	}

	/**
	 * Assignees toggled from the dedicated Assignees pill (not Planning).
	 * @param {{ email: string, name: string }} person
	 * @param {MouseEvent} e
	 */
	async function toggleAssignee(person, e) {
		e.stopPropagation();
		const key = person.email;
		const has = assignees.some((/** @type {any} */ a) => (a.email || a.name) === key);
		const next = has
			? assignees.filter((/** @type {any} */ a) => (a.email || a.name) !== key)
			: [...assignees, person];
		await apply({ assignees: next });
	}

	/**
	 * Keep draft list in sync when toggling from inside the Planning panel.
	 * @param {{ email: string, name: string }} person
	 * @param {MouseEvent} e
	 */
	async function toggleScheduleAssignee(person, e) {
		e.stopPropagation();
		const key = person.email;
		const has = scheduleAssignees.some((a) => (a.email || a.name) === key);
		scheduleAssignees = has
			? scheduleAssignees.filter((a) => (a.email || a.name) !== key)
			: [...scheduleAssignees, person];
		await apply({ assignees: scheduleAssignees });
	}

	async function onScheduleDateChange() {
		await persistSchedule();
	}

	/**
	 * @param {string} id
	 * @param {MouseEvent} e
	 */
	async function toggleProject(id, e) {
		e.stopPropagation();
		const has = projectIds.includes(id);
		const nextIds = has ? projectIds.filter((/** @type {string} */ x) => x !== id) : [...projectIds, id];
		const nextTargets = nextIds.map((pid) => ({
			id: pid,
			label: projects.find((p) => p.id === pid)?.title ?? pid
		}));
		await apply({ project_ids: nextIds, targets: nextTargets });
	}

	/**
	 * @param {string} text
	 * @param {MouseEvent} [e]
	 */
	async function removeLabel(text, e) {
		e?.stopPropagation();
		await apply({ labels: labels.filter((/** @type {string} */ l) => l !== text) });
	}

	/** @param {string} text */
	async function addLabel(text) {
		const label = text.trim();
		if (!label) return;
		if (!labels.includes(label)) await apply({ labels: [...labels, label] });
	}

	/** @param {string} text */
	async function toggleLabel(text) {
		if (labels.includes(text)) {
			await apply({ labels: labels.filter((/** @type {string} */ l) => l !== text) });
		} else {
			await apply({ labels: [...labels, text] });
		}
	}
</script>

<div class="meta-row" role="list">
	{#if showStatusPriority}
		<div class="meta-item" role="listitem">
			<button
				bind:this={statusBtn}
				type="button"
				class="meta-pill"
				aria-label={t('meta.status')}
				aria-expanded={menu === 'status'}
				onpointerdown={keepKeyboard}
				onclick={(e) => toggleMenu('status', e)}
			>
				<TaskBox state={entity.status} size={20} />
				<span>{statusLabel}</span>
			</button>
		</div>
		<div class="meta-item" role="listitem">
			<button
				bind:this={priorityBtn}
				type="button"
				class="meta-pill"
				aria-label={t('meta.priority')}
				aria-expanded={menu === 'priority'}
				onpointerdown={keepKeyboard}
				onclick={(e) => toggleMenu('priority', e)}
			>
				<PriorityBox priority={entity.priority} size={18} />
				<span>{priorityLabel}</span>
			</button>
		</div>
	{/if}

	{#if showSchedule}
		<div class="meta-item" role="listitem">
			<button
				bind:this={scheduleBtn}
				type="button"
				class="meta-pill"
				class:empty={!hasSchedule}
				aria-label={t('meta.deadlineMomentAssignees')}
				aria-expanded={menu === 'schedule'}
				onpointerdown={keepKeyboard}
				onclick={(e) => toggleMenu('schedule', e)}
			>
				<span class="planning-ico">
					<NavIcon name="planning" size={14} />
				</span>
				<span>{t('meta.planning')}</span>
			</button>
		</div>
	{/if}

	{#if showAssignees}
		<div class="meta-item" role="listitem">
			<button
				bind:this={assigneeBtn}
				type="button"
				class="meta-pill"
				class:empty={assignees.length === 0}
				aria-label={t('meta.assignees')}
				aria-expanded={menu === 'assignees'}
				onpointerdown={keepKeyboard}
				onclick={(e) => toggleMenu('assignees', e)}
			>
				{#if assignees.length === 0}
					<ProfilePic name={me.name} size={20} />
					<span>{t('meta.assignee')}</span>
				{:else}
					<ProfilePicStack profiles={assignees} size="xs" />
					<span class="pill-names">
						{assignees.map((/** @type {any} */ a) => a.name).filter(Boolean).join(', ')}
					</span>
				{/if}
			</button>
		</div>
	{/if}

	<div class="meta-item" role="listitem">
		<button
			bind:this={projectsBtn}
			type="button"
			class="meta-pill"
			class:empty={targets.length === 0}
			aria-label={t('meta.projects')}
			aria-expanded={menu === 'projects'}
			onpointerdown={keepKeyboard}
			onclick={(e) => toggleMenu('projects', e)}
		>
			<ProjectPillsDisplay {projectIds} />
		</button>
	</div>

	{#each labels as labelText (labelText)}
		<button
			type="button"
			class="meta-label"
			role="listitem"
			aria-label="{t('meta.removeLabel')} {labelText}"
			onclick={(e) => removeLabel(labelText, e)}
		>
			<LabelPill text={labelText} size="meta" />
		</button>
	{/each}

	<div class="meta-item" role="listitem">
		<button
			bind:this={labelsBtn}
			type="button"
			class="label-add"
			aria-label={t('meta.addLabel')}
			aria-expanded={menu === 'labels'}
			onpointerdown={keepKeyboard}
			onclick={(e) => toggleMenu('labels', e)}
		>
			<span class="label-add-body">{t('meta.label')}</span>
			<svg class="label-add-tip" width="24" height="32" viewBox="0 0 24 32" fill="none" aria-hidden="true">
				<path
					d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z"
					fill="var(--tip-bg)"
				/>
			</svg>
		</button>
	</div>
</div>

{#if showStatusPriority}
	<FloatPanel
		open={menu === 'status'}
		anchor={statusBtn}
		placement="below"
		width={200}
		maxHeight={320}
		onclose={closeMenu}
	>
		<div class="float-list" role="listbox">
			{#each STATUSES as opt (opt.value)}
				{@const on = entity.status === opt.value}
				<button
					type="button"
					class="option"
					class:active={on}
					onclick={(e) => pickStatus(opt.value, e)}
				>
					<TaskBox state={opt.value} size={20} />
					<span class="option-text">{t(opt.labelKey)}</span>
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
	</FloatPanel>
	<FloatPanel
		open={menu === 'priority'}
		anchor={priorityBtn}
		placement="below"
		width={180}
		maxHeight={280}
		onclose={closeMenu}
	>
		<div class="float-list" role="listbox">
			{#each PRIORITIES as opt (opt.value)}
				{@const on = entity.priority === opt.value}
				<button
					type="button"
					class="option"
					class:active={on}
					onclick={(e) => pickPriority(opt.value, e)}
				>
					<PriorityBox priority={opt.value} size={18} />
					<span class="option-text">{t(opt.labelKey)}</span>
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
	</FloatPanel>
{/if}

{#if showSchedule}
	<FloatPanel
		open={menu === 'schedule'}
		anchor={scheduleBtn}
		placement="below"
		width={280}
		maxHeight={420}
		onclose={closeMenu}
	>
		<div class="schedule-panel">
			<label class="date-field">
				<span class="date-label">{t('meta.deadline')}</span>
				<input
					class="date-input"
					type="date"
					bind:value={deadlineDate}
					onchange={onScheduleDateChange}
				/>
			</label>
			<label class="date-field">
				<span class="date-label">{t('meta.momentStart')}</span>
				<input
					class="date-input"
					type="date"
					bind:value={scheduleStart}
					onchange={onScheduleDateChange}
				/>
			</label>
			<label class="date-field">
				<span class="date-label">{t('meta.momentEnd')}</span>
				<input
					class="date-input"
					type="date"
					bind:value={scheduleEnd}
					onchange={onScheduleDateChange}
				/>
			</label>
			<div class="assignee-block">
				<span class="date-label">{t('meta.assignees')}</span>
				<div class="float-list assignee-list" role="listbox">
					{#each people as person (person.email)}
						{@const on = scheduleAssignees.some((a) => a.email === person.email)}
						<button
							type="button"
							class="option"
							class:active={on}
							onclick={(e) => toggleScheduleAssignee(person, e)}
						>
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
{/if}

{#if showAssignees}
	<FloatPanel
		open={menu === 'assignees'}
		anchor={assigneeBtn}
		placement="below"
		width={220}
		maxHeight={280}
		onclose={closeMenu}
	>
		<div class="float-list" role="listbox">
			{#each people as person (person.email)}
				{@const on = assignees.some((/** @type {any} */ a) => a.email === person.email)}
				<button
					type="button"
					class="option"
					class:active={on}
					onclick={(e) => toggleAssignee(person, e)}
				>
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
	</FloatPanel>
{/if}

<FloatPanel
	open={menu === 'projects'}
	anchor={projectsBtn}
	placement="below"
	width={240}
	maxHeight={280}
	onclose={closeMenu}
>
	<div class="float-list" role="listbox">
		{#if projects.length === 0}
			<p class="menu-empty">{t('meta.noProjects')}</p>
		{:else}
			{#each projects as project (project.id)}
				{@const on = projectIds.includes(project.id)}
				<button
					type="button"
					class="option"
					class:active={on}
					onclick={(e) => toggleProject(project.id, e)}
				>
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
	open={menu === 'labels'}
	anchor={labelsBtn}
	placement="below"
	width={280}
	maxHeight={360}
	onclose={closeMenu}
>
	<LabelsPicker selected={labels} ontoggle={toggleLabel} onadd={addLabel} />
</FloatPanel>

<style>
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 0 0 10px;
		box-sizing: border-box;
	}

	.meta-item {
		position: relative;
		flex-shrink: 0;
	}

	.meta-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 12px 0 8px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
		white-space: nowrap;
		flex-shrink: 0;
		box-sizing: border-box;
		cursor: pointer;
		font-family: inherit;
	}

	.meta-pill.empty {
		color: var(--fg-33);
		padding-left: 10px;
	}

	.meta-pill:hover {
		background: var(--fg-8);
		color: var(--fg-66);
	}

	.meta-pill[aria-expanded='true'],
	.label-add[aria-expanded='true'] {
		background: var(--float-trigger-on);
		--tip-bg: var(--float-trigger-on);
	}

	.pill-names {
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta-label {
		display: inline-flex;
		flex-shrink: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.meta-label :global(.label) {
		pointer-events: none;
	}

	.label-add {
		display: inline-flex;
		align-items: center;
		height: 32px;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		flex-shrink: 0;
		--tip-bg: var(--fg-4);
	}

	.label-add:hover {
		--tip-bg: var(--fg-8);
	}

	.label-add-body {
		display: flex;
		align-items: center;
		height: 32px;
		padding: 0 2px 0 12px;
		background: var(--tip-bg);
		border-radius: 12px 0 0 12px;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
		white-space: nowrap;
	}

	.label-add-tip {
		display: block;
		flex-shrink: 0;
		width: 24px;
		height: 32px;
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
		padding: 10px 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

	.option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: none;
		cursor: pointer;
		text-align: left;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--fg);
		font-family: inherit;
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
	}

	.assignee-list {
		max-height: 160px;
		border-radius: 10px;
		background: var(--fg-4);
	}

	.schedule-pfps {
		display: flex;
		align-items: center;
	}

	.schedule-pfp {
		display: flex;
		margin-left: -5px;
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
	.meta-pill[aria-expanded='true'] .planning-ico {
		color: var(--fg-66);
	}

	@media (max-width: 767px) {
		.meta-row {
			flex-wrap: nowrap;
			overflow-x: auto;
			overflow-y: hidden;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
			padding-bottom: 8px;
		}

		.meta-row::-webkit-scrollbar {
			display: none;
		}
	}
</style>
