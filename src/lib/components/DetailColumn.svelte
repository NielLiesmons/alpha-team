<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import ProjectBox from './ProjectBox.svelte';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import TaskBox from './TaskBox.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import DetailMetaPills from './DetailMetaPills.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';
	import Pen from './icons/Pen.svelte';
	import Trash from './icons/Trash.svelte';
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		campaigns,
		mailSettings,
		persistDeleteCampaign,
		persistDeletePost,
		persistSendCampaign,
		publicPosts
	} from '$lib/publications.svelte.js';
	import {
		findMail,
		formatMailWhen,
		mailAuthorLabel,
		markMailRead,
		threadMessages
	} from '$lib/mail.svelte.js';
	import {
		projectLifecycle,
		primaryEnterpriseId,
		projectDisplayIcon
	} from '$lib/project-status.js';
	import { renderInlineLinks } from '$lib/note-text.js';
	import { accountingBrowse } from '$lib/accounting.svelte.js';
	import AccountingDetail from './AccountingDetail.svelte';
	import ChatChannelPanel from './ChatChannelPanel.svelte';
	import CommentThread from './CommentThread.svelte';
	import FormDetail from './FormDetail.svelte';
	import PublicationsHub from './PublicationsHub.svelte';
	import SettingsSectionDetail from './SettingsSectionDetail.svelte';
	import { channelById } from '$lib/chat.svelte.js';
	import MetricDetail from './MetricDetail.svelte';
	import TableDetail from './TableDetail.svelte';
	import ViewDetail from './ViewDetail.svelte';
	import PullToRefresh from './PullToRefresh.svelte';
	import { syncUi } from '$lib/sync-progress.svelte.js';
	import { refreshAllDrive } from '$lib/drive-refresh.js';
	import { attachChromeScrollFade } from '$lib/chrome-scroll-fade.js';
	import { openEntreprisesEntity } from '$lib/entity-routes.js';
	import {
		captureForms,
		clearSelection,
		costItems,
		dataTables,
		dataViews,
		deleteWorkspaceEntity,
		enterprises,
		forceClearSelection,
		ledgerEntries,
		metrics,
		notes,
		openComposer,
		patchEnterprise,
		patchProject,
		patchTask,
		projects,
		salesLines,
		saveNote,
		selectEntity,
		tasks,
		ui
	} from '$lib/workspace.svelte.js';

	const BENTO_PREVIEW = 5;

	/** @param {'table' | 'metric' | 'view' | 'form' | 'project' | 'task' | 'note'} kind @param {string} id */
	function openLinked(kind, id) {
		if (kind === 'table' || kind === 'metric' || kind === 'view' || kind === 'form') {
			openEntreprisesEntity(kind, id);
			return;
		}
		selectEntity(kind, id);
	}

	/** @param {string} path */
	function viewAll(path) {
		forceClearSelection();
		void goto(path);
	}

	/** @type {HTMLTextAreaElement | undefined} */
	let descEl = $state();

	/** @param {HTMLTextAreaElement | null | undefined} el */
	function hugDescription(el) {
		if (!el) return;
		el.style.height = 'auto';
		/* ≥ one line so empty placeholder stays visible */
		el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
	}

	const selection = $derived(ui.selection);
	const chatChannelId = $derived(selection?.kind === 'chat' ? String(selection.id) : null);
	const chatChannel = $derived(chatChannelId ? channelById(chatChannelId) : null);

	/** @type {HTMLElement | undefined} */
	let detailRoot = $state();
	/** 0 at rest → 1 after ~16px scroll (detail-top / mobile-bar fade) */
	let detailFade = $state(0);

	$effect(() => {
		selection;
		const root = detailRoot;
		return attachChromeScrollFade(root, (v) => {
			detailFade = v;
		});
	});

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
	const dataTable = $derived(
		selection?.kind === 'table'
			? dataTables.find((e) => String(e.id) === String(selection.id))
			: null
	);
	const metricDoc = $derived(
		selection?.kind === 'metric'
			? metrics.find((e) => String(e.id) === String(selection.id))
			: null
	);
	const formDoc = $derived(
		selection?.kind === 'form'
			? captureForms.find((e) => String(e.id) === String(selection.id))
			: null
	);
	const viewDoc = $derived(
		selection?.kind === 'view'
			? dataViews.find((e) => String(e.id) === String(selection.id))
			: null
	);
	const isEntreprises = $derived(
		$page.url.pathname.startsWith('/entreprises') || $page.url.pathname.startsWith('/accounting')
	);
	/* List lives in /entreprises feed (category tabs); detail only for a selected entity */
	const accountingPanel = $derived(false);
	const newsletter = $derived(
		selection?.kind === 'newsletter' && !String(selection.id || '').startsWith('post:')
			? campaigns.find((c) => c.id === selection.id)
			: null
	);
	const pubPostSlug = $derived(
		selection?.kind === 'newsletter' && String(selection.id || '').startsWith('post:')
			? String(selection.id).slice(5)
			: ''
	);
	const pubPost = $derived(
		pubPostSlug
			? publicPosts.find((p) => p.slug === pubPostSlug || p.id === pubPostSlug) || null
			: null
	);
	const welcomeSelected = $derived(selection?.kind === 'welcome');
	const pubsHub = $derived(selection?.kind === 'pubs');
	const mailMsg = $derived(selection?.kind === 'mail' ? findMail(selection.id) : null);
	const settingsSectionId = $derived(
		selection?.kind === 'settings' ? String(selection.id || '') : ''
	);
	const SETTINGS_TITLES = {
		profile: 'Profile',
		notifications: 'Notifications',
		appearance: 'Appearance',
		storage: 'Storage',
		mail: 'Mail',
		publications: 'Publications',
		drive: 'Drive'
	};

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

	const enterpriseTables = $derived.by(() => {
		if (!enterprise) return [];
		const eid = String(enterprise.id);
		return dataTables.filter(
			(t) =>
				String(t.enterprise_id ?? '') === eid ||
				(Array.isArray(enterprise.table_ids) &&
					enterprise.table_ids.some((id) => String(id) === String(t.id)))
		);
	});

	const enterpriseMetrics = $derived.by(() => {
		if (!enterprise) return [];
		const eid = String(enterprise.id);
		return metrics.filter((m) => String(m.enterprise_id ?? '') === eid);
	});

	const enterpriseViews = $derived.by(() => {
		if (!enterprise) return [];
		const eid = String(enterprise.id);
		return dataViews.filter((v) => String(v.enterprise_id ?? '') === eid);
	});

	/** @type {HTMLElement | null} */
	let menuAnchor = $state(null);
	let menuOpen = $state(false);

	/** Composer edit still useful for welcome / newsletter / site posts (not inline). */
	const canComposerEdit = $derived(Boolean(newsletter || pubPost || welcomeSelected));
	const canDelete = $derived(
		Boolean(task || project || note || enterprise || newsletter || pubPost)
	);
	const canShare = $derived(
		Boolean(
			task || project || note || enterprise || dataTable || metricDoc || viewDoc || newsletter || pubPost
		)
	);
	const showMoreMenu = $derived(
		Boolean(canDelete || canShare || canComposerEdit)
	);

	const typeLabel = $derived.by(() => {
		if (task) return 'Task';
		if (project) return 'Project';
		if (note) return 'Note';
		if (ledger) return 'Ledger';
		if (costItem) return 'Cost';
		if (salesLine) return 'Sales';
		if (viewDoc) return 'View';
		if (dataTable) return 'Table';
		if (metricDoc) return 'Metric';
		if (formDoc) return 'Form';
		if (enterprise) return 'Enterprise';
		if (accountingPanel) return 'Entreprises';
		if (newsletter) return 'Letter';
		if (pubPost) {
			const k = String(pubPost.kind || 'blog');
			if (k === 'event') return 'Event';
			if (k === 'post') return 'Post';
			return 'Blog';
		}
		if (welcomeSelected) return 'Welcome';
		if (pubsHub) return 'Publications';
		if (mailMsg) return 'Mail';
		if (chatChannel) return chatChannel.title || 'Chat';
		if (settingsSectionId) return SETTINGS_TITLES[settingsSectionId] || 'Settings';
		return 'Detail';
	});

	/** Centered mobile detail title (entity name when available). */
	const mobileTitle = $derived.by(() => {
		if (task?.title) return task.title;
		if (project?.title) return project.title;
		if (note?.title) return note.title;
		if (ledger) return ledger.memo || ledger.account_title || 'Entry';
		if (costItem?.title) return costItem.title;
		if (salesLine?.title) return salesLine.title;
		if (viewDoc?.title) return viewDoc.title;
		if (dataTable?.title) return dataTable.title;
		if (metricDoc?.title || metricDoc?.key) return metricDoc.title || metricDoc.key;
		if (formDoc?.title) return formDoc.title;
		if (enterprise?.title) return enterprise.title;
		if (accountingPanel) return accountingBrowse.mode;
		if (newsletter?.subject) return newsletter.subject;
		if (pubPost?.title) return pubPost.title;
		if (welcomeSelected) return 'Welcome';
		if (pubsHub) return 'Publications';
		if (mailMsg?.subject) return mailMsg.subject;
		if (chatChannel) return chatChannel.title || 'General';
		if (settingsSectionId) return SETTINGS_TITLES[settingsSectionId] || 'Settings';
		return typeLabel;
	});

	const open = $derived(
		Boolean(
				task ||
				project ||
				note ||
				ledger ||
				costItem ||
				salesLine ||
				viewDoc ||
				dataTable ||
				metricDoc ||
				formDoc ||
				enterprise ||
				accountingPanel ||
				newsletter ||
				pubPost ||
				welcomeSelected ||
				pubsHub ||
				mailMsg ||
				chatChannel ||
				settingsSectionId
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
				body: 'Open an Entreprise — Views, Tables, and Metrics live inside it.'
			};
		if (path.startsWith('/publications') || path.startsWith('/website'))
			return {
				title: path.startsWith('/website') ? 'No section open' : 'Publications',
				body: path.startsWith('/website')
					? 'Open Publications from a site card — it appears here in the detail column.'
					: 'Open the hub — Blog letters mail subscribers and appear on the site.'
			};
		if (path.startsWith('/mail'))
			return {
				title: 'No message selected',
				body: 'Pick a message from Inbox or Sent — or use + to compose for your mailbox.'
			};
		if (path.startsWith('/chat'))
			return {
				title: 'No chat selected',
				body: 'Pick a chat from the list to open it here.'
			};
		if (path.startsWith('/settings'))
			return {
				title: 'Settings',
				body: 'Pick a profile card action or a section to open it here.'
			};
		return { title: 'Nothing open', body: 'Select a task, project, note, mail, or chat to view it here.' };
	});

	let sendBusy = $state(false);

	async function sendSelectedNewsletter() {
		if (!newsletter || newsletter.status === 'sent') return;
		if (
			!confirm(
				'Publish this letter? It will email every subscriber and appear as a Blog post on the site.'
			)
		)
			return;
		sendBusy = true;
		try {
			await persistSendCampaign(newsletter.id);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			sendBusy = false;
		}
	}

	/** Inline title / body drafts for the open entity */
	let draftKey = $state(/** @type {string | null} */ (null));
	let draftTitle = $state('');
	let draftBody = $state('');
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let draftSaveTimer;
	let draftSaving = $state(false);

	$effect(() => {
		draftBody;
		const el = descEl;
		if (!el) return;
		queueMicrotask(() => hugDescription(el));
	});

	const inlineKind = $derived.by(() => {
		if (task) return 'task';
		if (project) return 'project';
		if (note) return 'note';
		if (enterprise) return 'enterprise';
		return null;
	});

	$effect(() => {
		const kind = inlineKind;
		const ent = task || project || note || enterprise;
		const id = ent?.id ?? null;
		const key = kind && id ? `${kind}:${id}` : null;
		if (!key || !ent) {
			draftKey = null;
			return;
		}
		if (draftKey === key) return;
		draftKey = key;
		draftTitle = ent.title ?? '';
		draftBody =
			kind === 'project' || kind === 'enterprise'
				? ent.description || ent.body || ''
				: ent.body ?? '';
	});

	function scheduleDraftSave() {
		if (!inlineKind) return;
		clearTimeout(draftSaveTimer);
		draftSaveTimer = setTimeout(() => {
			void persistDraft();
		}, 450);
	}

	async function persistDraft() {
		const kind = inlineKind;
		if (!kind) return;
		const title = draftTitle.trim() || 'Untitled';
		const body = draftBody;
		draftSaving = true;
		try {
			if (kind === 'note' && note) {
				if (title === (note.title ?? '') && body === (note.body ?? '')) return;
				await saveNote({ ...note, title, body }, false);
			} else if (kind === 'task' && task) {
				if (title === (task.title ?? '') && body === (task.body ?? '')) return;
				await patchTask(task.id, { title, body });
			} else if (kind === 'project' && project) {
				if (title === (project.title ?? '') && body === (project.description ?? '')) return;
				await patchProject(project.id, { title, description: body });
			} else if (kind === 'enterprise' && enterprise) {
				if (title === (enterprise.title ?? '') && body === (enterprise.description ?? '')) return;
				await patchEnterprise(enterprise.id, { title, description: body });
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		} finally {
			draftSaving = false;
		}
	}

	/** @param {string} html */
	function onNoteBodyChange(html) {
		draftBody = html;
		scheduleDraftSave();
	}

	/** @param {MouseEvent} e */
	function toggleMoreMenu(e) {
		const btn = /** @type {HTMLElement} */ (e.currentTarget);
		if (menuOpen && menuAnchor === btn) {
			menuOpen = false;
			return;
		}
		menuAnchor = btn;
		menuOpen = true;
	}

	function editCurrent() {
		menuOpen = false;
		if (!selection) return;
		if (selection.kind === 'newsletter' || selection.kind === 'welcome') {
			openComposer(selection.kind, selection.id);
		}
	}

	async function shareCurrent() {
		menuOpen = false;
		const base = typeof window !== 'undefined' ? window.location.origin : '';
		const site =
			newsletter?.post_slug || pubPost?.slug
				? `https://bley.farm/fr/publications/${newsletter?.post_slug || pubPost?.slug}`
				: '';
		const url = site || (typeof window !== 'undefined' ? window.location.href : '') || base;
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			window.prompt('Copy link', url);
		}
	}

	async function deleteCurrent() {
		menuOpen = false;
		if (!selection) return;
		const kind = selection.kind;
		if (kind === 'newsletter') {
			const id = String(selection.id || '');
			if (id.startsWith('post:')) {
				const slug = id.slice(5);
				if (!confirm(`Delete this publication from the site? This cannot be undone.`)) return;
				try {
					await persistDeletePost(slug);
					forceClearSelection();
				} catch (e) {
					alert(e instanceof Error ? e.message : String(e));
				}
				return;
			}
			if (!confirm(`Delete this letter? Removes it from the public site too.`)) return;
			try {
				await persistDeleteCampaign(id);
				forceClearSelection();
			} catch (e) {
				alert(e instanceof Error ? e.message : String(e));
			}
			return;
		}
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
		if (inlineKind) {
			clearTimeout(draftSaveTimer);
			void persistDraft();
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
	aria-label="Detail"
	bind:this={detailRoot}
	style="--chrome-scroll-fade: {detailFade}"
	class:titles-syncing={syncUi.active}
	aria-busy={syncUi.active || undefined}
>
	{#if renderBody}
		<header class="mobile-bar">
			<button
				type="button"
				class="chrome-btn chev-back"
				aria-label="Back"
				onclick={close}
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
			<span class="mobile-title-stack">
				<span class="mobile-type">{mobileTitle || typeLabel}</span>
			</span>
			{#if showMoreMenu}
				<button
					type="button"
					class="chrome-btn more-btn"
					aria-label="More"
					aria-expanded={menuOpen}
					onclick={toggleMoreMenu}
				>
					<svg width="26" height="26" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<circle cx="9" cy="3.75" r="1.65" fill="currentColor" />
						<circle cx="9" cy="9" r="1.65" fill="currentColor" />
						<circle cx="9" cy="14.25" r="1.65" fill="currentColor" />
					</svg>
				</button>
			{:else}
				<span class="menu-spacer" aria-hidden="true"></span>
			{/if}
		</header>

		<FloatPanel
			open={menuOpen}
			anchor={menuAnchor}
			placement="below"
			align="end"
			width={200}
			maxHeight={280}
			onclose={() => (menuOpen = false)}
		>
			<div class="float-list" role="menu">
				{#if canShare}
					<button type="button" class="menu-item" role="menuitem" onclick={() => void shareCurrent()}>
						Share
					</button>
				{/if}
				{#if canComposerEdit}
					<button type="button" class="menu-item" role="menuitem" onclick={editCurrent}>
						<Pen size={13} />
						Edit
					</button>
				{/if}
				{#if canDelete}
					<button type="button" class="menu-item danger" role="menuitem" onclick={deleteCurrent}>
						<Trash size={15} />
						Delete
					</button>
				{/if}
			</div>
		</FloatPanel>

	<PullToRefresh onRefresh={() => refreshAllDrive()}>
	{#if task}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Task</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">Saving…</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label="More"
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="3.2" r="1.35" fill="currentColor" />
							<circle cx="8" cy="8" r="1.35" fill="currentColor" />
							<circle cx="8" cy="12.8" r="1.35" fill="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			<div class="title-row task-title-row">
				<TaskFieldPicker taskId={task.id} field="status" value={task.status} size={24} />
				<input
					class="title-input"
					bind:value={draftTitle}
					aria-label="Task title"
					placeholder="Untitled"
					oninput={scheduleDraftSave}
				/>
				<TaskFieldPicker
					taskId={task.id}
					field="priority"
					value={task.priority ?? 'none'}
					size={22}
					align="right"
				/>
			</div>
			<DetailMetaPills entity={task} kind="task" />
			<textarea
				class="body-input"
				bind:value={draftBody}
				aria-label="Task description"
				placeholder="Add a description…"
				rows="3"
				oninput={scheduleDraftSave}
			></textarea>
		</div>
		<CommentThread type="task" entityId={task.id} />
	{:else if project}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Project</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">Saving…</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label="More"
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="3.2" r="1.35" fill="currentColor" />
							<circle cx="8" cy="8" r="1.35" fill="currentColor" />
							<circle cx="8" cy="12.8" r="1.35" fill="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			<div class="title-row">
				<ProjectBox
					state={projectLifecycle(project, tasks)}
					icon={projectDisplayIcon(project, enterprises)}
					size={24}
				/>
				<input
					class="title-input"
					bind:value={draftTitle}
					aria-label="Project title"
					placeholder="Untitled"
					oninput={scheduleDraftSave}
				/>
			</div>
			<textarea
				class="body-input body-input-hug"
				bind:this={descEl}
				bind:value={draftBody}
				aria-label="Project description"
				placeholder="Add a description…"
				rows="1"
				oninput={(e) => {
					hugDescription(/** @type {HTMLTextAreaElement} */ (e.currentTarget));
					scheduleDraftSave();
				}}
			></textarea>

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
							{#each projectTasks.slice(0, BENTO_PREVIEW) as t (t.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('task', t.id)}>
										<TaskBox state={t.status} size={18} />
										<span class="linked-title">{t.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/tasks')}>View all</button>
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
							{#each projectNotes.slice(0, BENTO_PREVIEW) as n (n.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('note', n.id)}>
										<span class="linked-title">{n.title || 'Untitled'}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/notes')}>View all</button>
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
		<CommentThread type="project" entityId={project.id} />
	{:else if note}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Note</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">Saving…</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label="More"
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="3.2" r="1.35" fill="currentColor" />
							<circle cx="8" cy="8" r="1.35" fill="currentColor" />
							<circle cx="8" cy="12.8" r="1.35" fill="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</header>
		<div class="body note-body-wrap">
			<div class="title-row">
				<input
					class="title-input"
					bind:value={draftTitle}
					aria-label="Note title"
					placeholder="Untitled"
					oninput={scheduleDraftSave}
				/>
			</div>
			<DetailMetaPills entity={note} kind="note" />
			{#key note.id}
				<div class="note-editor-pad">
					<NoteEditor value={draftBody} editable={true} onChange={onNoteBodyChange} />
				</div>
			{/key}
		</div>
		<CommentThread type="note" entityId={note.id} />
	{:else if pubsHub}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Publications</span>
			</div>
		</header>
		<div class="body">
			<PublicationsHub filterKind={$page.url.searchParams.get('kind')} />
		</div>
	{:else if welcomeSelected}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Welcome</span>
			</div>
			<div class="detail-top-actions">
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label="More"
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="3.2" r="1.35" fill="currentColor" />
							<circle cx="8" cy="8" r="1.35" fill="currentColor" />
							<circle cx="8" cy="12.8" r="1.35" fill="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			<p class="pub-kicker">{mailSettings.welcome.enabled ? 'On for new subscribers' : 'Off'}</p>
			<h2 class="pub-title">{mailSettings.welcome.subject_fr || 'Welcome'}</h2>
			<pre class="pub-body">{mailSettings.welcome.body_fr}</pre>
		</div>
	{:else if newsletter}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Newsletter</span>
			</div>
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
				{:else if newsletter.post_slug}
					<button
						type="button"
						class="send-chip"
						onclick={() => openComposer('newsletter', newsletter.id)}
					>
						Edit site
					</button>
				{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label="More"
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="3.2" r="1.35" fill="currentColor" />
							<circle cx="8" cy="8" r="1.35" fill="currentColor" />
							<circle cx="8" cy="12.8" r="1.35" fill="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			<p class="pub-kicker">
				{newsletter.status}{#if newsletter.sent_count}
					· {newsletter.sent_count} sent{/if}{#if newsletter.post_slug}
					· on site{/if}
			</p>
			<h2 class="pub-title">{newsletter.subject}</h2>
			<pre class="pub-body">{newsletter.body}</pre>
		</div>
	{:else if pubPost}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">{typeLabel}</span>
			</div>
			<div class="detail-top-actions">
				<button
					type="button"
					class="send-chip"
					onclick={() => openComposer('newsletter', `post:${pubPost.slug}`)}
				>
					Edit
				</button>
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label="More"
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="3.2" r="1.35" fill="currentColor" />
							<circle cx="8" cy="8" r="1.35" fill="currentColor" />
							<circle cx="8" cy="12.8" r="1.35" fill="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			<p class="pub-kicker">
				{pubPost.kind || 'blog'}{#if pubPost.updated_at}
					· edited{/if}{#if pubPost.slug}
					· /{pubPost.slug}{/if}
			</p>
			<h2 class="pub-title">{pubPost.title}</h2>
			{#if pubPost.summary}
				<pre class="pub-body">{pubPost.summary}</pre>
			{/if}
		</div>
	{:else if mailMsg}
		{@const thread = threadMessages(mailMsg)}
		{@const me = (activePerson().email || '').trim().toLowerCase()}
		{@const last = thread[thread.length - 1] || mailMsg}
		{@const replyTo =
			(last.from || '').toLowerCase() === me
				? last.to?.[0] || mailMsg.from || ''
				: last.from || mailMsg.from || ''}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label"
					>{thread.length > 1 ? `Thread · ${thread.length}` : 'Mail'}</span
				>
			</div>
			<div class="detail-top-actions">
				<button
					type="button"
					class="send-chip"
					onclick={() =>
						openComposer('mail', undefined, undefined, {
							to: replyTo
						})
					}
				>
					Reply
				</button>
			</div>
		</header>
		<div class="body mail-thread">
			<h2 class="pub-title">{mailMsg.subject || '(no subject)'}</h2>
			{#each thread as m (m.id)}
				<article class="thread-msg">
					<p class="pub-kicker">
						{mailAuthorLabel(m) || displayNameFromEmail(m.from)}
						→ {(m.to || []).map(displayNameFromEmail).join(', ')}
						· {formatMailWhen(m.created_at)}
					</p>
					<pre class="pub-body">{m.body || ''}</pre>
				</article>
			{/each}
		</div>
	{:else if settingsSectionId}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">{SETTINGS_TITLES[settingsSectionId] || 'Settings'}</span>
			</div>
			<div class="detail-top-actions"></div>
		</header>
		<div class="body settings-section-body">
			<SettingsSectionDetail sectionId={settingsSectionId} />
		</div>
	{:else if chatChannel}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">{chatChannel.title || 'General'}</span>
			</div>
			<div class="detail-top-actions"></div>
		</header>
		<div class="body chat-channel-body">
			<ChatChannelPanel channelId={chatChannel.id} />
		</div>
	{:else if accountingPanel}
		<AccountingDetail />
	{:else if ledger}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Ledger</span>
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
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Cost</span>
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
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Sales</span>
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
	{:else if viewDoc}
		<ViewDetail view={viewDoc} />
	{:else if dataTable}
		<TableDetail table={dataTable} />
	{:else if metricDoc}
		<MetricDetail metric={metricDoc} />
	{:else if formDoc}
		<FormDetail form={formDoc} />
	{:else if enterprise}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label="Back" onclick={close}>
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
				<span class="detail-top-label">Enterprise</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">Saving…</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label="More"
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="3.2" r="1.35" fill="currentColor" />
							<circle cx="8" cy="8" r="1.35" fill="currentColor" />
							<circle cx="8" cy="12.8" r="1.35" fill="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			<div class="title-row">
				<EnterpriseBox state={enterprise.status ?? 'active'} icon={enterprise.icon} size={36} />
				<input
					class="title-input"
					bind:value={draftTitle}
					aria-label="Enterprise title"
					placeholder="Untitled"
					oninput={scheduleDraftSave}
				/>
			</div>
			<textarea
				class="body-input body-input-hug"
				bind:this={descEl}
				bind:value={draftBody}
				aria-label="Enterprise description"
				placeholder="Add a description…"
				rows="1"
				oninput={(e) => {
					hugDescription(/** @type {HTMLTextAreaElement} */ (e.currentTarget));
					scheduleDraftSave();
				}}
			></textarea>

			<div class="bento">
				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Views</span>
						<span class="bento-count">{enterpriseViews.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add view"
							onclick={() =>
								openComposer('view', undefined, undefined, { enterprise_id: enterprise.id })
							}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseViews.length === 0}
						<p class="muted tight">No views yet.</p>
					{:else}
						<ul class="linked-list">
							{#each enterpriseViews.slice(0, BENTO_PREVIEW) as v (v.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => openLinked('view', v.id)}>
										<span class="linked-title">{v.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/entreprises')}>View all</button>
				</section>

				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Tables</span>
						<span class="bento-count">{enterpriseTables.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add table"
							onclick={() =>
								openComposer('table', undefined, undefined, { enterprise_id: enterprise.id })
							}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseTables.length === 0}
						<p class="muted tight">No tables yet.</p>
					{:else}
						<ul class="linked-list">
							{#each enterpriseTables.slice(0, BENTO_PREVIEW) as t (t.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => openLinked('table', t.id)}>
										<span class="linked-title">{t.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/entreprises')}>View all</button>
				</section>

				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Metrics</span>
						<span class="bento-count">{enterpriseMetrics.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add metric"
							onclick={() =>
								openComposer('metric', undefined, undefined, { enterprise_id: enterprise.id })
							}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseMetrics.length === 0}
						<p class="muted tight">No metrics yet.</p>
					{:else}
						<ul class="linked-list">
							{#each enterpriseMetrics.slice(0, BENTO_PREVIEW) as m (m.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => openLinked('metric', m.id)}>
										<span class="linked-title">{m.title || m.key}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/entreprises')}>View all</button>
				</section>

				<section class="bento-panel">
					<div class="bento-head">
						<span class="eyebrow-label-xs">Projects</span>
						<span class="bento-count">{enterpriseProjects.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label="Add project"
							onclick={() =>
								openComposer('project', undefined, undefined, {
									primary_enterprise_id: enterprise.id,
									enterprise_ids: [enterprise.id]
								})
							}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseProjects.length === 0}
						<p class="muted tight">No projects yet.</p>
					{:else}
						<ul class="linked-list">
							{#each enterpriseProjects.slice(0, BENTO_PREVIEW) as p (p.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('project', p.id)}>
										<span class="linked-title">{p.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/projects')}>View all</button>
				</section>

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
							{#each enterpriseTasks.slice(0, BENTO_PREVIEW) as t (t.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('task', t.id)}>
										<TaskBox state={t.status} size={18} />
										<span class="linked-title">{t.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/tasks')}>View all</button>
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
							{#each enterpriseNotes.slice(0, BENTO_PREVIEW) as n (n.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('note', n.id)}>
										<span class="linked-title">{n.title || 'Untitled'}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/notes')}>View all</button>
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
	</PullToRefresh>
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

	.mail-thread {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.thread-msg {
		padding: 14px 0 18px;
		border-bottom: 1px solid color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.thread-msg:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}

	.thread-msg .pub-kicker {
		margin-bottom: 10px;
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

	/* Floating detail header — solid control row; fade veil only as content scrolls under.
	   :global so Table/Metric/View detail children share the same chrome. */
	:global(.detail .detail-top) {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 6;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		/* Control row ~48px; taller box = scroll-driven fade zone */
		height: 72px;
		padding: 0 24px;
		border-bottom: none;
		box-sizing: border-box;
		pointer-events: none;
		background: transparent;
	}

	/* Three-stop fade: solid near bar → ~80% mid → clear (no solid ::before cliff) */
	:global(.detail .detail-top)::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 72px;
		background: linear-gradient(
			to bottom,
			var(--bg) 0%,
			color-mix(in srgb, var(--bg) 80%, transparent) 50%,
			transparent 100%
		);
		opacity: var(--chrome-scroll-fade, 0);
		pointer-events: none;
		z-index: -1;
	}

	:global(.detail .detail-top-start),
	:global(.detail .detail-top-actions) {
		height: 48px;
		display: flex;
		align-items: center;
	}

	:global(.detail .detail-top > *) {
		pointer-events: auto;
	}

	:global(.detail .detail-top-start) {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	:global(.detail .detail-top-label) {
		flex: 0 1 auto;
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

	.mobile-title-stack {
		display: none;
	}

	:global(.detail .ptr) {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	:global(.detail .detail-top-actions) {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
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

	.body-input {
		display: block;
		width: 100%;
		min-height: 4.5rem;
		margin: 4px 0 8px;
		padding: 0;
		border: 0;
		outline: none;
		resize: none;
		background: transparent;
		font: inherit;
		font-size: 15px;
		line-height: 1.55;
		color: var(--fg-83);
		box-sizing: border-box;
	}

	.body-input.body-input-hug {
		/* Keep one line visible when empty so placeholder stays editable/visible */
		min-height: 1.55em;
		height: auto;
		margin: 2px 0 10px;
		overflow: hidden;
		field-sizing: content;
	}

	.body-input::placeholder {
		color: var(--fg-33);
	}

	.note-editor-pad {
		/* Match task .prose — 4px under meta pills */
		padding: 4px 0 16px;
		flex: 1;
		min-height: 0;
	}

	.menu-spacer {
		width: 44px;
		flex-shrink: 0;
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

	/* Glass chrome only on detail top-bar hits — not status/priority pickers in the body */
	:global(.detail .detail-top .icon-hit) {
		width: 28px;
		height: 28px;
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

	:global(.detail .detail-top .icon-hit:hover) {
		transform: scale(1.06);
	}

	:global(.detail .detail-top .icon-hit:active) {
		transform: scale(0.96);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.task-title-row {
		/* Match TaskCreate: status | title | priority — side inset from .body */
		padding-left: 0;
		padding-right: 0;
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
		/* Clears solid part of the 72px detail-top fade */
		padding: 56px 24px 32px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* Nested entity bodies (View/Table/Metric/Form) — desktop side inset */
	:global(.detail > .body) {
		box-sizing: border-box;
	}

	.body.player-body {
		/* Match Task/Note column chrome; list scrolls inside PlayerDetail */
		overflow: hidden;
		width: 100%;
	}

	.body.settings-section-body {
		padding: 16px 18px 24px;
		overflow: auto;
	}

	.body.chat-channel-body {
		overflow: hidden;
		padding: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.note-body-wrap {
		overflow: auto;
	}

	.title-row,
	.block,
	.prose,
	.summary,
	.muted {
		padding-left: 0;
		padding-right: 0;
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
		color: var(--fg-83);
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
		gap: 16px;
		padding: 8px 0 0;
		box-sizing: border-box;
	}

	.bento-panel {
		position: relative;
		min-width: 0;
		min-height: 168px;
		padding: 16px;
		border-radius: 18px;
		background: var(--fg-4);
		box-sizing: border-box;
	}

	/* Overlay FAB — floats on panel; clearance via last-row pad (no glass/stroke/hover). */
	.view-all-fab {
		position: absolute;
		right: 10px;
		bottom: 10px;
		z-index: 2;
		padding: 6px 11px;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 92%, transparent);
		box-shadow: none;
		color: var(--fg-66);
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
	}

	.view-all-fab:hover,
	.view-all-fab:focus-visible {
		color: var(--fg-66);
		background: color-mix(in srgb, var(--bg) 92%, transparent);
	}

	/* Keep last list row / empty line clear of the View all FAB. */
	.bento-panel .linked-list > li:last-child .linked-row,
	.bento-panel > .muted.tight {
		padding-right: 5.75rem;
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
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
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
		color: var(--fg-66);
	}

	.menu-item.danger:hover {
		background: var(--fg-8);
		color: var(--fg);
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
		font-size: 1.65rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--fg-33);
	}

	.empty-body {
		margin: 0.55rem 0 0;
		max-width: 16rem;
		font-size: 14px;
		line-height: 1.5;
		color: var(--fg-16);
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
			background: transparent;
		}

		.mobile-bar::after {
			content: '';
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			height: 100%;
			background: linear-gradient(
				to bottom,
				var(--shell) 0%,
				color-mix(in srgb, var(--shell) 80%, transparent) 50%,
				transparent 100%
			);
			opacity: var(--chrome-scroll-fade, 0);
			pointer-events: none;
			z-index: -1;
		}

		.mobile-bar > * {
			pointer-events: auto;
		}

		.mobile-title-stack {
			position: relative;
			flex: 1;
			min-width: 0;
			height: 44px;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
		}

		.mobile-type {
			min-width: 0;
			max-width: 100%;
			text-align: center;
			font-family: 'Inter', var(--font), system-ui, sans-serif;
			font-size: 17px;
			font-weight: 600;
			letter-spacing: -0.01em;
			line-height: 1.15;
			color: var(--fg-66);
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
			/* Body already has 14px side inset — don’t double-pad */
			padding: 8px 0 0;
			gap: 10px;
		}

		/* Empty space on the side the chevron does not point toward */
		.chrome-btn.chev-back :global(svg) {
			padding-right: 2px;
			box-sizing: content-box;
		}

		/* Keep equal-width side slots so the title stays optically centered */
		.mobile-bar > .chrome-btn,
		.mobile-bar > .menu-spacer {
			width: 44px;
			flex-shrink: 0;
		}

		.desktop-head,
		.desktop-empty,
		:global(.detail .desktop-head),
		:global(.detail .desktop-empty) {
			display: none;
		}

		/* Side inset matches mobile-bar horizontal padding (14px) */
		.body,
		:global(.detail > .body) {
			padding: calc(56px + env(safe-area-inset-top, 0px)) 14px
				calc(24px + env(safe-area-inset-bottom, 0px));
		}

		/* Player feed scrolls under the mobile bar — pad inside PlayerDetail.feed */
		.body.player-body {
			padding-top: 0;
			padding-bottom: 0;
		}
	}
</style>
