<script>
	import { page } from '$app/stores';
	import ProjectBox from './ProjectBox.svelte';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import TaskBox from './TaskBox.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import PlayerDetail from './PlayerDetail.svelte';
	import DetailMetaPills from './DetailMetaPills.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';
	import Pen from './icons/Pen.svelte';
	import Trash from './icons/Trash.svelte';
	import {
		closePlayerDetail,
		currentTrack,
		openUploadModal,
		playerBack,
		playerBrowse,
		playerHeading,
		playerUi,
		setPlayerBrowse,
		uploadAudioFiles,
		uploadUi
	} from '$lib/player.svelte.js';
	import { activePerson, actor, asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import {
		campaigns,
		mailSettings,
		persistSendCampaign
	} from '$lib/publications.svelte.js';
	import {
		findMail,
		formatMailWhen,
		markMailRead
	} from '$lib/mail.svelte.js';
	import {
		projectLifecycle,
		primaryEnterpriseId,
		projectDisplayIcon
	} from '$lib/project-status.js';
	import { renderInlineLinks } from '$lib/note-text.js';
	import { accountingBrowse } from '$lib/accounting.svelte.js';
	import AccountingDetail from './AccountingDetail.svelte';
	import CommentThread from './CommentThread.svelte';
	import {
		clearSelection,
		costItems,
		deleteWorkspaceEntity,
		enterprises,
		ledgerEntries,
		notes,
		openComposer,
		projects,
		salesLines,
		saveNote,
		selectEntity,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const selection = $derived(ui.selection);
	const isPlayer = $derived($page.url.pathname.startsWith('/player'));
	const playerTitle = $derived(isPlayer ? playerHeading() : '');
	const playerConnected = $derived(Boolean(activeSession()));

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
	const ledger = $derived(
		selection?.kind === 'ledger' ? ledgerEntries.find((e) => e.id === selection.id) : null
	);
	const costItem = $derived(
		selection?.kind === 'cost' ? costItems.find((e) => e.id === selection.id) : null
	);
	const salesLine = $derived(
		selection?.kind === 'sales' ? salesLines.find((e) => e.id === selection.id) : null
	);
	const enterprise = $derived(
		selection?.kind === 'enterprise' ? enterprises.find((e) => e.id === selection.id) : null
	);
	const isEntreprises = $derived(
		$page.url.pathname.startsWith('/entreprises') || $page.url.pathname.startsWith('/accounting')
	);
	const accountingPanel = $derived(
		isEntreprises &&
			accountingBrowse.mode !== 'home' &&
			!ledger &&
			!costItem &&
			!salesLine &&
			!enterprise
	);
	const newsletter = $derived(
		selection?.kind === 'newsletter' ? campaigns.find((c) => c.id === selection.id) : null
	);
	const welcomeSelected = $derived(selection?.kind === 'welcome');
	const mailMsg = $derived(selection?.kind === 'mail' ? findMail(selection.id) : null);

	$effect(() => {
		const id = mailMsg?.id;
		if (!id) return;
		void markMailRead(id);
	});

	/** @param {number} cents */
	function formatMoney(cents, currency = 'EUR') {
		const n = (cents ?? 0) / 100;
		try {
			return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
		} catch {
			return `${n.toFixed(2)} ${currency}`;
		}
	}

	const projectTasks = $derived.by(() => {
		if (!project) return [];
		const id = project.id;
		return tasks.filter((t) => {
			const ids = t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? [];
			return ids.includes(id);
		});
	});

	const projectNotes = $derived.by(() => {
		if (!project) return [];
		const id = project.id;
		return notes.filter((n) => (n.project_ids ?? []).includes(id));
	});

	/** Projects whose primary enterprise is this one */
	const enterpriseProjects = $derived.by(() => {
		if (!enterprise) return [];
		return projects.filter((p) => primaryEnterpriseId(p) === enterprise.id);
	});

	const enterpriseProjectIds = $derived(new Set(enterpriseProjects.map((p) => p.id)));

	const enterpriseTasks = $derived.by(() => {
		if (!enterprise) return [];
		return tasks.filter((t) => {
			const ids = t.project_ids ?? t.targets?.map((/** @type {any} */ x) => x.id) ?? [];
			return ids.some((id) => enterpriseProjectIds.has(id));
		});
	});

	const enterpriseNotes = $derived.by(() => {
		if (!enterprise) return [];
		return notes.filter((n) =>
			(n.project_ids ?? []).some((id) => enterpriseProjectIds.has(id))
		);
	});

	/** @type {HTMLButtonElement | undefined} */
	let moreBtn = $state();

	const canEdit = $derived(
		Boolean(task || project || note || enterprise || newsletter || welcomeSelected)
	);
	const canDelete = $derived(Boolean(task || project || note || enterprise));

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
		if (ledger) return 'Ledger';
		if (costItem) return 'Cost';
		if (salesLine) return 'Sales';
		if (enterprise) return 'Enterprise';
		if (accountingPanel) return 'Entreprises';
		if (newsletter) return 'Newsletter';
		if (welcomeSelected) return 'Welcome';
		if (mailMsg) return 'Mail';
		if (selection?.kind === 'chat') return 'Chat';
		return 'Detail';
	});

	/** Centered mobile detail title (entity name when available). */
	const mobileTitle = $derived.by(() => {
		if (isPlayer) return playerTitle || 'Player';
		if (task?.title) return task.title;
		if (project?.title) return project.title;
		if (note?.title) return note.title;
		if (ledger) return ledger.memo || ledger.account_title || 'Entry';
		if (costItem?.title) return costItem.title;
		if (salesLine?.title) return salesLine.title;
		if (enterprise?.title) return enterprise.title;
		if (accountingPanel) return accountingBrowse.mode;
		if (newsletter?.subject) return newsletter.subject;
		if (welcomeSelected) return 'Welcome';
		if (mailMsg?.subject) return mailMsg.subject;
		return typeLabel;
	});

	const open = $derived(
		Boolean(
			(isPlayer && playerBrowse.detailOpen) ||
				task ||
				project ||
				note ||
				ledger ||
				costItem ||
				salesLine ||
				enterprise ||
				accountingPanel ||
				newsletter ||
				welcomeSelected ||
				mailMsg
		)
	);

	const emptyCopy = $derived.by(() => {
		const path = $page.url.pathname;
		if (path.startsWith('/tasks')) return { title: 'No task selected', body: 'Pick a task from the list to read it here.' };
		if (path.startsWith('/projects')) return { title: 'No project selected', body: 'Open a project to see its summary and notes.' };
		if (path.startsWith('/notes')) return { title: 'No note selected', body: 'Choose a note to read it beside the list.' };
		if (path.startsWith('/entreprises') || path.startsWith('/accounting'))
			return {
				title: 'No entry selected',
				body: 'Open Entreprises, Costs, Sales, or Ledger — then pick a row.'
			};
		if (path.startsWith('/publications'))
			return {
				title: 'No publication selected',
				body: 'Welcome + newsletters for the public list. Use + to write a letter.'
			};
		if (path.startsWith('/mail'))
			return {
				title: 'No message selected',
				body: 'Pick a message from Inbox or Sent — or use + to compose for your mailbox.'
			};
		if (path.startsWith('/chat')) return { title: 'No chat selected', body: 'Conversations will open here when chat is ready.' };
		return { title: 'Nothing open', body: 'Select a task, project, note, mail, or chat to view it here.' };
	});

	let sendBusy = $state(false);

	async function sendSelectedNewsletter() {
		if (!newsletter || newsletter.status === 'sent') return;
		if (!confirm('Send this newsletter to every subscribed address?')) return;
		sendBusy = true;
		try {
			await persistSendCampaign(newsletter.id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			sendBusy = false;
		}
	}

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
		if (
			selection.kind === 'task' ||
			selection.kind === 'project' ||
			selection.kind === 'enterprise' ||
			selection.kind === 'note' ||
			selection.kind === 'newsletter' ||
			selection.kind === 'welcome'
		) {
			openComposer(selection.kind, selection.id);
		}
	}

	async function deleteCurrent() {
		menuOpen = false;
		if (!selection) return;
		const kind = selection.kind;
		if (kind !== 'task' && kind !== 'project' && kind !== 'note' && kind !== 'enterprise') return;
		const label =
			kind === 'task'
				? 'task'
				: kind === 'project'
					? 'project'
					: kind === 'note'
						? 'note'
						: 'enterprise';
		if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
		try {
			await deleteWorkspaceEntity(kind, selection.id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
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

	/** Keep body mounted through the mobile slide-out so the panel doesn’t blank mid-transition. */
	let renderBody = $state(false);
	let panelOpen = $state(false);

	$effect(() => {
		if (open) {
			renderBody = true;
			/* Double rAF so the off-screen frame paints before .open slides in. */
			let id2 = 0;
			const id1 = requestAnimationFrame(() => {
				id2 = requestAnimationFrame(() => {
					panelOpen = true;
				});
			});
			return () => {
				cancelAnimationFrame(id1);
				cancelAnimationFrame(id2);
			};
		}
		panelOpen = false;
		const mobile =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
		if (!mobile) {
			renderBody = false;
			return;
		}
		const t = setTimeout(() => {
			renderBody = false;
		}, 340);
		return () => clearTimeout(t);
	});
</script>

<aside
	class="detail"
	class:open={panelOpen}
	class:empty={!renderBody}
	class:player-mode={isPlayer}
	class:has-mini={isPlayer && Boolean(currentTrack())}
	aria-label="Detail"
>
	{#if renderBody}
		<header class="mobile-bar">
			<button
				type="button"
				class="chrome-btn chev-back"
				aria-label="Back"
				onclick={() => (isPlayer ? playerBack() : close())}
			>
				<svg width="22" height="22" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path
						d="M11.5 3.5 6 9l5.5 5.5"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<span class="mobile-title">{mobileTitle}</span>
			<div class="menu-wrap">
				<button
					bind:this={moreBtn}
					type="button"
					class="chrome-btn more-btn"
					aria-label="More"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
				>
					<svg width="26" height="26" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<circle cx="9" cy="3.75" r="1.65" fill="currentColor" />
						<circle cx="9" cy="9" r="1.65" fill="currentColor" />
						<circle cx="9" cy="14.25" r="1.65" fill="currentColor" />
					</svg>
				</button>
				<FloatPanel
					open={menuOpen}
					anchor={moreBtn}
					placement="below"
					align="end"
					width={200}
					maxHeight={280}
					onclose={() => (menuOpen = false)}
				>
					<div class="float-list" role="menu">
						{#if isPlayer && playerConnected}
							<button
								type="button"
								class="menu-item"
								role="menuitem"
								onclick={() => {
									menuOpen = false;
									if (uploadUi.active) openUploadModal();
									else playerFileInput?.click();
								}}>{uploadUi.active ? 'Uploads' : 'Upload'}</button
							>
						{/if}
						{#if canEdit}
							<button type="button" class="menu-item" role="menuitem" onclick={editCurrent}>
								<Pen size={13} />
								Edit
							</button>
						{/if}
						{#if canDelete}
							<button type="button" class="menu-item" role="menuitem" onclick={deleteCurrent}>
								<Trash size={13} />
								Delete
							</button>
						{/if}
					</div>
				</FloatPanel>
			</div>
		</header>

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
								d="M8 3.25v9.5M3.25 8h9.5"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
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
					<Pen size={13} />
				</button>
				<button type="button" class="icon-hit" aria-label="Delete" onclick={deleteCurrent}>
					<Trash size={13} />
				</button>
			</div>
		</header>
		<div class="body">
			<div class="title-row task-title-row">
				<TaskFieldPicker taskId={task.id} field="status" value={task.status} size={24} />
				<h2 class="title">{task.title}</h2>
				<TaskFieldPicker
					taskId={task.id}
					field="priority"
					value={task.priority ?? 'none'}
					size={22}
					align="right"
				/>
			</div>
			<DetailMetaPills entity={task} kind="task" />
			{#if task.body}
				<p class="prose">{@html renderInlineLinks(task.body)}</p>
			{:else}
				<p class="muted">No description.</p>
			{/if}
		</div>
		<CommentThread type="task" entityId={task.id} />
	{:else if project}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Project</span>
			<div class="detail-top-actions">
				<button type="button" class="icon-hit" aria-label="Edit" onclick={editCurrent}>
					<Pen size={13} />
				</button>
				<button type="button" class="icon-hit" aria-label="Delete" onclick={deleteCurrent}>
					<Trash size={13} />
				</button>
			</div>
		</header>
		<div class="body">
			<div class="title-row">
				<ProjectBox
					state={projectLifecycle(project, tasks)}
					icon={projectDisplayIcon(project, enterprises)}
					size={24}
				/>
				<h2 class="title">{project.title}</h2>
			</div>
			{#if project.description}
				<p class="prose">{@html renderInlineLinks(project.description)}</p>
			{:else}
				<p class="muted">No description yet.</p>
			{/if}

			<div class="bento">
				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Tasks</span>
						<span class="bento-count">{projectTasks.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add task"
							onclick={() => openComposer('task', undefined, 'open')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if projectTasks.length === 0}
						<p class="muted tight">No tasks yet.</p>
					{:else}
						<ul class="linked-list">
							{#each projectTasks as t (t.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('task', t.id)}>
										<TaskBox state={t.status} size={18} />
										<span class="linked-title">{t.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Notes</span>
						<span class="bento-count">{projectNotes.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add note"
							onclick={() => openComposer('note')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if projectNotes.length === 0}
						<p class="muted tight">No notes yet.</p>
					{:else}
						<ul class="linked-list">
							{#each projectNotes as n (n.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('note', n.id)}>
										<span class="linked-title">{n.title || 'Untitled'}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Files</span>
						<span class="bento-count">0</span>
						<button type="button" class="proj-add" aria-label="Add file" disabled>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					<p class="muted tight">No files yet.</p>
				</section>
			</div>
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
				<button type="button" class="icon-hit" aria-label="Edit" onclick={editCurrent}>
					<Pen size={13} />
				</button>
				<button type="button" class="icon-hit" aria-label="Delete" onclick={deleteCurrent}>
					<Trash size={13} />
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
		<CommentThread type="note" entityId={note.id} />
	{:else if welcomeSelected}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Welcome</span>
			<div class="detail-top-actions">
				<button type="button" class="icon-hit" aria-label="Edit" onclick={editCurrent}>
					<Pen size={13} />
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
			<p class="pub-kicker">{mailSettings.welcome.enabled ? 'On for new subscribers' : 'Off'}</p>
			<h2 class="pub-title">{mailSettings.welcome.subject_fr || 'Welcome'}</h2>
			<pre class="pub-body">{mailSettings.welcome.body_fr}</pre>
		</div>
	{:else if newsletter}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Newsletter</span>
			<div class="detail-top-actions">
				{#if newsletter.status === 'draft' || newsletter.status === 'failed'}
					<button
						type="button"
						class="send-chip"
						disabled={sendBusy}
						onclick={sendSelectedNewsletter}
					>
						{sendBusy ? 'Sending…' : 'Send'}
					</button>
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
		<div class="body">
			<p class="pub-kicker">
				{newsletter.status}{#if newsletter.sent_count}
					· {newsletter.sent_count} sent{/if}
			</p>
			<h2 class="pub-title">{newsletter.subject}</h2>
			<pre class="pub-body">{newsletter.body}</pre>
		</div>
	{:else if mailMsg}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Mail</span>
			<div class="detail-top-actions">
				<button
					type="button"
					class="send-chip"
					onclick={() =>
						openComposer('mail', undefined, undefined, {
							to: mailMsg.from
						})
					}
				>
					Reply
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
			<p class="pub-kicker">
				{displayNameFromEmail(mailMsg.from)}
				→ {(mailMsg.to || []).map(displayNameFromEmail).join(', ')}
				· {formatMailWhen(mailMsg.created_at)}
				{#if mailMsg.transport === 'drive'}· Drive{/if}
			</p>
			<h2 class="pub-title">{mailMsg.subject || '(no subject)'}</h2>
			<pre class="pub-body">{mailMsg.body || ''}</pre>
		</div>
	{:else if accountingPanel}
		<AccountingDetail />
	{:else if ledger}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Ledger</span>
			<div class="detail-top-actions">
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
			<p class="pub-kicker">
				{ledger.direction === 'in' ? 'Income' : 'Expense'}
				· {ledger.kind}
				{#if ledger.channel}· {ledger.channel}{/if}
			</p>
			<h2 class="pub-title">{formatMoney(ledger.amount_cents, ledger.currency)}</h2>
			{#if ledger.memo}
				<p class="prose">{ledger.memo}</p>
			{/if}
			<p class="muted">
				{ledger.account_code} — {ledger.account_title}
				{#if ledger.cost_behavior && ledger.cost_behavior !== 'none'}
					· {ledger.cost_behavior}
				{/if}
			</p>
			{#if ledger.targets?.length}
				<p class="muted">
					Projects: {ledger.targets.map((/** @type {{ label: string }} */ t) => t.label).join(', ')}
				</p>
			{/if}
		</div>
	{:else if costItem}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Cost</span>
			<div class="detail-top-actions">
				<button type="button" class="icon-hit" aria-label="Close" onclick={close}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
			</div>
		</header>
		<div class="body">
			<p class="pub-kicker">{costItem.behavior}{#if costItem.period && costItem.behavior !== 'variable'} · {costItem.period}{/if}</p>
			<h2 class="pub-title">{costItem.title}</h2>
			<p class="muted">
				{formatMoney(costItem.amount_cents, costItem.currency)}
				{#if costItem.unit_label}/ {costItem.unit_label}{/if}
			</p>
		</div>
	{:else if salesLine}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Sales</span>
			<div class="detail-top-actions">
				<button type="button" class="icon-hit" aria-label="Close" onclick={close}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
			</div>
		</header>
		<div class="body">
			<p class="pub-kicker">{salesLine.channel || 'channel'}</p>
			<h2 class="pub-title">{salesLine.title}</h2>
			<p class="muted">
				{formatMoney(salesLine.price_cents, salesLine.currency)}
				{#if salesLine.unit_label}/ {salesLine.unit_label}{/if}
			</p>
		</div>
	{:else if enterprise}
		<header class="detail-top desktop-head">
			<span class="detail-top-label">Enterprise</span>
			<div class="detail-top-actions">
				<button type="button" class="icon-hit" aria-label="Edit" onclick={editCurrent}>
					<Pen size={13} />
				</button>
				<button type="button" class="icon-hit" aria-label="Delete" onclick={deleteCurrent}>
					<Trash size={13} />
				</button>
			</div>
		</header>
		<div class="body">
			<div class="title-row">
				<EnterpriseBox state={enterprise.status ?? 'active'} icon={enterprise.icon} size={24} />
				<h2 class="title">{enterprise.title}</h2>
			</div>
			{#if enterprise.description}
				<p class="prose">{@html renderInlineLinks(enterprise.description)}</p>
			{:else}
				<p class="muted">No description yet.</p>
			{/if}

			<div class="bento">
				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Tasks</span>
						<span class="bento-count">{enterpriseTasks.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add task"
							onclick={() => openComposer('task', undefined, 'open')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseTasks.length === 0}
						<p class="muted tight">No tasks yet.</p>
					{:else}
						<ul class="linked-list">
							{#each enterpriseTasks as t (t.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('task', t.id)}>
										<TaskBox state={t.status} size={18} />
										<span class="linked-title">{t.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Notes</span>
						<span class="bento-count">{enterpriseNotes.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add note"
							onclick={() => openComposer('note')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseNotes.length === 0}
						<p class="muted tight">No notes yet.</p>
					{:else}
						<ul class="linked-list">
							{#each enterpriseNotes as n (n.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('note', n.id)}>
										<span class="linked-title">{n.title || 'Untitled'}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Files</span>
						<span class="bento-count">0</span>
						<button type="button" class="proj-add" aria-label="Add file" disabled>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					<p class="muted tight">No files yet.</p>
				</section>
			</div>
		</div>
	{/if}
{:else}
	<div class="empty desktop-empty">
		<p class="empty-title">{emptyCopy.title}</p>
		<p class="empty-body">{emptyCopy.body}</p>
	</div>
{/if}
</aside>

<style>
	.pub-kicker {
		margin: 0 0 8px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.pub-title {
		margin: 0 0 16px;
		font-size: 22px;
		font-weight: 650;
		line-height: 1.25;
		color: var(--fg);
	}

	.pub-body {
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 15px;
		line-height: 1.55;
		color: var(--fg-66);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.send-chip {
		height: 28px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: 8px;
		background:
			var(--button-primary-bg) padding-box,
			var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font: inherit;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition: transform 0.2s var(--ease);
	}

	.send-chip:hover:not(:disabled) {
		transform: scale(1.015);
	}

	.send-chip:active:not(:disabled) {
		transform: scale(0.98);
	}

	.send-chip:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.detail {
		position: relative;
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

	/* Floating detail header — soft short fade (match list-top) */
	.detail-top {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 6;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		height: 48px;
		padding: 0 8px 0 16px;
		border-bottom: none;
		box-sizing: border-box;
		pointer-events: none;
		background: linear-gradient(
			to bottom,
			var(--bg) 0%,
			color-mix(in srgb, var(--bg) 55%, transparent) 50%,
			transparent 100%
		);
	}

	.detail-top > * {
		pointer-events: auto;
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
		font-size: 1.55rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.2;
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
		/* Match list-col filter + plus chrome spacing */
		gap: 6px;
	}

	.icon-hit {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border: 1px solid transparent;
		border-radius: 10px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66);
		padding: 0;
		cursor: pointer;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.15s var(--ease);
	}

	.icon-hit:hover {
		transform: scale(1.06);
	}

	.icon-hit:active {
		transform: scale(0.96);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.task-title-row {
		/* Match TaskCreate: status | title | priority */
		padding-left: 16px;
		padding-right: 16px;
	}

	.task-title-row .title {
		flex: 1;
		min-width: 0;
	}

	.title {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-family: var(--font);
		font-size: 1.55rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.2;
		color: var(--white);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 48px 0 24px;
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
		padding-top: 8px;
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

	.prose :global(a) {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-thickness: 1px;
	}

	.prose :global(a:hover) {
		color: var(--link-hover);
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

	.muted.tight {
		padding: 4px 0 8px;
		margin: 0;
	}

	.bento {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		padding: 16px 16px 8px;
		box-sizing: border-box;
	}

	.bento-panel {
		min-width: 0;
		padding: 12px 12px 8px;
		border-radius: 16px;
		background: var(--fg-4);
		box-sizing: border-box;
	}

	.bento-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 0 6px;
		box-sizing: border-box;
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.bento-count {
		font-family: var(--font);
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.proj-add {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
	}

	.proj-add:hover:not(:disabled) {
		color: var(--fg);
		background: var(--fg-8);
	}

	.proj-add:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.linked-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.linked-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		font: inherit;
		box-sizing: border-box;
		cursor: pointer;
	}

	.linked-row:hover {
		background: transparent;
	}

	.linked-title {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.float-list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 4px 0;
	}

	.menu-item {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.menu-item:hover {
		background: var(--fg-4);
		color: var(--fg);
	}

	.menu-item.danger {
		color: var(--destructive);
	}

	.menu-item.danger:hover {
		background: var(--destructive-16);
		color: var(--destructive);
	}

	.menu-item svg {
		flex-shrink: 0;
		opacity: 0.85;
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

	@media (max-width: 767px) {
		.detail {
			position: fixed;
			inset: 0;
			z-index: 55;
			width: 100%;
			/* Match mobile shell (desktop sidebar) — stay mounted off-screen for slide */
			background: var(--shell);
			transform: translate3d(100%, 0, 0);
			transition: transform 0.34s var(--ease);
			pointer-events: none;
			visibility: visible;
		}

		/* Full-bleed under glass bottom nav so the feed can blur through */
		.detail.player-mode {
			z-index: 35;
			bottom: 0;
		}

		.detail.open {
			transform: translate3d(0, 0, 0);
			pointer-events: auto;
		}

		/* Keep off-screen panel in the layer tree (no display:none — that kills slide) */
		.detail.empty {
			display: flex;
		}

		.mobile-bar {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			z-index: 8;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			height: calc(88px + env(safe-area-inset-top, 0px));
			padding: calc(6px + env(safe-area-inset-top, 0px)) 14px 34px;
			border-bottom: none;
			flex-shrink: 0;
			box-sizing: border-box;
			pointer-events: none;
			background: linear-gradient(
				to bottom,
				var(--shell) 0%,
				color-mix(in srgb, var(--shell) 75%, transparent) 42%,
				color-mix(in srgb, var(--shell) 28%, transparent) 72%,
				transparent 100%
			);
		}

		.mobile-bar > * {
			pointer-events: auto;
		}

		.mobile-title {
			flex: 1;
			min-width: 0;
			text-align: center;
			font-family: 'Inter', var(--font), system-ui, sans-serif;
			font-size: 19px;
			font-weight: 650;
			letter-spacing: -0.02em;
			line-height: 1.15;
			color: var(--fg);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.chrome-btn {
			width: 44px;
			height: 44px;
			display: grid;
			place-items: center;
			border: 1px solid transparent;
			border-radius: 9999px;
			background:
				linear-gradient(var(--glass), var(--glass)) padding-box,
				var(--glass-shine) border-box;
			color: var(--fg-66);
			padding: 0;
			cursor: pointer;
			flex-shrink: 0;
			box-sizing: border-box;
			backdrop-filter: blur(var(--glass-blur));
			-webkit-backdrop-filter: blur(var(--glass-blur));
			-webkit-tap-highlight-color: transparent;
			transition: transform 0.15s var(--ease);
		}

		.chrome-btn:hover,
		.chrome-btn[aria-expanded='true'] {
			transform: scale(1.04);
		}

		.chrome-btn :global(svg) {
			width: 22px;
			height: 22px;
		}

		.chrome-btn.more-btn :global(svg) {
			width: 26px;
			height: 26px;
		}

		.title-row {
			padding-top: 10px;
		}

		.bento {
			grid-template-columns: 1fr;
			padding: 12px 12px 8px;
			gap: 10px;
		}

		/* Empty space on the side the chevron does not point toward */
		.chrome-btn.chev-back :global(svg) {
			padding-right: 2px;
			box-sizing: content-box;
		}

		/* Keep equal-width side slots so the title stays optically centered */
		.mobile-bar > .chrome-btn,
		.mobile-bar > .menu-wrap {
			width: 44px;
			flex-shrink: 0;
		}

		.desktop-head,
		.desktop-empty {
			display: none;
		}

		.body {
			padding: calc(56px + env(safe-area-inset-top, 0px)) 0
				calc(24px + env(safe-area-inset-bottom, 0px));
		}

		/* Player feed scrolls under the mobile bar — pad inside PlayerDetail.feed */
		.body.player-body {
			padding-top: 0;
			padding-bottom: 0;
		}
	}
</style>
