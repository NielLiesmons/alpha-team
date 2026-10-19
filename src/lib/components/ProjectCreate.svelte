<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import ProjectBox from './ProjectBox.svelte';
	import { deriveProjectStatus, readProjectIconFile } from '$lib/project-status.js';
	import { closeComposer, projects, saveProject, tasks, ui } from '$lib/workspace.svelte.js';

	const EMOJI_PRESETS = ['📁', '🚀', '🏡', '🎵', '🛠', '🌱', '📚', '💡'];

	let title = $state('');
	let summary = $state('');
	let body = $state('');
	/** @type {string | null} */
	let icon = $state(null);
	let iconOpen = $state(false);
	let emojiDraft = $state('');
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	const editing = $derived(
		ui.composer?.kind === 'project' ? projects.find((item) => item.id === ui.composer.id) : null
	);
	const open = $derived(ui.composer?.kind === 'project');
	const previewStatus = $derived(
		editing ? deriveProjectStatus(editing.id, tasks) : 'planned'
	);

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		summary = editing?.summary ?? '';
		body = editing?.body ?? '';
		icon = editing?.icon ?? null;
		emojiDraft = '';
		iconOpen = false;
		tick().then(() => titleInput?.focus());
	});

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		try {
			await saveProject(
				{
					id: editing?.id,
					title: nextTitle,
					summary,
					body,
					icon,
					milestones: editing?.milestones ?? [],
					/* Keep last stored status for Drive compat; UI derives from tasks */
					status: editing?.status ?? 'planned'
				},
				!editing
			);
			closeComposer();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}

	function applyEmoji(value) {
		const next = value.trim();
		icon = next || null;
		emojiDraft = '';
		iconOpen = false;
	}

	async function onFile(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			icon = await readProjectIconFile(file);
			iconOpen = false;
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		}
	}
</script>

<CreateSheet {open} label={editing ? 'Edit project' : 'New project'} onclose={closeComposer}>
	<div class="sheet-title-row">
		<div class="menu-anchor">
			<button
				type="button"
				class="bare"
				aria-label="Project icon"
				aria-expanded={iconOpen}
				onclick={() => (iconOpen = !iconOpen)}
			>
				<ProjectBox state={previewStatus} {icon} size={28} />
			</button>
			{#if iconOpen}
				<button type="button" class="menu-scrim" aria-label="Close" onclick={() => (iconOpen = false)}
				></button>
				<div class="menu" role="dialog" aria-label="Choose project icon">
					<p class="menu-hint">Emoji or small image</p>
					<div class="emoji-row">
						{#each EMOJI_PRESETS as em (em)}
							<button type="button" class="emoji-hit" onclick={() => applyEmoji(em)}>{em}</button>
						{/each}
					</div>
					<form
						class="emoji-form"
						onsubmit={(e) => {
							e.preventDefault();
							applyEmoji(emojiDraft);
						}}
					>
						<input
							class="emoji-input"
							placeholder="Or paste an emoji"
							bind:value={emojiDraft}
							maxlength="8"
							aria-label="Custom emoji"
						/>
						<button type="submit" class="mini" disabled={!emojiDraft.trim()}>Set</button>
					</form>
					<button type="button" class="menu-action" onclick={() => fileInput?.click()}>
						Upload PNG / image
					</button>
					{#if icon}
						<button
							type="button"
							class="menu-action danger"
							onclick={() => {
								icon = null;
								iconOpen = false;
							}}>Remove icon</button
						>
					{/if}
					<input
						bind:this={fileInput}
						class="sr-only"
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						onchange={onFile}
					/>
				</div>
			{/if}
		</div>
		<input bind:this={titleInput} class="sheet-input" placeholder="Project title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<input class="summary" placeholder="Short summary" bind:value={summary} />
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="What is this project?" bind:value={body}></textarea>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>
			{editing ? 'Save' : 'Publish'}
		</button>
	</div>
</CreateSheet>

<style>
	.bare {
		border: 0;
		background: transparent;
		padding: 0;
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.menu-anchor {
		position: relative;
	}

	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 4;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 5;
		width: min(240px, 70vw);
		padding: 10px;
		background: var(--glass-panel);
		border: 1px solid var(--glass-border);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		box-sizing: border-box;
	}

	.menu-hint {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.emoji-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 8px;
	}

	.emoji-hit {
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-4);
		font-size: 18px;
		cursor: pointer;
		line-height: 1;
	}

	.emoji-hit:hover {
		background: var(--fg-8);
	}

	.emoji-form {
		display: flex;
		gap: 6px;
		margin-bottom: 8px;
	}

	.emoji-input {
		flex: 1;
		min-width: 0;
		height: 32px;
		padding: 0 8px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 14px;
	}

	.mini {
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

	.mini:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.menu-action {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.menu-action:hover {
		background: var(--fg-4);
		color: var(--fg);
	}

	.menu-action.danger {
		color: var(--destructive);
	}

	.summary {
		width: 100%;
		padding: 10px 12px;
		border: 0;
		background: transparent;
		outline: none;
		color: var(--white66);
		font-size: 15px;
	}

	.summary::placeholder {
		color: var(--white33);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
