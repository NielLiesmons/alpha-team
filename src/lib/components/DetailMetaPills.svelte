<script>
	import ProfilePic from './ProfilePic.svelte';
	import LabelPill from './LabelPill.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';
	import { patchNote, patchTask, people, projects } from '$lib/workspace.svelte.js';

	/**
	 * Shared property pills for opened Task / Note detail.
	 * Tasks also show status + priority; notes skip those.
	 * @type {{ entity: any, kind: 'task' | 'note' }}
	 */
	let { entity, kind } = $props();

	/** @type {null | 'assignees' | 'projects' | 'labels'} */
	let menu = $state(null);
	let labelDraft = $state('');
	let saving = $state(false);

	const showStatusPriority = $derived(kind === 'task');
	const showAssignees = $derived(kind === 'task');
	const assignees = $derived(entity?.assignees ?? []);
	const targets = $derived(entity?.targets ?? []);
	const labels = $derived(entity?.labels ?? []);
	const projectIds = $derived(entity?.project_ids ?? targets.map((/** @type {any} */ t) => t.id));

	/**
	 * @param {null | 'assignees' | 'projects' | 'labels'} next
	 * @param {MouseEvent} [e]
	 */
	function toggleMenu(next, e) {
		e?.stopPropagation();
		menu = menu === next ? null : next;
		if (next !== 'labels') labelDraft = '';
	}

	/** @param {MouseEvent} e */
	function closeMenu(e) {
		e.stopPropagation();
		menu = null;
		labelDraft = '';
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
			<TaskFieldPicker
				taskId={entity.id}
				field="status"
				value={entity.status}
				size={18}
				variant="pill"
			/>
		</div>
		<div class="meta-item" role="listitem">
			<TaskFieldPicker
				taskId={entity.id}
				field="priority"
				value={entity.priority}
				size={18}
				variant="pill"
			/>
		</div>
	{/if}

	{#if showAssignees}
		<div class="meta-item" role="listitem">
			<button
				type="button"
				class="meta-pill"
				class:empty={assignees.length === 0}
				aria-label="Assignees"
				aria-expanded={menu === 'assignees'}
				onclick={(e) => toggleMenu('assignees', e)}
			>
				{#if assignees.length === 0}
					<span class="empty-avatar" aria-hidden="true"></span>
					<span>Assignee</span>
				{:else}
					{#each assignees.slice(0, 3) as person, i (person.email ?? person.name ?? i)}
						<span class="stack-pic" style:margin-left={i > 0 ? '-6px' : '0'} style:z-index={3 - i}>
							<ProfilePic name={person.name ?? ''} size={18} />
						</span>
					{/each}
					<span class="pill-names">
						{assignees.map((/** @type {any} */ a) => a.name).filter(Boolean).join(', ')}
					</span>
				{/if}
			</button>
			{#if menu === 'assignees'}
				<button type="button" class="menu-backdrop" aria-label="Close" onclick={closeMenu}></button>
				<div class="menu" role="listbox">
					{#each people as person (person.email)}
						{@const on = assignees.some((/** @type {any} */ a) => a.email === person.email)}
						<button
							type="button"
							class="option"
							class:active={on}
							onclick={(e) => toggleAssignee(person, e)}
						>
							<ProfilePic name={person.name} size={18} />
							<span>{person.name}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="meta-item" role="listitem">
		<button
			type="button"
			class="meta-pill"
			class:empty={targets.length === 0}
			aria-label="Projects"
			aria-expanded={menu === 'projects'}
			onclick={(e) => toggleMenu('projects', e)}
		>
			{#if targets.length === 0}
				<span>Project</span>
			{:else}
				<span class="pill-names">{targets.map((/** @type {any} */ t) => t.label).join(', ')}</span>
			{/if}
		</button>
		{#if menu === 'projects'}
			<button type="button" class="menu-backdrop" aria-label="Close" onclick={closeMenu}></button>
			<div class="menu" role="listbox">
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
							<span>{project.title}</span>
						</button>
					{/each}
				{/if}
			</div>
		{/if}
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
			type="button"
			class="label-add"
			aria-label="Add label"
			aria-expanded={menu === 'labels'}
			onclick={(e) => toggleMenu('labels', e)}
		>
			<span class="label-add-body">Label</span>
			<svg class="label-add-tip" width="21" height="28" viewBox="0 0 24 32" fill="none" aria-hidden="true">
				<path
					d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z"
					fill="var(--tip-bg)"
				/>
			</svg>
		</button>
		{#if menu === 'labels'}
			<button type="button" class="menu-backdrop" aria-label="Close" onclick={closeMenu}></button>
			<div class="menu labels-menu" role="dialog">
				<form class="label-form" onsubmit={addLabel}>
					<input
						class="label-input"
						placeholder="New label"
						bind:value={labelDraft}
						aria-label="New label"
					/>
					<button type="submit" class="label-submit" disabled={!labelDraft.trim()}>Add</button>
				</form>
			</div>
		{/if}
	</div>
</div>

<style>
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 0 16px 12px;
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
		height: 28px;
		padding: 0 10px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		font-size: 12px;
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
	}

	.meta-pill:hover {
		background: var(--fg-8);
		color: var(--fg-66);
	}

	.empty-avatar {
		width: 18px;
		height: 18px;
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
		height: 28px;
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
		height: 28px;
		padding: 0 2px 0 10px;
		background: var(--tip-bg);
		border-radius: 10px 0 0 10px;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
		white-space: nowrap;
	}

	.label-add-tip {
		display: block;
		flex-shrink: 0;
		width: 21px;
		height: 28px;
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

	.menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		min-width: 168px;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 8px 28px color-mix(in srgb, var(--fg-raw) 18%, transparent);
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

	@media (max-width: 767px) {
		.meta-row {
			flex-wrap: nowrap;
			overflow-x: auto;
			overflow-y: hidden;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
			padding-bottom: 14px;
		}

		.meta-row::-webkit-scrollbar {
			display: none;
		}
	}
</style>
