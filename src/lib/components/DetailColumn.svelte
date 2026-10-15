<script>
	import { page } from '$app/stores';
	import StatusBox from './StatusBox.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import PlayerDetail from './PlayerDetail.svelte';
	import DetailMetaPills from './DetailMetaPills.svelte';
	import {
		closePlayerDetail,
		currentTrack,
		openUploadModal,
		playerBrowse,
		playerHeading,
		playerUi,
		setPlayerBrowse,
		uploadAudioFiles,
		uploadUi
	} from '$lib/player.svelte.js';
	import { activePerson, actor, asPerson } from '$lib/actor.svelte.js';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import {
		clearSelection,
		notes,
		openComposer,
		projects,
		saveNote,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const selection = $derived(ui.selection);
	const isPlayer = $derived($page.url.pathname.startsWith('/player'));
	const playerTitle = $derived(isPlayer ? playerHeading() : '');
	const playerConnected = $derived(Boolean(activeSession()) && ui.source === 'drive');

	/** @type {HTMLInputElement | undefined} */
	let playerFileInput = $state();

	async function onPlayerFiles(/** @type {Event} */ e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = input.files;
		if (!files?.length) return;
		// Copy FileList before clearing input — upload is async
		const list = [...files];
		input.value = '';
		openUploadModal();
		try {
			await uploadAudioFiles(list);
		} catch (err) {
			playerUi.error = err instanceof Error ? err.message : String(err);
			openUploadModal();
		}
	}

	const task = $derived(
		selection?.kind === 'task' ? tasks.find((t) => t.id === selection.id) : null
	);
	const project = $derived(
		selection?.kind === 'project' ? projects.find((p) => p.id === selection.id) : null
	);
	const note = $derived(
		selection?.kind === 'note' ? notes.find((n) => n.id === selection.id) : null
	);

	/**
	 * Prefer entity author; fall back to signed-in actor (never legacy "You").
	 * @param {unknown} raw
	 */
	function resolveAuthor(raw) {
		const me = activePerson();
		const p = asPerson(raw);
		if (!p) return me;
		const e = (p.email || '').toLowerCase();
		if (!e || e === 'you@local' || e === 'local' || e === 'you') return me;
		// Re-resolve through member directory so niel@… shows as Niel
		return asPerson(e) ?? p;
	}

	const detailAuthor = $derived.by(() => {
		// Depend on actor.email so the chip updates when Settings changes signed-in user
		actor.email;
		if (task) return resolveAuthor(task.author);
		if (note) return resolveAuthor(note.author);
		return null;
	});

	const typeLabel = $derived.by(() => {
		if (isPlayer) return 'Player';
		if (task) return 'Task';
		if (project) return 'Project';
		if (note) return 'Note';
		if (selection?.kind === 'mail') return 'Mail';
		if (selection?.kind === 'chat') return 'Chat';
		return 'Detail';
	});

	const open = $derived(
		Boolean((isPlayer && playerBrowse.detailOpen) || task || project || note)
	);

	const emptyCopy = $derived.by(() => {
		const path = $page.url.pathname;
		if (path.startsWith('/tasks')) return { title: 'No task selected', body: 'Pick a task from the list to read it here.' };
		if (path.startsWith('/projects')) return { title: 'No project selected', body: 'Open a project to see its summary and notes.' };
		if (path.startsWith('/notes')) return { title: 'No note selected', body: 'Choose a note to read it beside the list.' };
		if (path.startsWith('/mail')) return { title: 'No message selected', body: 'Mail will open here when it’s wired up.' };
		if (path.startsWith('/chat')) return { title: 'No chat selected', body: 'Conversations will open here when chat is ready.' };
		return { title: 'Nothing open', body: 'Select a task, project, note, mail, or chat to view it here.' };
	});

	let menuOpen = $state(false);

	/** Inline note editor state */
	let noteDraftId = $state(/** @type {string | null} */ (null));
	let noteTitle = $state('');
	let noteBody = $state('');
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let noteSaveTimer;
	let noteSaving = $state(false);

	$effect(() => {
		const id = note?.id ?? null;
		if (!id || !note) {
			noteDraftId = null;
			return;
		}
		if (noteDraftId === id) return;
		noteDraftId = id;
		noteTitle = note.title ?? '';
		noteBody = note.body ?? '';
	});

	function scheduleNoteSave() {
		if (!note) return;
		clearTimeout(noteSaveTimer);
		noteSaveTimer = setTimeout(() => {
			void persistNote();
		}, 450);
	}

	async function persistNote() {
		if (!note) return;
		const title = noteTitle.trim() || 'Untitled';
		if (title === (note.title ?? '') && noteBody === (note.body ?? '')) return;
		noteSaving = true;
		try {
			await saveNote({ ...note, title, body: noteBody }, false);
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		} finally {
			noteSaving = false;
		}
	}

	/** @param {string} html */
	function onNoteBodyChange(html) {
		noteBody = html;
		scheduleNoteSave();
	}

	function editCurrent() {
		menuOpen = false;
		if (!selection) return;
		if (selection.kind === 'task' || selection.kind === 'project') {
			openComposer(selection.kind, selection.id);
		}
	}

	function close() {
		menuOpen = false;
		if (note) {
			clearTimeout(noteSaveTimer);
			void persistNote();
		}
		clearSelection();
	}
</script>

<aside
	class="detail"
	class:open
	class:empty={!open}
	class:player-mode={isPlayer}
	class:has-mini={isPlayer && Boolean(currentTrack())}
	aria-label="Detail"
>
	{#if open}
		<header class="mobile-bar">
			<button
				type="button"
				class="icon-hit"
				aria-label="Back"
				onclick={() => (isPlayer ? closePlayerDetail() : close())}
			>
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path
						d="M11.5 3.5 6 9l5.5 5.5"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			{#if detailAuthor}
				<div class="author-chip center">
					<ProfilePic name={detailAuthor.name} size={22} />
					<span class="author-name">{detailAuthor.name}</span>
				</div>
			{:else}
				<span class="type-label">{isPlayer ? playerTitle : typeLabel}</span>
			{/if}
			<div class="menu-wrap">
				<button
					type="button"
					class="icon-hit"
					aria-label="More"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
				>
					<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<circle cx="9" cy="4" r="1.35" fill="currentColor" />
						<circle cx="9" cy="9" r="1.35" fill="currentColor" />
						<circle cx="9" cy="14" r="1.35" fill="currentColor" />
					</svg>
				</button>
				{#if menuOpen}
					<button type="button" class="menu-scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}
					></button>
					<div class="more-menu" role="menu">
						{#if isPlayer && playerConnected}
							<button
								type="button"
								role="menuitem"
								onclick={() => {
									menuOpen = false;
									if (uploadUi.active) openUploadModal();
									else playerFileInput?.click();
								}}>{uploadUi.active ? 'Uploads' : 'Upload'}</button
							>
						{/if}
						{#if task || project}
							<button type="button" role="menuitem" onclick={editCurrent}>Edit</button>
						{/if}
						<button
							type="button"
							role="menuitem"
							onclick={() => {
								menuOpen = false;
								isPlayer ? closePlayerDetail() : close();
							}}>Close</button
						>
					</div>
				{/if}
			</div>
		</header>
	{/if}

	{#if isPlayer}
		<input
			bind:this={playerFileInput}
			class="sr-only"
			type="file"
			accept="audio/*,.mp3,.m4a,.flac,.ogg,.wav"
			multiple
			onchange={onPlayerFiles}
		/>
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				{#if playerBrowse.mode === 'artists' && playerBrowse.artist}
					<button
						type="button"
						class="icon-hit"
						aria-label="Back to artists"
						onclick={() => setPlayerBrowse('artists')}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M10 3.5 5.5 8 10 12.5"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				{:else if playerBrowse.mode === 'albums' && playerBrowse.album}
					<button
						type="button"
						class="icon-hit"
						aria-label="Back to albums"
						onclick={() => setPlayerBrowse('albums')}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M10 3.5 5.5 8 10 12.5"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				{/if}
				<span class="detail-top-label">{playerTitle}</span>
			</div>
			<div class="detail-top-actions">
				{#if playerConnected}
					<button
						type="button"
						class="icon-hit"
						aria-label="Upload audio"
						onclick={() => {
							if (uploadUi.active) openUploadModal();
							else playerFileInput?.click();
						}}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M8 2.5v8M4.5 6 8 2.5 11.5 6M3 12.5h10"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				{/if}
				<button type="button" class="icon-hit" aria-label="Close" onclick={closePlayerDetail}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M4 4l8 8M12 4l-8 8"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		</header>
		<div class="body player-body">
			<PlayerDetail />
		</div>
	{:else if task}
		<header class="detail-top desktop-head">
			{#if detailAuthor}
				<div class="author-chip">
					<ProfilePic name={detailAuthor.name} size={22} />
					<span class="author-name">{detailAuthor.name}</span>
				</div>
			{:else}
				<span class="detail-top-label">Task</span>
			{/if}
			<div class="detail-top-actions">
				<button type="button" class="icon-hit" aria-label="Edit" onclick={editCurrent}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5.4 12.84 2 13.5l.66-3.4L11.5 2.5Z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<button type="button" class="icon-hit" aria-label="Close" onclick={close}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M4 4l8 8M12 4l-8 8"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		</header>
		<div class="body">
			<div class="title-row">
				<h2 class="title">{task.title}</h2>
			</div>
			<DetailMetaPills entity={task} kind="task" />
			{#if task.body}
				<p class="prose">{task.body}</p>
			{:else}
				<p class="muted">No description.</p>
			{/if}
		</div>
	{:else if project}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Project</span>
			<div class="detail-top-actions">
				<button type="button" class="icon-hit" aria-label="Edit" onclick={editCurrent}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5.4 12.84 2 13.5l.66-3.4L11.5 2.5Z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<button type="button" class="icon-hit" aria-label="Close" onclick={close}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M4 4l8 8M12 4l-8 8"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		</header>
		<div class="body">
			<div class="title-row">
				<StatusBox state={project.status} size={22} />
				<h2 class="title">{project.title}</h2>
			</div>
			{#if project.summary}
				<p class="summary">{project.summary}</p>
			{/if}
			{#if project.body}
				<p class="prose">{project.body}</p>
			{:else}
				<p class="muted">No project notes yet.</p>
			{/if}
		</div>
	{:else if note}
		<header class="detail-top desktop-head">
			{#if detailAuthor}
				<div class="author-chip">
					<ProfilePic name={detailAuthor.name} size={22} />
					<span class="author-name">{detailAuthor.name}</span>
				</div>
			{:else}
				<span class="detail-top-label">Note</span>
			{/if}
			<div class="detail-top-actions">
				{#if noteSaving}
					<span class="save-hint">Saving…</span>
				{/if}
				<button type="button" class="icon-hit" aria-label="Close" onclick={close}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M4 4l8 8M12 4l-8 8"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		</header>
		<div class="body note-body-wrap">
			<div class="title-row">
				<input
					class="title-input"
					bind:value={noteTitle}
					aria-label="Note title"
					placeholder="Untitled"
					oninput={scheduleNoteSave}
				/>
			</div>
			<DetailMetaPills entity={note} kind="note" />
			{#key note.id}
				<div class="note-editor-pad">
					<NoteEditor value={noteBody} editable={true} onChange={onNoteBodyChange} />
				</div>
			{/key}
		</div>
	{:else}
		<div class="empty desktop-empty">
			<p class="empty-title">{emptyCopy.title}</p>
			<p class="empty-body">{emptyCopy.body}</p>
		</div>
	{/if}
</aside>

<style>
	.detail {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		background: transparent;
		overflow: hidden;
	}

	.mobile-bar {
		display: none;
	}

	/* Matches AppShell .list-top (40px) */
	.detail-top {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		height: 40px;
		padding: 0 8px 0 16px;
		border-bottom: 1px solid var(--hairline);
		box-sizing: border-box;
	}

	.detail-top-start {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.detail-top-label {
		flex: 1;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--white33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.author-chip {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.author-chip.center {
		justify-content: center;
	}

	.author-name {
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.save-hint {
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
		padding-right: 4px;
	}

	.title-input {
		flex: 1;
		min-width: 0;
		width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		font-family: var(--font);
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.25;
		color: var(--fg);
	}

	.title-input::placeholder {
		color: var(--fg-33);
		font-weight: 600;
	}

	.note-editor-pad {
		/* Match task .prose — 4px under meta pills */
		padding: 4px 16px 16px;
		flex: 1;
		min-height: 0;
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

	.detail-top-actions {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.icon-hit {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--white33);
		padding: 0;
		cursor: pointer;
	}

	.icon-hit:hover {
		color: var(--white);
		background: var(--white4);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.title {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-family: var(--font);
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.25;
		color: var(--white);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.body.player-body {
		/* Match Task/Note column chrome; list scrolls inside PlayerDetail */
		overflow: hidden;
		width: 100%;
	}

	.note-body-wrap {
		overflow: auto;
	}

	.title-row,
	.block,
	.prose,
	.summary,
	.muted {
		padding-left: 16px;
		padding-right: 16px;
	}

	.title-row {
		padding-top: 14px;
		padding-bottom: 10px;
	}

	.block {
		padding-top: 8px;
		padding-bottom: 8px;
	}

	.prose,
	.summary {
		margin: 0;
		padding-top: 4px;
		padding-bottom: 8px;
		font-size: 15px;
		line-height: 1.55;
		color: var(--white66);
		white-space: pre-wrap;
	}

	.summary {
		color: var(--white);
		font-weight: 500;
	}

	.muted {
		margin: 0;
		font-size: 14px;
		color: var(--white33);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.note-body {
		margin: 0;
		font: inherit;
		font-size: 14px;
		line-height: 1.55;
		color: var(--white66);
		white-space: pre-wrap;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1.5rem;
		text-align: center;
	}

	.empty-title {
		margin: 0;
		font-family: var(--font);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--white);
	}

	.empty-body {
		margin: 0.55rem 0 0;
		max-width: 16rem;
		font-size: 14px;
		line-height: 1.5;
		color: var(--white33);
	}

	.mobile-title-row {
		display: none;
	}

	.menu-wrap {
		position: relative;
	}

	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
	}

	.more-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 50;
		min-width: 140px;
		padding: 4px;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
	}

	.more-menu button {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--white66);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.more-menu button:hover {
		background: var(--white8);
		color: var(--white);
	}

	@media (max-width: 767px) {
		.detail {
			position: fixed;
			inset: 0;
			z-index: 55;
			width: 100%;
			background: var(--bg);
			transform: translateX(100%);
			transition: transform 0.32s var(--ease);
			pointer-events: none;
		}

		/* Songs / Artists list stays above the bottom nav + mini player */
		.detail.player-mode {
			z-index: 35;
			bottom: calc(72px + env(safe-area-inset-bottom, 0px));
		}

		.detail.player-mode.has-mini {
			bottom: calc(72px + 8px + 52px + env(safe-area-inset-bottom, 0px));
		}

		.detail.open {
			transform: translateX(0);
			pointer-events: auto;
		}

		.detail.empty {
			display: none;
		}

		.mobile-bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			height: 52px;
			padding: 0 10px;
			border-bottom: 1px solid var(--hairline);
			flex-shrink: 0;
			box-sizing: border-box;
			background: var(--bg);
		}

		.type-label {
			flex: 1;
			text-align: center;
			font-family: var(--font);
			font-size: 15px;
			font-weight: 650;
			color: var(--white);
		}

		.author-chip.center .author-name {
			font-size: 15px;
			font-weight: 650;
			color: var(--fg);
		}

		.icon-hit {
			width: 36px;
			height: 36px;
			display: grid;
			place-items: center;
			border: 0;
			border-radius: 10px;
			background: transparent;
			color: var(--white66);
			padding: 0;
			cursor: pointer;
		}

		.icon-hit:hover {
			color: var(--white);
			background: var(--white4);
		}

		.desktop-head,
		.desktop-empty {
			display: none;
		}

		.body {
			padding: 0 0 calc(12px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
