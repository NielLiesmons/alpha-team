<script>
	import CreateSheet from './CreateSheet.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import { projectDisplayIcon, projectLifecycle } from '$lib/project-status.js';
	import {
		closeComposer,
		enterprises,
		projects,
		saveProject,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	let title = $state('');
	let description = $state('');
	/** @type {string | null} */
	let icon = $state(null);
	/** Index 0 = primary; further ids are ordered secondaries */
	/** @type {string[]} */
	let enterpriseIds = $state([]);
	/** @type {'active' | 'archived'} */
	let lifecycle = $state('active');
	let enterprisesOpen = $state(false);
	/** @type {HTMLButtonElement | undefined} */
	let boxBtn = $state();
	const editing = $derived(
		ui.composer?.kind === 'project' ? projects.find((item) => item.id === ui.composer.id) : null
	);
	const open = $derived(ui.composer?.kind === 'project');
	const previewStatus = $derived(
		editing ? projectLifecycle(editing, tasks) : lifecycle
	);
	const primaryId = $derived(enterpriseIds[0] ?? null);
	const displayIcon = $derived(
		projectDisplayIcon(
			{ icon, primary_enterprise_id: primaryId, enterprise_ids: enterpriseIds },
			enterprises
		)
	);

	const sortedEnterprises = $derived(
		[...enterprises].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.title.localeCompare(b.title))
	);

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		description = editing?.description ?? editing?.summary ?? editing?.body ?? '';
		icon = editing?.icon ?? null;
		lifecycle = editing ? projectLifecycle(editing, tasks) : 'active';
		const seedPrimary =
			typeof ui.composer?.primary_enterprise_id === 'string'
				? ui.composer.primary_enterprise_id
				: null;
		const primary = editing?.primary_enterprise_id ?? seedPrimary;
		const ids = [...(editing?.enterprise_ids ?? (seedPrimary ? [seedPrimary] : []))];
		if (primary && ids.includes(primary)) {
			enterpriseIds = [primary, ...ids.filter((x) => x !== primary)];
		} else if (primary) {
			enterpriseIds = [primary, ...ids];
		} else {
			enterpriseIds = ids;
		}
		enterprisesOpen = false;
	});

	/** Toggle membership; order = selection order (1 = primary). Unselecting renumbers. */
	/** @param {string} id */
	function toggleEnterprise(id) {
		const i = enterpriseIds.indexOf(id);
		if (i >= 0) {
			enterpriseIds = enterpriseIds.filter((x) => x !== id);
			return;
		}
		enterpriseIds = [...enterpriseIds, id];
	}

	/** @param {string} id */
	function rankOf(id) {
		const i = enterpriseIds.indexOf(id);
		return i >= 0 ? i + 1 : 0;
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		if (sortedEnterprises.length > 0 && !enterpriseIds[0]) {
			alert('Pick at least one enterprise for this project');
			return;
		}
		try {
			await saveProject(
				{
					id: editing?.id,
					title: nextTitle,
					description,
					icon,
					milestones: editing?.milestones ?? [],
					status: lifecycle,
					enterprise_ids: enterpriseIds,
					primary_enterprise_id: enterpriseIds[0] ?? null,
					depends_on: editing?.depends_on ?? []
				},
				!editing
			);
			closeComposer();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<CreateSheet
	{open}
	label={editing ? 'Edit project' : 'New project'}
	onclose={() => {
		if (enterprisesOpen) {
			enterprisesOpen = false;
			return;
		}
		closeComposer();
	}}
>
	<div class="sheet-title-row">
		<button
			bind:this={boxBtn}
			type="button"
			class="box-hit"
			class:on={enterprisesOpen}
			aria-label="Enterprises"
			aria-expanded={enterprisesOpen}
			onclick={() => (enterprisesOpen = !enterprisesOpen)}
		>
			<ProjectBox state={previewStatus} icon={displayIcon} size={28} />
		</button>
		<input class="sheet-input" placeholder="Project title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="Description" bind:value={description}></textarea>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<button
			type="button"
			class="meta-pill"
			class:on={lifecycle === 'archived'}
			onclick={() => (lifecycle = lifecycle === 'archived' ? 'active' : 'archived')}
		>
			{lifecycle === 'archived' ? 'Archived' : 'Active'}
		</button>
		<button
			type="button"
			class="publish-btn"
			disabled={!title.trim() || (sortedEnterprises.length > 0 && !primaryId)}
			onclick={save}
		>
			{editing ? 'Save' : 'Publish'}
		</button>
	</div>
</CreateSheet>

<FloatPanel
	open={enterprisesOpen}
	anchor={boxBtn}
	placement="below"
	width={260}
	maxHeight={320}
	onclose={() => (enterprisesOpen = false)}
>
	<div class="float-list" role="listbox">
		{#if sortedEnterprises.length === 0}
			<p class="menu-empty">Create an enterprise in Entreprises first</p>
		{:else}
			{#each sortedEnterprises as e (e.id)}
				{@const rank = rankOf(e.id)}
				<button
					type="button"
					class="option"
					class:active={rank > 0}
					onclick={() => toggleEnterprise(e.id)}
				>
					<span class="option-text">{e.title}</span>
					{#if rank > 0}
						<span class="rank">{rank}</span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</FloatPanel>

<style>
	.box-hit {
		display: grid;
		place-items: center;
		padding: 4px;
		flex-shrink: 0;
		border: 0;
		border-radius: 10px;
		background: transparent;
		cursor: pointer;
	}

	.box-hit.on {
		background: var(--float-trigger-on);
	}

	.sheet-bottom {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px 0;
	}

	.meta-pill {
		height: 36px;
		padding: 0 12px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.meta-pill.on {
		background: var(--float-trigger-on);
		color: var(--fg);
	}

	.float-list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 4px 0;
	}

	.option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}

	.option:hover,
	.option.active {
		background: var(--fg-4);
		color: var(--fg);
	}

	.option-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rank {
		flex-shrink: 0;
		min-width: 1.25rem;
		text-align: center;
		font-size: 13px;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
	}

	.menu-empty {
		margin: 0;
		padding: 10px 12px;
		font-size: 13px;
		color: var(--fg-33);
	}

	.publish-btn {
		height: 36px;
		padding: 0 18px;
		margin-left: auto;
		border: 1px solid transparent;
		border-radius: 9999px;
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.publish-btn:disabled {
		opacity: 0.5;
	}
</style>
