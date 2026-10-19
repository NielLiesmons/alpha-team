<script>
	import { tick } from 'svelte';
	import { activePerson } from '$lib/actor.svelte.js';
	import ProfilePic from './ProfilePic.svelte';
	import ProfilePicStack from './ProfilePicStack.svelte';
	import LabelPill from './LabelPill.svelte';
	import TaskBox from './TaskBox.svelte';
	import PriorityBox from './PriorityBox.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import ProjectPillsDisplay from './ProjectPillsDisplay.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
	import { patchNote, patchTask, people, projects, tasks } from '$lib/workspace.svelte.js';

	const STATUSES = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'open', label: 'Open' },
		{ value: 'inProgress', label: 'In progress' },
		{ value: 'inReview', label: 'In review' },
		{ value: 'closed', label: 'Closed' },
		{ value: 'canceled', label: 'Canceled' }
	];

	const PRIORITIES = [
		{ value: 'none', label: 'None' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'urgent', label: 'Urgent' }
	];

	/**
	 * Shared property pills for opened Task / Note detail.
	 * @type {{ entity: any, kind: 'task' | 'note' }}
	 */
	let { entity, kind } = $props();

	/** @type {null | 'status' | 'priority' | 'assignees' | 'projects' | 'labels'} */
	let menu = $state(null);
	let labelDraft = $state('');
	let saving = $state(false);

	/** @type {HTMLButtonElement | undefined} */
	let statusBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let priorityBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let assigneeBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let projectsBtn = $state();
	/** @type {HTMLButtonElement | undefined} */
	let labelsBtn = $state();
	/** @type {HTMLInputElement | undefined} */
	let labelInput = $state();

	const showStatusPriority = $derived(kind === 'task');
	const showAssignees = $derived(kind === 'task');
	const assignees = $derived(entity?.assignees ?? []);
	const targets = $derived(entity?.targets ?? []);
	const labels = $derived(entity?.labels ?? []);
	const projectIds = $derived(entity?.project_ids ?? targets.map((/** @type {any} */ t) => t.id));
	const statusLabel = $derived(
		STATUSES.find((s) => s.value === entity?.status)?.label ?? entity?.status ?? 'Open'
	);
	const priorityLabel = $derived(
		PRIORITIES.find((p) => p.value === entity?.priority)?.label ?? entity?.priority ?? 'None'
	);
	const me = $derived(activePerson());

	/**
	 * @param {null | 'status' | 'priority' | 'assignees' | 'projects' | 'labels'} next
	 * @param {MouseEvent} [e]
	 */
	function toggleMenu(next, e) {
		e?.stopPropagation();
		menu = menu === next ? null : next;
		if (next !== 'labels') labelDraft = '';
	}

	function closeMenu() {
		menu = null;
		labelDraft = '';
	}

	$effect(() => {
		if (menu === 'labels') tick().then(() => labelInput?.focus());
	});

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

	/**
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

	/**
	 * @param {Event} e
	 */
	async function addLabel(e) {
		e.preventDefault();
		const text = labelDraft.trim();
		if (!text) return;
		if (!labels.includes(text)) {
			await apply({ labels: [...labels, text] });
		}
		labelDraft = '';
		menu = null;
	}
</script>

<div class="meta-row" role="list">
	{#if showStatusPriority}
		<div class="meta-item" role="listitem">
			<button
				bind:this={statusBtn}
				type="button"
				class="meta-pill"
				aria-label="Status"
				aria-expanded={menu === 'status'}
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
				aria-label="Priority"
				aria-expanded={menu === 'priority'}
				onclick={(e) => toggleMenu('priority', e)}
			>
				<PriorityBox priority={entity.priority} size={18} />
				<span>{priorityLabel}</span>
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
				aria-label="Assignees"
				aria-expanded={menu === 'assignees'}
				onclick={(e) => toggleMenu('assignees', e)}
			>
				{#if assignees.length === 0}
					<ProfilePic name={me.name} size={20} />
					<span>Assignee</span>
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
			aria-label="Projects"
			aria-expanded={menu === 'projects'}
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
			aria-label="Remove label {labelText}"
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
			aria-label="Add label"
			aria-expanded={menu === 'labels'}
			onclick={(e) => toggleMenu('labels', e)}
		>
			<span class="label-add-body">Label</span>
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
				<button
					type="button"
					class="option"
					class:active={entity.status === opt.value}
					onclick={(e) => pickStatus(opt.value, e)}
				>
					<TaskBox state={opt.value} size={20} />
					<span>{opt.label}</span>
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
				<button
					type="button"
					class="option"
					class:active={entity.priority === opt.value}
					onclick={(e) => pickPriority(opt.value, e)}
				>
					<PriorityBox priority={opt.value} size={18} />
					<span>{opt.label}</span>
				</button>
			{/each}
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
					<span>{person.name}</span>
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
			<p class="menu-empty">No projects yet</p>
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
						state={deriveProjectStatus(project.id, tasks)}
						icon={project.icon}
						size={18}
					/>
					<span>{project.title}</span>
				</button>
			{/each}
		{/if}
	</div>
</FloatPanel>

<FloatPanel
	open={menu === 'labels'}
	anchor={labelsBtn}
	placement="below"
	width={240}
	maxHeight={160}
	onclose={closeMenu}
>
	<form class="label-form" onsubmit={addLabel}>
		<input
			bind:this={labelInput}
			class="label-input"
			placeholder="New label"
			bind:value={labelDraft}
			aria-label="New label"
		/>
		<button type="submit" class="label-submit" disabled={!labelDraft.trim()}>Add</button>
	</form>
</FloatPanel>

<style>
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 0 16px 10px;
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
		color: var(--fg-66);
		font-family: inherit;
	}

	.option:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.option:hover {
		background: var(--fg-4);
	}

	.option.active {
		color: var(--fg);
		font-weight: 600;
	}

	.label-form {
		display: flex;
		gap: 6px;
		align-items: center;
		padding: 10px;
	}

	.label-input {
		flex: 1;
		min-width: 0;
		height: 34px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		outline: none;
	}

	.label-submit {
		height: 34px;
		padding: 0 12px;
		border: 0;
		border-radius: 10px;
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
