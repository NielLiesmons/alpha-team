<script>
	import CreateSheet from './CreateSheet.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import { deriveProjectStatus } from '$lib/project-status.js';
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
	let iconOpen = $state(false);
	/** @type {string[]} */
	let enterpriseIds = $state([]);
	/** @type {null | 'enterprises'} */
	let bottomMenu = $state(null);
	/** @type {HTMLButtonElement | undefined} */
	let iconBtn = $state();
	const editing = $derived(
		ui.composer?.kind === 'project' ? projects.find((item) => item.id === ui.composer.id) : null
	);
	const open = $derived(ui.composer?.kind === 'project');
	const previewStatus = $derived(editing ? deriveProjectStatus(editing.id, tasks) : 'planned');

	const sortedEnterprises = $derived(
		[...enterprises].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.title.localeCompare(b.title))
	);

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		description = editing?.description ?? editing?.summary ?? editing?.body ?? '';
		icon = editing?.icon ?? null;
		enterpriseIds = [...(editing?.enterprise_ids ?? [])];
		iconOpen = false;
		bottomMenu = null;
	});

	/** @param {string} id */
	function toggleEnterprise(id) {
		enterpriseIds = enterpriseIds.includes(id)
			? enterpriseIds.filter((x) => x !== id)
			: [...enterpriseIds, id];
	}

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
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
		if (iconOpen) {
			iconOpen = false;
			return;
		}
		if (bottomMenu) {
			bottomMenu = null;
			return;
		}
		closeComposer();
	}}
>
	<div class="sheet-title-row">
		<button
			bind:this={iconBtn}
			type="button"
			class="bare"
			class:on={iconOpen}
			aria-label="Project icon"
			aria-expanded={iconOpen}
			onpointerdown={(e) => e.preventDefault()}
			onclick={() => (iconOpen = !iconOpen)}
		>
			<ProjectBox state={previewStatus} {icon} size={28} />
		</button>
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
				class:empty={enterpriseIds.length === 0}
				onclick={() => (bottomMenu = bottomMenu === 'enterprises' ? null : 'enterprises')}
			>
				Enterprise{#if enterpriseIds.length} · {enterpriseIds.length}{/if}
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
								class:active={enterpriseIds.includes(e.id)}
								onclick={() => toggleEnterprise(e.id)}>{e.title}</button
							>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>
			{editing ? 'Save' : 'Publish'}
		</button>
	</div>
</CreateSheet>

<FloatPanel
	open={iconOpen}
	anchor={iconBtn}
	placement="below"
	width={292}
	maxHeight={360}
	onclose={() => (iconOpen = false)}
>
	<EmojiPicker
		value={icon}
		onselect={(emoji) => {
			icon = emoji;
			iconOpen = false;
		}}
		onclear={() => {
			icon = null;
			iconOpen = false;
		}}
	/>
</FloatPanel>

<style>
	.bare {
		border: 0;
		background: transparent;
		padding: 4px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.bare.on {
		background: var(--float-trigger-on);
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
		display: block;
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
