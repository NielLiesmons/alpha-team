<script>
	import CreateSheet from './CreateSheet.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import { deriveProjectStatus, projectDisplayIcon } from '$lib/project-status.js';
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
	/** Optional override; display inherits primary enterprise icon when null */
	/** @type {string | null} */
	let icon = $state(null);
	/** Index 0 = primary; further ids are secondary */
	/** @type {string[]} */
	let enterpriseIds = $state([]);
	/** @type {null | 'enterprises'} */
	let bottomMenu = $state(null);
	const editing = $derived(
		ui.composer?.kind === 'project' ? projects.find((item) => item.id === ui.composer.id) : null
	);
	const open = $derived(ui.composer?.kind === 'project');
	const previewStatus = $derived(editing ? deriveProjectStatus(editing.id, tasks) : 'planned');
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
		const primary = editing?.primary_enterprise_id;
		const ids = [...(editing?.enterprise_ids ?? [])];
		if (primary && ids.includes(primary)) {
			enterpriseIds = [primary, ...ids.filter((x) => x !== primary)];
		} else if (primary) {
			enterpriseIds = [primary, ...ids];
		} else {
			enterpriseIds = ids;
		}
		bottomMenu = null;
	});

	/** Click an enterprise → make it primary (keeps other memberships as secondary). */
	/** @param {string} id */
	function pickPrimary(id) {
		if (primaryId === id) {
			enterpriseIds = enterpriseIds.slice(1);
			return;
		}
		enterpriseIds = [id, ...enterpriseIds.filter((x) => x !== id)];
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		if (sortedEnterprises.length > 0 && !enterpriseIds[0]) {
			alert('Pick a primary enterprise for this project');
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
					status: editing?.status ?? 'planned',
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
		if (bottomMenu) {
			bottomMenu = null;
			return;
		}
		closeComposer();
	}}
>
	<div class="sheet-title-row">
		<span class="icon-preview" title="Icon from primary enterprise">
			<ProjectBox state={previewStatus} icon={displayIcon} size={28} />
		</span>
		<input class="sheet-input" placeholder="Project title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="Description" bind:value={description}></textarea>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<div class="pill-wrap">
			<button
				type="button"
				class="meta-pill"
				class:empty={!primaryId}
				onclick={() => (bottomMenu = bottomMenu === 'enterprises' ? null : 'enterprises')}
			>
				{#if primaryId}
					{sortedEnterprises.find((e) => e.id === primaryId)?.title ?? 'Enterprise'}
				{:else}
					Primary enterprise
				{/if}
			</button>
			{#if bottomMenu === 'enterprises'}
				<button
					type="button"
					class="menu-backdrop"
					aria-label="Close"
					onclick={() => (bottomMenu = null)}
				></button>
				<div class="bottom-menu">
					{#if sortedEnterprises.length === 0}
						<p class="menu-empty">Create an enterprise in Entreprises first</p>
					{:else}
						{#each sortedEnterprises as e (e.id)}
							<button
								type="button"
								class="option"
								class:active={primaryId === e.id}
								onclick={() => pickPrimary(e.id)}
							>
								{e.title}
								{#if primaryId === e.id}
									<span class="primary-tag">primary</span>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
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

<style>
	.icon-preview {
		display: grid;
		place-items: center;
		padding: 4px;
		flex-shrink: 0;
	}

	.sheet-bottom {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px 0;
	}

	.pill-wrap {
		position: relative;
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

	.meta-pill.empty {
		color: var(--fg-33);
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
	}

	.bottom-menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		z-index: 50;
		min-width: 200px;
		max-height: 220px;
		overflow: auto;
		padding: 4px;
		background: var(--glass);
		border: 1px solid var(--glass-border);
		border-radius: 12px;
	}

	.option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}

	.option.active,
	.option:hover {
		background: var(--fg-8);
		color: var(--fg);
	}

	.primary-tag {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.menu-empty {
		margin: 0;
		padding: 10px;
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
