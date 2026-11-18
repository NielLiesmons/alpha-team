<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import ProjectBox from './ProjectBox.svelte';
	import EnterpriseBox from './EnterpriseBox.svelte';
	import TaskBox from './TaskBox.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import DetailMetaPills from './DetailMetaPills.svelte';
	import DropdownMenu from './DropdownMenu.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import TaskFieldPicker from './TaskFieldPicker.svelte';
	import ArrowRight from './icons/ArrowRight.svelte';
	import Junk from './icons/Junk.svelte';
	import MailUnread from './icons/MailUnread.svelte';
	import Pen from './icons/Pen.svelte';
	import Reply from './icons/Reply.svelte';
	import ReplyAll from './icons/ReplyAll.svelte';
	import Share from './icons/Share.svelte';
	import Trash from './icons/Trash.svelte';
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';
	import {
		campaigns,
		mailSettings,
		persistDeleteCampaign,
		persistDeletePost,
		persistSendCampaign,
		publicPosts
	} from '$lib/publications.svelte.js';
	import {
		findMailOrTip,
		mailAuthorLabel,
		mailCategoryFor,
		mailComposeSeed,
		markMailRead,
		markMailUnread,
		moveMailThreadLocal,
		refreshMailForStubOnce,
		rememberMailTip,
		threadMessages
	} from '$lib/mail.svelte.js';
	import { isCategorizedContact } from '$lib/mail-contacts.svelte.js';
	import MailContactTriage from './MailContactTriage.svelte';
	import MailThreadFeed from './MailThreadFeed.svelte';
	import {
		projectLifecycle,
		primaryEnterpriseId,
		projectDisplayIcon
	} from '$lib/project-status.js';
	import { renderInlineLinks } from '$lib/note-text.js';
	import { accountingBrowse } from '$lib/accounting.svelte.js';
	import AccountingDetail from './AccountingDetail.svelte';
	import ChatActivity from './ChatActivity.svelte';
	import ChatChannelPanel from './ChatChannelPanel.svelte';
	import CommentThread from './CommentThread.svelte';
	import FilesFolderDetail from './FilesFolderDetail.svelte';
	import FormDetail from './FormDetail.svelte';
	import WebsiteActivity from './WebsiteActivity.svelte';
	import SettingsSectionDetail from './SettingsSectionDetail.svelte';
	import { channelById, loadComments } from '$lib/chat.svelte.js';
	import {
		fileDisplayTitle,
		fileTypeColors,
		folderDisplayTitle,
		splitFileTitle
	} from '$lib/file-display.js';
	import { filesView, isFilesFolderPath } from '$lib/files-view.svelte.js';
	import { settingsUi } from '$lib/settings-ui.svelte.js';
	import { space } from '$lib/sections.js';
	import MetricDetail from './MetricDetail.svelte';
	import TableDetail from './TableDetail.svelte';
	import ViewDetail from './ViewDetail.svelte';
	import PullToRefresh from './PullToRefresh.svelte';
	import ChromeActionButton from '@alpha/ui/ChromeActionButton.svelte';
	import ChromeMobileBar from '@alpha/ui/ChromeMobileBar.svelte';
	import Adjust from './icons/Adjust.svelte';
	import MoreDots from './icons/MoreDots.svelte';
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
	const chatNotifsOpen = $derived(
		selection?.kind === 'chat' && String(selection.id) === 'notifications'
	);
	const chatChannelId = $derived(
		selection?.kind === 'chat' && String(selection.id) !== 'notifications'
			? String(selection.id)
			: null
	);
	const filePath = $derived(selection?.kind === 'file' ? String(selection.id) : '');
	const fileEntry = $derived.by(() => {
		if (!filePath) return null;
		const hit = filesView.entries.find((e) => e.path === filePath);
		const isFolder = isFilesFolderPath(filePath);
		const name = filePath.includes('/') ? filePath.slice(filePath.lastIndexOf('/') + 1) : filePath;
		return {
			path: filePath,
			name,
			kind: hit?.kind || (isFolder ? 'folder' : 'blob'),
			isFolder,
			display_name: hit?.display_name ?? null
		};
	});
	const fileTitle = $derived(
		fileEntry
			? fileEntry.isFolder
				? folderDisplayTitle(fileEntry)
				: fileDisplayTitle(fileEntry)
			: ''
	);
	const fileParts = $derived(splitFileTitle(fileTitle, { isFolder: Boolean(fileEntry?.isFolder) }));
	const fileColors = $derived(
		fileEntry && !fileEntry.isFolder ? fileTypeColors(fileParts.ext || 'file') : null
	);
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
	const pubsHub = $derived(selection?.kind === 'pubs' && selection?.id === 'hub');
	const pubsActivity = $derived(selection?.kind === 'pubs' && selection?.id === 'activity');
	const mailMsg = $derived(selection?.kind === 'mail' ? findMailOrTip(selection.id) : null);
	const settingsSectionId = $derived(
		selection?.kind === 'settings' ? String(selection.id || '') : ''
	);
	const settingsTitles = $derived.by(() => {
		locale.value;
		return /** @type {Record<string, string>} */ ({
			profile: t('settings.profile'),
			notifications: t('settings.notifications'),
			appearance: t('settings.appearance'),
			storage: t('settings.storage'),
			mail: t('settings.mail'),
			publications: t('settings.publications'),
			drive: t('settings.files'),
			file: t('settings.files')
		});
	});

	/** Only auto-mark-read once per opened thread id (avoids fighting mark-unread). */
	let autoReadMailId = $state('');

	$effect(() => {
		const id = mailMsg?.id;
		if (!id) {
			autoReadMailId = '';
			return;
		}
		if (mailMsg?._stub) {
			refreshMailForStubOnce(id);
			return;
		}
		rememberMailTip(mailMsg);
		if (id !== autoReadMailId) {
			autoReadMailId = id;
			void markMailRead(id);
		}
		void loadComments('mail', id).catch(() => {});
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
			task ||
				project ||
				note ||
				enterprise ||
				dataTable ||
				metricDoc ||
				viewDoc ||
				newsletter ||
				pubPost ||
				fileEntry
		)
	);
	const showMoreMenu = $derived(
		Boolean(canDelete || canShare || canComposerEdit || mailMsg)
	);

	const typeLabel = $derived.by(() => {
		locale.value;
		if (task) return t('tasks.task');
		if (project) return t('projects.project');
		if (note) return t('notes.note');
		if (ledger) return t('acc.ledger');
		if (costItem) return t('detail.cost');
		if (salesLine) return t('acc.sales');
		if (viewDoc) return t('detail.view');
		if (dataTable) return t('detail.table');
		if (metricDoc) return t('detail.metric');
		if (formDoc) return t('detail.form');
		if (enterprise) return t('nav.enterprise');
		if (accountingPanel) return t('nav.entreprises');
		if (newsletter) return t('pub.letter');
		if (pubPost) {
			const k = String(pubPost.kind || 'blog');
			if (k === 'event') return t('pub.event');
			if (k === 'post') return t('pub.post');
			return t('pub.blog');
		}
		if (welcomeSelected) return t('detail.welcome');
		if (pubsActivity) return t('web.activityTitle');
		if (pubsHub) return t('nav.publications');
		if (mailMsg) return t('mail.thread');
		if (chatNotifsOpen) return t('chat.activityTitle');
		if (chatChannel) return chatChannel.title || t('chat.channel');
		if (fileEntry?.isFolder) return t('drive.folder');
		if (fileEntry) return t('drive.file');
		if (settingsSectionId) return settingsTitles[settingsSectionId] || t('nav.settings');
		return 'Detail';
	});

	/** Centered mobile detail title (entity name when available). */
	const mobileTitle = $derived.by(() => {
		locale.value;
		if (task?.title) return task.title;
		if (project?.title) return project.title;
		if (note?.title) return note.title;
		if (ledger) return ledger.memo || ledger.account_title || t('detail.entry');
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
		if (welcomeSelected) return t('detail.welcome');
		if (pubsActivity) return t('web.activityTitle');
		if (pubsHub) return t('nav.publications');
		/* Subject lives big in the thread body — chrome stays generic. */
		if (mailMsg) return t('mail.thread');
		if (chatNotifsOpen) return t('chat.activityTitle');
		if (chatChannel) return chatChannel.title || t('chat.general');
		if (fileEntry) return fileTitle;
		if (settingsSectionId) return settingsTitles[settingsSectionId] || t('nav.settings');
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
				pubsActivity ||
				mailMsg ||
				chatChannel ||
				chatNotifsOpen ||
				fileEntry ||
				settingsSectionId
		)
	);

	const emptyCopy = $derived.by(() => {
		locale.value;
		const path = $page.url.pathname;
		if (path.startsWith('/tasks')) return { title: t('tasks.noSelected'), body: t('detail.pickTask') };
		if (path.startsWith('/projects')) return { title: 'No project selected', body: t('detail.pickProject') };
		if (path.startsWith('/notes')) return { title: t('notes.noSelected'), body: t('detail.pickNote') };
		if (path.startsWith('/entreprises') || path.startsWith('/accounting'))
			return {
				title: t('ent.noEntrySelected'),
				body: t('detail.pickEnterprise')
			};
		if (path.startsWith('/publications') || path.startsWith('/website'))
			return {
				title: path.startsWith('/website') ? t('detail.noSection') : t('nav.publications'),
				body: path.startsWith('/website')
					? t('detail.pickPublication')
					: 'Open the hub — Blog letters mail subscribers and appear on the site.'
			};
		if (path.startsWith('/mail'))
			return {
				title: t('mail.noMessageSelected'),
				body: t('mail.pickMessage')
			};
		if (path.startsWith('/chat'))
			return {
				title: t('chat.activityTitle'),
				body: t('chat.activitySub')
			};
		if (path.startsWith('/drive'))
			return {
				title: t('drive.noSelected'),
				body: t('detail.pickFile')
			};
		if (path.startsWith('/settings'))
			return {
				title: t('nav.settings'),
				body: t('detail.pickSettings')
			};
		return { title: t('detail.nothingOpen'), body: 'Select a task, project, note, mail, or chat to view it here.' };
	});

	let sendBusy = $state(false);

	async function sendSelectedNewsletter() {
		if (!newsletter || newsletter.status === 'sent') return;
		if (
			!confirm(t('pub.publishConfirm'))
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
		const title = draftTitle.trim() || t('common.untitled');
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
			return;
		}
	}

	/** @param {'reply' | 'replyAll' | 'forward'} mode */
	function mailAction(mode) {
		menuOpen = false;
		if (!mailMsg) return;
		const seed = mailComposeSeed(mailMsg, mode);
		openComposer('mail', `act:${mode}:${mailMsg.id}`, undefined, seed);
	}

	function mailMarkUnread() {
		menuOpen = false;
		if (!mailMsg?.id) return;
		const id = mailMsg.id;
		autoReadMailId = '';
		void markMailUnread(id);
		/* Leave the thread so the open-effect cannot immediately re-mark read. */
		forceClearSelection();
	}

	/** @param {'junk' | 'trash'} folder */
	function mailMove(folder) {
		menuOpen = false;
		if (!mailMsg?.id) return;
		moveMailThreadLocal(mailMsg.id, folder);
		forceClearSelection();
	}

	async function shareCurrent() {
		menuOpen = false;
		if (fileEntry) {
			const path = filePath || fileEntry.path;
			if (!path) return;
			try {
				await navigator.clipboard.writeText(path);
			} catch {
				window.prompt(t('drive.copyPath'), path);
			}
			return;
		}
		const base = typeof window !== 'undefined' ? window.location.origin : '';
		const slug = newsletter?.post_slug || pubPost?.slug;
		const siteBase = String(space.siteUrl || '').replace(/\/$/, '');
		const site = slug && siteBase ? `${siteBase}/publications/${slug}` : '';
		const url = site || (typeof window !== 'undefined' ? window.location.href : '') || base;
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			window.prompt(t('invite.copyLink'), url);
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
				if (!confirm(t('pub.deletePublication'))) return;
				try {
					await persistDeletePost(slug);
					forceClearSelection();
				} catch (e) {
					alert(e instanceof Error ? e.message : String(e));
				}
				return;
			}
			if (!confirm(t('pub.deleteLetter'))) return;
			try {
				await persistDeleteCampaign(id);
				forceClearSelection();
			} catch (e) {
				alert(e instanceof Error ? e.message : String(e));
			}
			return;
		}
		if (kind !== 'task' && kind !== 'project' && kind !== 'note' && kind !== 'enterprise') return;
		const confirmText =
			kind === 'task'
				? t('common.deleteConfirm', { label: t('tasks.task').toLowerCase() })
				: kind === 'project'
					? t('common.deleteConfirm', { label: t('projects.project').toLowerCase() })
					: kind === 'note'
						? t('common.deleteConfirm', { label: t('notes.note').toLowerCase() })
						: t('ent.deleteConfirm');
		if (!confirm(confirmText)) return;
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
		/* Chat feed lives in the list column — don't reopen it as a detail pane. */
	}

	/** Keep body mounted through the mobile slide-out so the panel doesn’t blank mid-transition. */
	let renderBody = $state(false);
	let panelOpen = $state(false);
	/** For-you activity filter (Chat 3rd column). */
	let activityFilter = $state(/** @type {'all' | 'reaction' | 'reply' | 'assigned'} */ ('all'));

	const activityFilterOptions = $derived.by(() => {
		locale.value;
		/** @type {{ id: 'all' | 'reaction' | 'reply' | 'assigned', label: string }[]} */
		return [
			{ id: 'all', label: t('filter.all') },
			{ id: 'reaction', label: t('chat.activityFilterReactions') },
			{ id: 'reply', label: t('chat.activityFilterReplies') },
			{ id: 'assigned', label: t('chat.activityFilterAssigned') }
		];
	});

	function openPushPrefs() {
		selectEntity('settings', 'notifications');
	}
	/** 0..1 while edge-swiping back; null when idle. Drives list underlay in UiShell. */
	let detailDrag = $state(/** @type {number | null} */ (null));

	const detailProgress = $derived(detailDrag != null ? detailDrag : panelOpen ? 1 : 0);

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
		detailDrag = null;
		const mobile =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
		if (!mobile) {
			renderBody = false;
			return;
		}
		const t = setTimeout(() => {
			renderBody = false;
		}, 400);
		return () => clearTimeout(t);
	});

	/* Publish progress to the workspace so the list underlay moves in lockstep. */
	$effect(() => {
		const el = detailRoot;
		if (!el || typeof window === 'undefined') return;
		const ws = el.closest('.workspace');
		if (!(ws instanceof HTMLElement)) return;
		const p = detailProgress;
		ws.style.setProperty('--detail-progress', String(p));
		ws.classList.toggle('detail-dragging', detailDrag != null);
		return () => {
			if (detailDrag == null && !panelOpen) {
				ws.style.setProperty('--detail-progress', '0');
				ws.classList.remove('detail-dragging');
			}
		};
	});

	/* iOS-like edge swipe-back: detail + list underlay track the finger. */
	$effect(() => {
		const el = detailRoot;
		const isOpen = panelOpen;
		if (!el || typeof window === 'undefined' || !isOpen) return;

		const EDGE = 28;
		const CLAIM = 10;
		const SPAN = Math.min(320, window.innerWidth * 0.55);

		let startX = 0;
		let startY = 0;
		let tracking = false;
		let claimed = false;

		function mobile() {
			return window.matchMedia('(max-width: 767px)').matches;
		}

		/** @param {TouchEvent} e */
		function onStart(e) {
			if (!mobile() || e.touches.length !== 1) return;
			const touch = e.touches[0];
			if (touch.clientX > EDGE) return;
			const t = e.target;
			if (
				t instanceof Element &&
				t.closest(
					'input, textarea, select, [contenteditable="true"], [data-no-detail-swipe]'
				)
			) {
				return;
			}
			startX = touch.clientX;
			startY = touch.clientY;
			tracking = true;
			claimed = false;
		}

		/** @param {TouchEvent} e */
		function onMove(e) {
			if (!tracking || e.touches.length !== 1) return;
			const touch = e.touches[0];
			const dx = touch.clientX - startX;
			const dy = touch.clientY - startY;
			if (!claimed) {
				if (Math.abs(dx) < CLAIM && Math.abs(dy) < CLAIM) return;
				if (Math.abs(dy) > Math.abs(dx) * 0.85 || dx < 0) {
					tracking = false;
					detailDrag = null;
					return;
				}
				claimed = true;
			}
			e.preventDefault();
			detailDrag = Math.max(0, Math.min(1, 1 - dx / SPAN));
		}

		function onEnd() {
			if (!tracking) return;
			const p = detailDrag;
			const wasClaimed = claimed;
			tracking = false;
			claimed = false;
			if (!wasClaimed || p == null) {
				detailDrag = null;
				return;
			}
			const shouldClose = p < 0.68;
			detailDrag = null;
			if (shouldClose) close();
			else {
				/* Snap back open — progress returns to 1 via panelOpen. */
			}
		}

		el.addEventListener('touchstart', onStart, { passive: true });
		el.addEventListener('touchmove', onMove, { passive: false });
		el.addEventListener('touchend', onEnd);
		el.addEventListener('touchcancel', onEnd);
		return () => {
			el.removeEventListener('touchstart', onStart);
			el.removeEventListener('touchmove', onMove);
			el.removeEventListener('touchend', onEnd);
			el.removeEventListener('touchcancel', onEnd);
		};
	});
</script>

<aside
	class="detail"
	class:open={panelOpen}
	class:empty={!renderBody}
	class:dragging={detailDrag != null}
	aria-label="Detail"
	bind:this={detailRoot}
	style="--chrome-scroll-fade: {detailFade}; --detail-progress: {detailProgress}"
	class:titles-syncing={syncUi.active}
	aria-busy={syncUi.active || undefined}
>
	{#if renderBody}
		{@const mailContactEmail = mailMsg ? String(mailMsg.from || '').toLowerCase() : ''}
		{@const mailNeedsTriage =
			Boolean(mailMsg) &&
			Boolean(mailContactEmail) &&
			!isCategorizedContact(mailContactEmail) &&
			mailCategoryFor(mailMsg) === 'new'}
		{#if showMoreMenu || mailNeedsTriage}
			<ChromeMobileBar title={mobileTitle || typeLabel} onBack={close}>
				{#snippet trailing()}
					{#if mailNeedsTriage}
						<MailContactTriage email={mailContactEmail} thread={mailMsg} compact />
					{/if}
					{#if showMoreMenu}
						<ChromeActionButton
							variant="more"
							label={t('common.more')}
							expanded={menuOpen}
							onclick={toggleMoreMenu}
						/>
					{/if}
				{/snippet}
			</ChromeMobileBar>
		{:else}
			<ChromeMobileBar title={mobileTitle || typeLabel} onBack={close} />
		{/if}

		<DropdownMenu
			open={menuOpen}
			anchor={menuAnchor}
			placement="below"
			align="end"
			width={mailMsg ? 220 : 200}
			maxHeight={mailMsg ? 360 : 280}
			onclose={() => (menuOpen = false)}
		>
			<div class="dropdown-list" role="menu">
				{#if mailMsg}
					<button type="button" class="dropdown-item" role="menuitem" onclick={() => mailAction('reply')}>
						<Reply size={14} />
						<span>{t('mail.reply')}</span>
					</button>
					<button type="button" class="dropdown-item" role="menuitem" onclick={() => mailAction('replyAll')}>
						<ReplyAll size={14} />
						<span>{t('mail.replyAll')}</span>
					</button>
					<button type="button" class="dropdown-item" role="menuitem" onclick={() => mailAction('forward')}>
						<ArrowRight size={14} strokeWidth={1.45} />
						<span>{t('mail.forward')}</span>
					</button>
					<button type="button" class="dropdown-item" role="menuitem" onclick={mailMarkUnread}>
						<MailUnread size={14} />
						<span>{t('mail.markUnread')}</span>
					</button>
					<button type="button" class="dropdown-item" role="menuitem" onclick={() => mailMove('junk')}>
						<Junk size={14} />
						<span>{t('mail.moveToJunk')}</span>
					</button>
					<button
						type="button"
						class="dropdown-item danger"
						role="menuitem"
						onclick={() => mailMove('trash')}
					>
						<Trash size={15} />
						<span>{t('mail.moveToTrash')}</span>
					</button>
				{:else}
					{#if canShare}
						<button type="button" class="dropdown-item" role="menuitem" onclick={() => void shareCurrent()}>
							<Share size={14} />
							<span>{fileEntry ? t('drive.copyPath') : t('common.share')}</span>
						</button>
					{/if}
					{#if canComposerEdit}
						<button type="button" class="dropdown-item" role="menuitem" onclick={editCurrent}>
							<Pen size={13} />
							<span>{t('common.edit')}</span>
						</button>
					{/if}
					{#if canDelete}
						<button type="button" class="dropdown-item danger" role="menuitem" onclick={deleteCurrent}>
							<Trash size={15} />
							<span>{t('common.delete')}</span>
						</button>
					{/if}
				{/if}
			</div>
		</DropdownMenu>

	{#key `${selection?.kind ?? 'none'}:${selection?.id ?? 'none'}`}
	<div class="detail-page">
	<PullToRefresh onRefresh={() => refreshAllDrive()}>
	{#if task}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('tasks.task')}</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">{t('common.saving')}</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
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
					aria-label={t('detail.ariaTaskTitle')}
					placeholder={t('common.untitled')}
					oninput={scheduleDraftSave}
				/>
				<span class="title-priority">
					<TaskFieldPicker
						taskId={task.id}
						field="priority"
						value={task.priority ?? 'none'}
						size={26}
						align="right"
					/>
				</span>
			</div>
			<DetailMetaPills entity={task} kind="task" />
			<textarea
				class="body-input"
				bind:value={draftBody}
				aria-label={t('detail.ariaTaskDesc')}
				placeholder={t('tasks.addDescription')}
				rows="3"
				oninput={scheduleDraftSave}
			></textarea>
		</div>
		<CommentThread
			type="task"
			entityId={task.id}
			tip={{ title: String(task.title || '').trim() || t('nav.tasks'), status: task.status }}
			onMore={toggleMoreMenu}
		/>
	{:else if project}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('projects.project')}</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">{t('common.saving')}</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
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
					aria-label={t('detail.ariaProjectTitle')}
					placeholder={t('common.untitled')}
					oninput={scheduleDraftSave}
				/>
			</div>
			<textarea
				class="body-input body-input-hug"
				bind:this={descEl}
				bind:value={draftBody}
				aria-label={t('detail.ariaProjectDesc')}
				placeholder={t('tasks.addDescription')}
				rows="1"
				oninput={(e) => {
					hugDescription(/** @type {HTMLTextAreaElement} */ (e.currentTarget));
					scheduleDraftSave();
				}}
			></textarea>

			<div class="detail-grid">
				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('tasks.title')}</span>
						<span class="grid-count">{projectTasks.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('projects.addTask')}
							onclick={() => openComposer('task', undefined, 'open')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if projectTasks.length === 0}
						<p class="muted tight">{t('projects.noTasks')}.</p>
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
					<button type="button" class="view-all-fab" onclick={() => viewAll('/tasks')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('notes.title')}</span>
						<span class="grid-count">{projectNotes.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('projects.addNote')}
							onclick={() => openComposer('note')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if projectNotes.length === 0}
						<p class="muted tight">{t('projects.noNotes')}.</p>
					{:else}
						<ul class="linked-list">
							{#each projectNotes.slice(0, BENTO_PREVIEW) as n (n.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('note', n.id)}>
										<span class="linked-title">{n.title || t('common.untitled')}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/notes')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('drive.title')}</span>
						<span class="grid-count">0</span>
						<button type="button" class="proj-add" aria-label={t('projects.addFile')} disabled>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					<p class="muted tight">{t('projects.noFiles')}.</p>
				</section>
			</div>
		</div>
		<CommentThread
			type="project"
			entityId={project.id}
			tip={{
				title: String(project.title || project.name || '').trim() || t('nav.projects'),
				projectState: project.status || 'active',
				projectIcon: project.icon
			}}
			onMore={toggleMoreMenu}
		/>
	{:else if note}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('notes.note')}</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">{t('common.saving')}</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
					</button>
				{/if}
			</div>
		</header>
		<div class="body note-body-wrap">
			<div class="title-row">
				<input
					class="title-input"
					bind:value={draftTitle}
					aria-label={t('detail.ariaNoteTitle')}
					placeholder={t('common.untitled')}
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
		<CommentThread
			type="note"
			entityId={note.id}
			tip={{ title: String(note.title || '').trim() || t('nav.notes') }}
			onMore={toggleMoreMenu}
		/>
	{:else if pubsActivity}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('web.activityTitle')}</span>
			</div>
		</header>
		<div class="body">
			<WebsiteActivity />
		</div>
	{:else if pubsHub}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('nav.publications')}</span>
			</div>
		</header>
		<div class="body">
			<p class="hint-pad">{t('web.pubsPreview')}</p>
		</div>
	{:else if welcomeSelected}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('detail.welcome')}</span>
			</div>
			<div class="detail-top-actions">
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			<p class="pub-kicker">{mailSettings.welcome.enabled ? t('pub.onForSubscribers') : t('pub.off')}</p>
			<h2 class="pub-title">{mailSettings.welcome.subject_fr || 'Welcome'}</h2>
			<pre class="pub-body">{mailSettings.welcome.body_fr}</pre>
		</div>
	{:else if newsletter || pubPost}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<button type="button" class="send-chip" onclick={editCurrent}>{t('common.edit')}</button>
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
					</button>
				{/if}
			</div>
		</header>
		<div class="body">
			{#if newsletter}
				<p class="pub-kicker">
					{newsletter.status}{#if newsletter.sent_count}
						· {t('pub.sentCount', { n: newsletter.sent_count })}{/if}{#if newsletter.post_slug}
						· {t('pub.onSite')}{/if}
				</p>
				<h2 class="pub-title">{newsletter.subject}</h2>
				{#if newsletter.description}
					<p class="pub-summary">{newsletter.description}</p>
				{/if}
				{#if newsletter.image_url}
					<img class="pub-cover" src={newsletter.image_url} alt="" />
				{/if}
				<pre class="pub-body">{newsletter.body}</pre>
			{:else if pubPost}
				<p class="pub-kicker">
					{pubPost.kind || 'blog'}{#if pubPost.updated_at}
						· {t('pub.edited')}{/if}{#if pubPost.slug}
						· /{pubPost.slug}{/if}
				</p>
				<h2 class="pub-title">{pubPost.title}</h2>
				{#if pubPost.summary}
					<pre class="pub-body">{pubPost.summary}</pre>
				{/if}
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
		{@const contactEmail = String(mailMsg.from || '').toLowerCase()}
		{@const needsTriage =
			contactEmail &&
			mailCategoryFor(mailMsg) === 'new' &&
			!isCategorizedContact(contactEmail)}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('mail.thread')}</span>
			</div>
			<div class="detail-top-actions">
				{#if needsTriage}
					<MailContactTriage email={contactEmail} thread={mailMsg} />
				{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
					</button>
				{/if}
			</div>
		</header>
		<div class="body mail-thread-body">
			<MailThreadFeed {mailMsg} {replyTo} {menuOpen} onMore={toggleMoreMenu} />
		</div>
		<CommentThread
			type="mail"
			entityId={mailMsg.id}
			tip={{
				title: String(mailMsg.subject || '').trim() || '(no subject)',
				subject: String(mailMsg.subject || '').trim() || '(no subject)',
				from: String(mailMsg.from || '')
					.trim()
					.toLowerCase(),
				from_name: mailAuthorLabel(mailMsg) || ''
			}}
			onMore={toggleMoreMenu}
		/>
	{:else if settingsSectionId}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{settingsTitles[settingsSectionId] || t('nav.settings')}</span>
			</div>
			<div class="detail-top-actions"></div>
		</header>
		<div class="body settings-section-body">
			<SettingsSectionDetail
				sectionId={settingsSectionId}
				profileEmail={settingsSectionId === 'profile' ? settingsUi.profileTargetEmail : ''}
			/>
		</div>
	{:else if chatNotifsOpen}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('chat.activityTitle')}</span>
			</div>
			<div class="detail-top-actions">
				<div class="activity-filter" role="group" aria-label={t('chat.activityFilter')}>
					{#each activityFilterOptions as opt (opt.id)}
						<button
							type="button"
							class:on={activityFilter === opt.id}
							onclick={() => (activityFilter = opt.id)}>{opt.label}</button
						>
					{/each}
				</div>
				<button
					type="button"
					class="icon-hit"
					aria-label={t('chat.activityPushPrefs')}
					onclick={openPushPrefs}
				>
					<Adjust size={15} />
				</button>
			</div>
		</header>
		<div class="body chat-activity-body">
			<ChatActivity filter={activityFilter} embedded />
		</div>
	{:else if chatChannel}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{chatChannel.title || t('chat.general')}</span>
			</div>
			<div class="detail-top-actions"></div>
		</header>
		<div class="body chat-channel-body">
			<ChatChannelPanel channelId={chatChannel.id} />
		</div>
	{:else if fileEntry?.isFolder}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('drive.folder')}</span>
			</div>
			<div class="detail-top-actions">
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
					</button>
				{/if}
			</div>
		</header>
		<div class="body files-folder-body">
			<FilesFolderDetail folderPath={filePath} entries={filesView.entries} title={fileTitle} />
		</div>
	{:else if fileEntry}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('drive.file')}</span>
			</div>
			<div class="detail-top-actions">
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
					</button>
				{/if}
			</div>
		</header>
		<div class="body file-detail-body">
			<div class="file-hero">
				<span
					class="file-type-box"
					style:color={fileColors?.ink}
					style:background={fileColors?.wash}
					aria-hidden="true">{fileParts.label || 'FILE'}</span
				>
				<h2 class="file-title"
					><span class="file-stem">{fileParts.stem}</span
					>{#if fileParts.ext}<span class="file-ext">.{fileParts.ext}</span>{/if}</h2
				>
			</div>
			<p class="muted">{t('drive.encryptedHint')}</p>
		</div>
	{:else if accountingPanel}
		<AccountingDetail />
	{:else if ledger}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('acc.ledger')}</span>
			</div>
		</header>
		<div class="body">
			<p class="pub-kicker">
				{ledger.direction === 'in' ? t('acc.income') : t('acc.expense')}
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
					{t('acc.projectsLabel')} {ledger.targets.map((/** @type {{ label: string }} */ t) => t.label).join(', ')}
				</p>
			{/if}
		</div>
	{:else if costItem}
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('detail.cost')}</span>
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
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('acc.sales')}</span>
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
				<button type="button" class="icon-hit" aria-label={t('common.back')} onclick={close}>
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
				<span class="detail-top-label">{t('nav.enterprise')}</span>
			</div>
			<div class="detail-top-actions">
				{#if draftSaving}<span class="save-hint">{t('common.saving')}</span>{/if}
				{#if showMoreMenu}
					<button
						type="button"
						class="icon-hit more-desktop"
						aria-label={t('common.more')}
						aria-expanded={menuOpen}
						onclick={toggleMoreMenu}
					>
						<MoreDots size={15} />
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
					aria-label={t('detail.ariaEntTitle')}
					placeholder={t('common.untitled')}
					oninput={scheduleDraftSave}
				/>
			</div>
			<textarea
				class="body-input body-input-hug"
				bind:this={descEl}
				bind:value={draftBody}
				aria-label={t('detail.ariaEntDesc')}
				placeholder={t('tasks.addDescription')}
				rows="1"
				oninput={(e) => {
					hugDescription(/** @type {HTMLTextAreaElement} */ (e.currentTarget));
					scheduleDraftSave();
				}}
			></textarea>

			<div class="detail-grid">
				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('ent.views')}</span>
						<span class="grid-count">{enterpriseViews.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('ent.addView')}
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
						<p class="muted tight">{t('detail.noViews')}</p>
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
					<button type="button" class="view-all-fab" onclick={() => viewAll('/entreprises')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('ent.tables')}</span>
						<span class="grid-count">{enterpriseTables.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('ent.addTable')}
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
						<p class="muted tight">{t('detail.noTables')}</p>
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
					<button type="button" class="view-all-fab" onclick={() => viewAll('/entreprises')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('ent.metrics')}</span>
						<span class="grid-count">{enterpriseMetrics.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('ent.addMetric')}
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
						<p class="muted tight">{t('detail.noMetrics')}</p>
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
					<button type="button" class="view-all-fab" onclick={() => viewAll('/entreprises')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('ent.projects')}</span>
						<span class="grid-count">{enterpriseProjects.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('ent.addProject')}
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
						<p class="muted tight">{t('meta.noProjects')}.</p>
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
					<button type="button" class="view-all-fab" onclick={() => viewAll('/projects')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('tasks.title')}</span>
						<span class="grid-count">{enterpriseTasks.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('projects.addTask')}
							onclick={() => openComposer('task', undefined, 'open')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseTasks.length === 0}
						<p class="muted tight">{t('projects.noTasks')}.</p>
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
					<button type="button" class="view-all-fab" onclick={() => viewAll('/tasks')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('notes.title')}</span>
						<span class="grid-count">{enterpriseNotes.length}</span>
						<button
							type="button"
							class="proj-add"
							aria-label={t('projects.addNote')}
							onclick={() => openComposer('note')}
						>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					{#if enterpriseNotes.length === 0}
						<p class="muted tight">{t('projects.noNotes')}.</p>
					{:else}
						<ul class="linked-list">
							{#each enterpriseNotes.slice(0, BENTO_PREVIEW) as n (n.id)}
								<li>
									<button type="button" class="linked-row" onclick={() => selectEntity('note', n.id)}>
										<span class="linked-title">{n.title || t('common.untitled')}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<button type="button" class="view-all-fab" onclick={() => viewAll('/notes')}>{t('common.viewAll')}</button>
				</section>

				<section class="grid-cell">
					<div class="grid-head">
						<span class="eyebrow-label-xs">{t('drive.title')}</span>
						<span class="grid-count">0</span>
						<button type="button" class="proj-add" aria-label={t('projects.addFile')} disabled>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					<p class="muted tight">{t('projects.noFiles')}.</p>
				</section>
			</div>
		</div>
	{/if}
	</PullToRefresh>
	</div>
	{/key}
{:else if $page.url.pathname.startsWith('/chat')}
	<div class="detail-page chat-home">
		<header class="detail-top desktop-head">
			<div class="detail-top-start">
				<span class="detail-top-label">{t('chat.activityTitle')}</span>
			</div>
			<div class="detail-top-actions">
				<div class="activity-filter" role="group" aria-label={t('chat.activityFilter')}>
					{#each activityFilterOptions as opt (opt.id)}
						<button
							type="button"
							class:on={activityFilter === opt.id}
							onclick={() => (activityFilter = opt.id)}>{opt.label}</button
						>
					{/each}
				</div>
				<button
					type="button"
					class="icon-hit"
					aria-label={t('chat.activityPushPrefs')}
					onclick={openPushPrefs}
				>
					<Adjust size={15} />
				</button>
			</div>
		</header>
		<div class="body chat-activity-body">
			<ChatActivity filter={activityFilter} embedded />
		</div>
	</div>
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

	.pub-summary {
		margin: 0 0 12px;
		font-size: 14px;
		line-height: 1.4;
		color: var(--fg-66);
	}

	.pub-cover {
		display: block;
		width: 100%;
		max-height: 220px;
		object-fit: cover;
		border-radius: 12px;
		margin: 0 0 14px;
		background: var(--fg-8);
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

	/* Match chat-channel-body: no top pad here — feed scrolls under detail-top */
	.body.mail-thread-body {
		overflow: hidden;
		/* Same top clear as Task .body (56px) so title row sits under the fade alike */
		padding: 56px 24px 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	@media (max-width: 767px) {
		.body.mail-thread-body {
			padding: 56px 14px 0;
		}
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
		align-items: center;
	}

	.task-title-row .title {
		flex: 1;
		min-width: 0;
	}

	.task-title-row .title-priority {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 0;
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

	.body.editor-body {
		overflow: hidden;
		padding: 48px 0 0;
	}

	.hint-pad {
		margin: 24px 16px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--fg-33);
		text-align: center;
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

	.body.files-folder-body {
		overflow: auto;
		padding: 56px 24px 32px;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.body.file-detail-body {
		padding: 56px 24px 32px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.file-hero {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}

	.file-type-box {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.file-title {
		margin: 0;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.02em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-stem {
		color: var(--fg);
	}

	.file-ext {
		color: var(--fg-33);
		font-weight: 500;
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

	/* Hairline border grid — full-bleed vs .body 24px; edge cells own outer pad. */
	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0;
		margin: 12px -24px 0;
		padding: 0;
		border-top: 1px solid var(--fg-8);
		box-sizing: border-box;
	}

	.grid-cell {
		position: relative;
		min-width: 0;
		min-height: 168px;
		padding: 12px 14px 16px;
		border-right: 1px solid var(--fg-8);
		border-bottom: 1px solid var(--fg-8);
		background: transparent;
		border-radius: 0;
		box-sizing: border-box;
	}

	.grid-cell:nth-child(odd) {
		padding-left: 24px;
	}

	.grid-cell:nth-child(even) {
		padding-right: 24px;
		border-right: 0;
	}

	/* Lone trailing cell spans full width */
	.grid-cell:last-child:nth-child(odd) {
		grid-column: 1 / -1;
		padding-right: 24px;
		border-right: 0;
	}

	/* Overlay FAB — floats on cell; clearance via last-row pad. */
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

	.grid-cell:nth-child(even) .view-all-fab {
		right: 18px;
	}

	.view-all-fab:hover,
	.view-all-fab:focus-visible {
		color: var(--fg-66);
		background: color-mix(in srgb, var(--bg) 92%, transparent);
	}

	/* Keep last list row / empty line clear of the View all FAB. */
	.grid-cell .linked-list > li:last-child .linked-row,
	.grid-cell > .muted.tight {
		padding-right: 5.75rem;
		box-sizing: border-box;
	}

	.grid-head {
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

	.grid-count {
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

	.detail-page {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.body.chat-activity-body {
		overflow: auto;
		width: 100%;
		box-sizing: border-box;
		/* Match chat channel / list density — no 56×24 hug padding. */
		padding: 8px 4px 20px;
	}

	.activity-filter {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 28px;
		padding: 2px;
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: 10px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		pointer-events: auto;
	}

	.activity-filter button {
		height: 100%;
		padding: 0 9px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		line-height: 1;
		white-space: nowrap;
	}

	.activity-filter button.on {
		background: var(--fg-8);
		color: var(--fg);
	}

	@media (min-width: 768px) {
		.detail-page {
			animation: detail-page-in 0.3s var(--ease) both;
		}

		@keyframes detail-page-in {
			from {
				opacity: 0;
				transform: translate3d(0, 8px, 0);
			}
			to {
				opacity: 1;
				transform: none;
			}
		}
	}

	@media (max-width: 767px) {
		.detail {
			position: fixed;
			inset: 0;
			z-index: 55;
			width: 100%;
			/* Match mobile shell (desktop sidebar) — stay mounted off-screen for slide */
			background: var(--shell);
			/* Progress 0 = off-screen right; 1 = fully covering. List underlay uses the same var. */
			transform: translate3d(calc((1 - var(--detail-progress, 0)) * 100%), 0, 0)
				scale(calc(1.02 - 0.02 * var(--detail-progress, 0)));
			transform-origin: right center;
			transition:
				transform 0.4s var(--ease),
				box-shadow 0.4s var(--ease);
			pointer-events: none;
			visibility: visible;
			box-shadow: -12px 0 40px
				color-mix(in srgb, var(--fg-raw, #000) calc(22% * var(--detail-progress, 0)), transparent);
			will-change: transform;
		}

		/* Full-bleed under glass bottom nav so the feed can blur through */
		.detail.player-mode {
			z-index: 35;
			bottom: 0;
		}

		.detail.open {
			pointer-events: auto;
		}

		.detail.dragging {
			transition: none;
		}

		/* Keep off-screen panel in the layer tree (no display:none — that kills slide) */
		.detail.empty {
			display: flex;
		}

		.title-row {
			padding-top: 10px;
		}

		.detail-grid {
			grid-template-columns: 1fr;
			margin: 8px 0 0;
			border-top: 1px solid var(--fg-8);
		}

		.grid-cell,
		.grid-cell:nth-child(odd),
		.grid-cell:nth-child(even) {
			padding: 12px 0 14px;
			border-right: 0;
			border-bottom: 1px solid var(--fg-8);
		}

		.grid-cell:nth-child(even) .view-all-fab,
		.view-all-fab {
			right: 0;
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

		.body.chat-activity-body {
			padding: calc(8px + env(safe-area-inset-top, 0px)) 4px
				calc(20px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
