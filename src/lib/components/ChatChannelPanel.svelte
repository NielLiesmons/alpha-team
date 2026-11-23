<script>
	import { onMount, tick, untrack } from 'svelte';
	import AlphaLogo from '$lib/components/icons/AlphaLogo.svelte';
	import ArrowDown from '$lib/components/icons/ArrowDown.svelte';
	import Voice from '$lib/components/icons/Voice.svelte';
	import ChatFeedCard from '$lib/components/ChatFeedCard.svelte';
	import ChatStatusLine from '$lib/components/ChatStatusLine.svelte';
	import ComposerSuggest from '$lib/components/ComposerSuggest.svelte';
	import EnterpriseBox from '$lib/components/EnterpriseBox.svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import ProjectBox from '$lib/components/ProjectBox.svelte';
	import TaskBox from '$lib/components/TaskBox.svelte';
	import TipTypeIcon from '$lib/components/TipTypeIcon.svelte';
	import { activePerson, asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		chatEphemeral,
		chatFeed,
		chatUi,
		chatPublicationRefKey,
		chatRefMeta,
		chatProjectBoxProps,
		chatStatusText,
		commentsByKey,
		commentsSettledByKey,
		findChatParent,
		hydrateChatFeedFromCache,
		isChatStatusEvent,
		loadComments,
		openChatRef,
		postChatMessage,
		refreshChatFeed,
		requestOpenComments,
		visibleChatMessages
	} from '$lib/chat.svelte.js';
	import { mailTipCache } from '$lib/mail.svelte.js';
	import { startChatTipPoll, stopChatTipPoll } from '$lib/chat-sync.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';
	import { chatStackFlags } from '$lib/chat-stack.js';
	import { compareChatMessageAsc } from '$lib/drive/entities.js';
	import { profileAccentCss, profileNameCss } from '$lib/color.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { putPath } from '$lib/drive/client.js';
	import { putMediaBlob } from '$lib/drive/media.js';
	import { inferMediaKind, mimeFromNameAndType } from '$lib/drive/media-kind.js';
	import {
		attachComposerClearPad,
		attachFeedPinResize,
		isFeedNearBottom,
		snapFeedToBottomSoon
	} from '$lib/feed-scroll.js';
	import { signalRecording, signalTyping } from '$lib/realtime.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import ChatComposer from '@alpha/ui/ChatComposer.svelte';

	/** @type {{ channelId?: string }} */
	let { channelId = 'general' } = $props();

	/* Sync before first paint — onMount is one frame too late (empty flash over cache). */
	hydrateChatFeedFromCache();

	let draft = $state('');
	/** @type {any | null} */
	let replyTo = $state(null);
	/** @type {HTMLDivElement | undefined} */
	let chatRootEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let messagesEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let feedBodyEl = $state();
	/** @type {HTMLDivElement | undefined} */
	let composerDockEl = $state();
	/** @type {HTMLTextAreaElement | undefined} */
	let inputEl = $state();
	/** @type {HTMLInputElement | undefined} */
	let fileInputEl = $state();
	/** @type {any[]} */
	let pendingFiles = $state([]);
	let voiceOpen = $state(false);
	let voiceSecs = $state(0);
	/** @type {ReturnType<typeof setInterval> | null} */
	let voiceTimer = null;

	/** Sticky pin — cleared when user scrolls away; gates auto-follow + resize snap. */
	let pinBottom = $state(true);
	let showScrollFab = $state(false);
	let pendingNewCount = $state(0);
	/**
	 * Visit-scoped unread boundary (captured on channel open) — in-feed chip + open scroll.
	 * Survives deferred read-receipt writes for this visit.
	 */
	/** @type {string | null} */
	let visitFirstNewId = $state(null);
	let visitNewCount = $state(0);
	let visitBoundaryChannel = $state('');
	/** @type {string} */
	let lastTailId = $state('');
	/** @type {string} */
	let mountedChannel = $state('');
	/** Skip measure while we are programmatically snapping. */
	let snapLock = 0;
	/**
	 * Only clear pinBottom after intentional leave-bottom gestures (wheel up / touch drag).
	 * Tip-wake remounts clamp scrollTop→0 and must not unpin — that was the jump-to-top bug.
	 */
	let leaveBottomIntent = false;
	/** @type {number | null} */
	let touchY0 = null;
	/** Briefly highlight a jumped-to quoted message. */
	let highlightId = $state(/** @type {string | null} */ (null));
	/** @type {ReturnType<typeof setTimeout> | null} */
	let highlightTimer = null;
	/** Textarea edge fades — only when content overflows that edge. */
	let fadeTop = $state(false);
	let fadeBottom = $state(false);
	let fieldTall = $state(false);
	const COMPOSER_FADE_THRESHOLD = 4;
	const COMPOSER_MAX_H = 140;
	const COMPOSER_TALL_PX = 28;

	const chronological = $derived(
		[...visibleChatMessages(chatFeed).filter((m) => (m.channel_id || 'general') === channelId)].sort(
			compareChatMessageAsc
		)
	);
	const stackMap = $derived(chatStackFlags(chronological, activePerson().email || ''));
	const canSend = $derived(Boolean(draft.trim()) || pendingFiles.length > 0);
	const presence = $derived(
		(chatEphemeral || []).filter((e) => e.channel_id === channelId && e.state !== 'idle')
	);

	/**
	 * @type {{
	 *   type: 'panel' | 'plain' | 'status',
	 *   key: string,
	 *   refKey?: string | null,
	 *   refMeta?: any,
	 *   messages: any[]
	 * }[]}
	 */
	const feedBlocks = $derived.by(() => {
		mailTipCache; /* re-tip Mail panels when subjects hydrate */
		/** @type {{ type: 'panel' | 'plain' | 'status', key: string, refKey?: string | null, refMeta?: any, messages: any[] }[]} */
		const blocks = [];
		for (const msg of chronological) {
			if (isChatStatusEvent(msg)) {
				blocks.push({
					type: 'status',
					key: `status-${msg.id}`,
					messages: [msg]
				});
				continue;
			}
			const refKey = chatPublicationRefKey(msg);
			const last = blocks[blocks.length - 1];
			if (refKey && last?.type === 'panel' && last.refKey === refKey) {
				last.messages.push(msg);
				continue;
			}
			if (refKey) {
				blocks.push({
					type: 'panel',
					key: `panel-${refKey}-${msg.id}`,
					refKey,
					refMeta: chatRefMeta(msg),
					messages: [msg]
				});
			} else {
				blocks.push({
					type: 'plain',
					key: `msg-${msg.id}`,
					messages: [msg]
				});
			}
		}
		return blocks;
	});

	const TIP_ICON = 22;
	const TIP_PFP = 20;
	const TIP_PFP_MAX = 4;

	/** Narrow φ list width when a deeper entity page is open from chat. */
	const compact = $derived.by(() => {
		const sel = ui.selection;
		if (!sel) return false;
		if (sel.kind === 'chat' && String(sel.id) === 'notifications') return false;
		return true;
	});
	/** Pad morph only after a compact toggle — not on first enter to Chat. */
	let wasCompact = $state(false);
	$effect(() => {
		if (compact) wasCompact = true;
	});

	/** Unique authors for tip-row pfps (events + comments). */
	function tipAuthors(/** @type {any[]} */ messages) {
		/** @type {string[]} */
		const out = [];
		for (const m of messages || []) {
			const email = String(m?.author || '')
				.trim()
				.toLowerCase();
			if (!email || out.includes(email)) continue;
			out.push(email);
			if (out.length >= TIP_PFP_MAX) break;
		}
		return out;
	}

	/** Bubbles only — create-events are tip chrome, not cards. */
	function panelBubbles(/** @type {any[]} */ messages) {
		return (messages || []).filter((m) => m?.kind !== 'event');
	}

	/** Comment-thread kinds CommentThread can open. */
	function commentableRefType(/** @type {string | undefined} */ type) {
		return type === 'task' ||
			type === 'note' ||
			type === 'project' ||
			type === 'mail' ||
			type === 'file'
			? type
			: null;
	}

	/**
	 * True when the entity has comments older / outside the feed panel bubbles.
	 * Prefer `ref.seq` on the first bubble (instant, no comments fetch).
	 * @param {string | null | undefined} refKey
	 * @param {any[]} bubbles
	 */
	function hasPriorComments(refKey, bubbles) {
		const first = bubbles?.[0];
		const seq = first?.ref?.seq;
		if (typeof seq === 'number' && Number.isFinite(seq)) return seq > 0;

		/* Legacy messages without seq — fall back to loaded comment thread. */
		if (!refKey) return false;
		commentsByKey; /* reactive */
		const all = visibleChatMessages(commentsByKey[refKey] ?? []).filter(
			(m) => m?.kind !== 'event' && m?.kind !== 'reaction'
		);
		if (all.length === 0) return false;
		const shown = new Set((bubbles || []).map((m) => String(m.id)));
		if (all.some((m) => !shown.has(String(m.id)))) return true;
		if (!bubbles?.length) return all.length > 0;
		const firstAt = String(bubbles[0]?.created_at || '');
		return all.some((m) => String(m.created_at || '') < firstAt);
	}

	/**
	 * Open entity detail + comment sheet; scroll to the first feed bubble (not expand inline).
	 * @param {any} msg
	 * @param {any[]} bubbles
	 */
	function viewMoreComments(msg, bubbles) {
		const ref = msg?.ref;
		const kind = commentableRefType(ref?.type);
		if (!kind || !ref?.id) return;
		const scrollToId = bubbles?.[0]?.id ? String(bubbles[0].id) : null;
		openChatRef(msg);
		requestOpenComments(kind, ref.id, scrollToId);
	}

	onMount(() => {
		mountedChannel = channelId;
		startChatTipPoll();
		const warm = hydrateChatFeedFromCache() || chatFeed.length > 0;
		if (warm) {
			chatUi.loading = false;
			chatUi.settled = true;
			lastTailId = chronological.at(-1)?.id ? String(chronological.at(-1).id) : '';
			void anchorOpenScroll();
		} else if (chatFeed.length === 0) {
			chatUi.loading = true;
		}
		void refreshChatFeed().then(() => {
			const nextTail = chronological.at(-1)?.id ? String(chronological.at(-1).id) : '';
			lastTailId = nextTail;
			/* Re-anchor after hydrate — prefer first unread when still at open boundary. */
			if (visitBoundaryChannel !== channelId || !visitFirstNewId) {
				void anchorOpenScroll();
			} else if (pinBottom) {
				void goBottom(false, false);
			} else {
				void scrollToMessage(visitFirstNewId, { smooth: false, block: 'start' });
			}
		});
		return () => {
			stopChatTipPoll();
			if (highlightTimer != null) clearTimeout(highlightTimer);
			if (voiceTimer != null) clearInterval(voiceTimer);
		};
	});

	/* Prefetch comment threads for tip panels so “view more” can appear. */
	$effect(() => {
		const keys = new Set();
		for (const block of feedBlocks) {
			if (block.type !== 'panel' || !block.refKey) continue;
			const [type, id] = String(block.refKey).split(':');
			if (!commentableRefType(type) || !id) continue;
			keys.add(block.refKey);
		}
		for (const key of keys) {
			const [type, id] = key.split(':');
			/* Skip only when a full load already settled — seed alone still needs reconcile. */
			if (commentsByKey[key] != null && commentsSettledByKey[key]) continue;
			/* untrack: loadComments must not re-subscribe this effect to commentsByKey writes. */
			untrack(() => {
				void loadComments(
					/** @type {'task' | 'note' | 'project' | 'mail' | 'file'} */ (type),
					id
				).catch(() => {});
			});
		}
	});

	$effect(() => {
		const scroller = messagesEl;
		const body = feedBodyEl;
		if (!scroller || !body) return;
		return attachFeedPinResize(scroller, body, () => pinBottom, () => snapLock > 0);
	});

	/* Grow feed bottom pad with composer height (quote / attach / tall draft). */
	$effect(() => {
		const root = chatRootEl;
		const dock = composerDockEl;
		const scroller = messagesEl;
		if (!root || !dock) return;
		return attachComposerClearPad(root, dock, {
			scroller,
			isPinned: () => pinBottom,
			isLocked: () => snapLock > 0
		});
	});

	$effect(() => {
		const id = channelId;
		if (mountedChannel && mountedChannel !== id) {
			lastTailId = '';
			pendingNewCount = 0;
			visitFirstNewId = null;
			visitNewCount = 0;
			visitBoundaryChannel = '';
			pinBottom = true;
			showScrollFab = false;
			mountedChannel = id;
			void anchorOpenScroll();
		} else if (!mountedChannel) {
			mountedChannel = id;
		}
	});

	/** Only follow the tail when pinned — never on reactions / mid-feed edits. */
	$effect(() => {
		const msgs = chronological;
		const tail = msgs.at(-1);
		const tailId = tail ? String(tail.id) : '';
		if (!tailId) {
			lastTailId = '';
			return;
		}
		if (!lastTailId) {
			lastTailId = tailId;
			/* First paint — prefer first-unread anchor over blind bottom. */
			void anchorOpenScroll();
			return;
		}
		if (tailId === lastTailId) return;

		const prevIdx = msgs.findIndex((m) => String(m.id) === lastTailId);
		const added = prevIdx >= 0 ? msgs.length - 1 - prevIdx : 1;
		lastTailId = tailId;

		if (pinBottom) {
			pendingNewCount = 0;
			void goBottom(false, true);
		} else {
			pendingNewCount += Math.max(1, added);
		}
	});

	/* Typing rows grow the stack — keep pinned feeds on the bottom. */
	$effect(() => {
		const n = presence.length;
		if (!n || !pinBottom) return;
		void goBottom(false, false);
	});

	/** @param {WheelEvent} e */
	function onFeedWheel(e) {
		if (e.deltaY < 0) leaveBottomIntent = true;
	}

	/** @param {TouchEvent} e */
	function onFeedTouchStart(e) {
		touchY0 = e.touches[0]?.clientY ?? null;
	}

	/** @param {TouchEvent} e */
	function onFeedTouchMove(e) {
		const y = e.touches[0]?.clientY;
		if (touchY0 == null || y == null) return;
		/* Finger down → content scrolls up (away from bottom). */
		if (y - touchY0 > 10) leaveBottomIntent = true;
	}

	function onFeedTouchEnd() {
		touchY0 = null;
	}

	function measureScroll() {
		if (snapLock > 0) return;
		const el = messagesEl;
		if (!el) return;
		const near = isFeedNearBottom(el);
		if (pinBottom && !near && !leaveBottomIntent) {
			/*
			 * Tip-wake / keyed remounts clamp scrollTop→0. Stay pinned; ResizeObserver
			 * + MutationObserver in attachFeedPinResize snap back — do not unpin here.
			 */
			showScrollFab = false;
			return;
		}
		if (near) leaveBottomIntent = false;
		pinBottom = near;
		showScrollFab = !near && el.scrollHeight > el.clientHeight + 40;
		if (near) {
			pendingNewCount = 0;
			/* Dismiss visit new-message chip once the user reaches the tip. */
			visitFirstNewId = null;
			visitNewCount = 0;
		}
	}

	/**
	 * Unread tips for this channel (others' messages not yet in read_by).
	 * @param {any[]} msgs
	 */
	function unreadBoundary(msgs) {
		const me = String(activePerson().email || '')
			.trim()
			.toLowerCase();
		/** @type {string | null} */
		let firstId = null;
		let count = 0;
		if (!me) return { firstId, count };
		for (const m of msgs) {
			if (!m?.id || String(m.id).startsWith('local-')) continue;
			if (m.kind === 'reaction' || m.kind === 'event') continue;
			const author = String(m.author || '')
				.trim()
				.toLowerCase();
			if (!author || author === me) continue;
			const readBy = Array.isArray(m.read_by)
				? m.read_by.map((e) => String(e).toLowerCase())
				: [];
			if (readBy.includes(me)) continue;
			if (!firstId) firstId = String(m.id);
			count += 1;
		}
		return { firstId, count };
	}

	/**
	 * Open / channel switch: land on first unread when any exist; else bottom.
	 * @param {{ force?: boolean }} [opts]
	 */
	async function anchorOpenScroll(opts = {}) {
		const force = Boolean(opts.force);
		await tick();
		const msgs = chronological;
		if (!msgs.length) {
			if (force || pinBottom) void goBottom(true, false);
			return;
		}
		const already = visitBoundaryChannel === channelId && visitFirstNewId;
		if (!force && already) {
			await scrollToMessage(visitFirstNewId, { smooth: false, block: 'start' });
			return;
		}
		const { firstId, count } = unreadBoundary(msgs);
		visitBoundaryChannel = channelId;
		visitFirstNewId = firstId;
		visitNewCount = count;
		if (firstId) {
			pendingNewCount = count;
			pinBottom = false;
			leaveBottomIntent = true;
			await scrollToMessage(firstId, { smooth: false, block: 'start' });
			showScrollFab = true;
			measureScroll();
			return;
		}
		visitFirstNewId = null;
		visitNewCount = 0;
		pendingNewCount = 0;
		await goBottom(true, false);
	}

	/**
	 * @param {string} messageId
	 * @param {{ smooth?: boolean, block?: ScrollLogicalPosition, flash?: boolean }} [opts]
	 */
	async function scrollToMessage(messageId, opts = {}) {
		const id = String(messageId || '');
		if (!id) return;
		await tick();
		const root = messagesEl;
		const target = root?.querySelector(`[data-chat-bubble="${CSS.escape(id)}"]`);
		if (!(target instanceof HTMLElement)) {
			/* Bubble may be inside a panel — try anchor wrappers. */
			const anchor = root?.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
			if (anchor instanceof HTMLElement) {
				snapLock++;
				try {
					anchor.scrollIntoView({
						behavior: opts.smooth ? 'smooth' : 'auto',
						block: opts.block || 'start'
					});
				} finally {
					snapLock = Math.max(0, snapLock - 1);
					measureScroll();
				}
			}
			return;
		}
		snapLock++;
		try {
			target.scrollIntoView({
				behavior: opts.smooth ? 'smooth' : 'auto',
				block: opts.block || 'start'
			});
			if (opts.flash) {
				highlightId = id;
				if (highlightTimer != null) clearTimeout(highlightTimer);
				highlightTimer = setTimeout(() => {
					if (highlightId === id) highlightId = null;
					highlightTimer = null;
				}, 1400);
			}
		} finally {
			snapLock = Math.max(0, snapLock - 1);
			measureScroll();
		}
	}

	/**
	 * @param {boolean} [force]
	 * @param {boolean} [smooth] animated (FAB / follow); instant for open/send
	 */
	async function goBottom(force = false, smooth = false) {
		if (force) pinBottom = true;
		if (!force && !pinBottom) return;
		snapLock++;
		pinBottom = true;
		leaveBottomIntent = false;
		showScrollFab = false;
		pendingNewCount = 0;
		/* Reaching bottom clears the visit new-message chip. */
		if (force) {
			visitFirstNewId = null;
			visitNewCount = 0;
		}
		try {
			await snapFeedToBottomSoon(() => messagesEl, { smooth });
		} finally {
			snapLock = Math.max(0, snapLock - 1);
			measureScroll();
		}
	}

	function onJumpToLatest() {
		void goBottom(true, true);
	}

	/** Local calendar day key for date chips. @param {string | undefined} iso */
	function dayKey(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	}

	/** @param {string | undefined} iso */
	function formatDayChip(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const now = new Date();
		const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		const diffDays = Math.round((startToday.getTime() - startMsg.getTime()) / 86_400_000);
		if (diffDays === 0) return t('chat.dateToday');
		if (diffDays === 1) return t('chat.dateYesterday');
		if (diffDays > 1 && diffDays < 7) {
			return d.toLocaleDateString(undefined, { weekday: 'long' });
		}
		return d.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
		});
	}

	/** @param {any} block */
	function blockDayIso(block) {
		return String(block?.messages?.[0]?.created_at || '');
	}

	function newMessagesChipLabel() {
		const n = visitNewCount;
		if (n <= 1) return t('chat.newMessageChip');
		return t('chat.newMessagesChip', { n: n > 99 ? '99+' : n });
	}

	/** Jump to a quoted parent bubble and flash it. */
	async function scrollToQuoted(parentId) {
		const id = String(parentId || '');
		if (!id) return;
		await tick();
		const root = messagesEl;
		const target = root?.querySelector(`[data-chat-bubble="${CSS.escape(id)}"]`);
		if (!(target instanceof HTMLElement)) return;
		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		highlightId = id;
		if (highlightTimer != null) clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => {
			if (highlightId === id) highlightId = null;
			highlightTimer = null;
		}, 1400);
		measureScroll();
	}

	function formatWhen(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const now = Date.now();
		const diff = now - d.getTime();
		if (diff < 60_000) return t('chat.justNow');
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** @param {any} msg */
	function startReply(msg) {
		replyTo = msg;
		inputEl?.focus();
	}

	function clearReply() {
		replyTo = null;
	}

	function openAttach() {
		fileInputEl?.click();
	}

	/** @param {Event} e */
	function onFilesPicked(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = [...(input.files || [])];
		input.value = '';
		if (!files.length) return;
		pendingFiles = [
			...pendingFiles,
			...files.map((file) => {
				const kind = inferMediaKind({
					content_type: file.type,
					name: file.name
				});
				return {
					file,
					previewUrl:
						kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null,
					kind
				};
			})
		];
	}

	function clearPendingFiles() {
		for (const f of pendingFiles) {
			if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
		}
		pendingFiles = [];
	}

	/**
	 * @param {File} file
	 * @param {string} msgId
	 */
	async function uploadChatAttachment(file, msgId) {
		const session = activeSession();
		if (!session) throw new Error(t('settings.connectDriveFirst'));
		const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'file';
		const path = `chat/media/${msgId}/${safe}`;
		const kind = inferMediaKind({ content_type: file.type, name: file.name });
		const contentType = mimeFromNameAndType(file.name, file.type);
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (file.size > 512 * 1024 || kind === 'video' || kind === 'voice') {
			const mediaPath = `chat/media/${msgId}/media.json`;
			await putMediaBlob(session, mediaPath, contentType, bytes);
			return {
				path: mediaPath,
				content_type: contentType,
				kind,
				name: file.name,
				bytes: file.size
			};
		}
		await putPath(session, path, 'blob', bytes);
		return {
			path,
			content_type: contentType,
			kind,
			name: file.name,
			bytes: file.size
		};
	}

	async function send() {
		const body = draft.trim();
		const files = pendingFiles;
		if (!body && !files.length) return;
		draft = '';
		pendingFiles = [];
		fieldTall = false;
		fadeTop = false;
		fadeBottom = false;
		if (inputEl) inputEl.style.height = 'auto';
		const parent = replyTo;
		replyTo = null;
		const pubRef =
			parent && chatPublicationRefKey(parent) && parent.ref?.type && parent.ref?.id
				? { type: String(parent.ref.type), id: String(parent.ref.id) }
				: null;

		/** Optimistic local previews — upload runs after bubble paints; ✓ only after Drive settle. */
		const localAtt = files.map((f) => ({
			kind: f.kind,
			name: f.file.name,
			bytes: f.file.size,
			content_type: f.file.type,
			previewUrl: f.previewUrl,
			path: `local:${f.file.name}`
		}));

		try {
			pinBottom = true;
			const uploadId = crypto.randomUUID().slice(0, 16);
			await postChatMessage({
				body,
				kind: pubRef ? 'comment' : 'chat',
				ref: pubRef,
				reply_to: parent?.id ?? null,
				channel_id: channelId,
				...(localAtt.length ? { attachments: localAtt } : {}),
				...(files.length
					? {
							resolveAttachments: async () =>
								Promise.all(
									files.map(async (f) => {
										const meta = await uploadChatAttachment(f.file, uploadId);
										return { ...meta, previewUrl: f.previewUrl };
									})
								)
						}
					: {})
			});
			inputEl?.focus();
			void goBottom(true);
		} catch (e) {
			chatUi.error = e instanceof Error ? e.message : String(e);
		}
	}

	function openVoiceShell() {
		voiceOpen = true;
		voiceSecs = 0;
		signalRecording(channelId, true);
		if (voiceTimer != null) clearInterval(voiceTimer);
		voiceTimer = setInterval(() => {
			voiceSecs += 1;
		}, 1000);
	}

	function cancelVoiceShell() {
		voiceOpen = false;
		voiceSecs = 0;
		signalRecording(channelId, false);
		if (voiceTimer != null) {
			clearInterval(voiceTimer);
			voiceTimer = null;
		}
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
		if (e.key === 'Escape' && replyTo) {
			clearReply();
		}
	}

	function updateInputFade() {
		const el = inputEl;
		if (!el) {
			fadeTop = false;
			fadeBottom = false;
			return;
		}
		fadeTop = el.scrollTop > COMPOSER_FADE_THRESHOLD;
		fadeBottom =
			el.scrollHeight - el.clientHeight > COMPOSER_FADE_THRESHOLD &&
			el.scrollHeight - el.scrollTop - el.clientHeight > COMPOSER_FADE_THRESHOLD;
	}

	/** @param {string} next @param {number} cursor */
	function onSuggestInsert(next, cursor) {
		draft = next;
		queueMicrotask(() => {
			if (!inputEl) return;
			inputEl.focus();
			inputEl.setSelectionRange(cursor, cursor);
			onInput();
		});
	}

	function onInput() {
		const el = inputEl;
		if (!el) return;
		el.style.height = 'auto';
		const next = Math.min(el.scrollHeight, COMPOSER_MAX_H);
		el.style.height = `${next}px`;
		fieldTall = next > COMPOSER_TALL_PX || draft.includes('\n');
		updateInputFade();
		if (draft.trim()) signalTyping(channelId);
	}

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	const replyPreview = $derived.by(() => {
		if (!replyTo) return null;
		const email = String(replyTo.author || '');
		const p = asPerson(email);
		const n = p?.name || displayNameFromEmail(email);
		const plain = String(replyTo.body || '')
			.replace(/\s+/g, ' ')
			.trim();
		const text = plain.length > 72 ? `${plain.slice(0, 72).trim()}…` : plain || t('chat.message');
		return {
			email,
			name: n,
			text,
			accent: profileAccentCss(email, n),
			nameColor: profileNameCss(email, n, isDark)
		};
	});

	/* Full capsule by default; squared top only for quote / media / voice — not tall text. */
	const chromeExpanded = $derived(
		Boolean(replyPreview) || pendingFiles.length > 0 || voiceOpen
	);

	function presenceLabel(/** @type {any} */ e) {
		const name = displayNameFromEmail(e.actor);
		if (e.label) return e.label;
		if (e.state === 'recording') return t('chat.recording', { name });
		if (e.state === 'thinking') return t('chat.thinking', { name });
		if (e.state === 'tool') return t('chat.working', { name });
		return t('chat.typing', { name });
	}
</script>

<div class="chat" class:compact class:was-compact={wasCompact} bind:this={chatRootEl}>
	<!-- class "feed" required for list-top chrome scroll fade; app.css excludes .messages from feed-pad -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="feed messages"
		bind:this={messagesEl}
		onscroll={measureScroll}
		onwheel={onFeedWheel}
		ontouchstart={onFeedTouchStart}
		ontouchmove={onFeedTouchMove}
		ontouchend={onFeedTouchEnd}
		ontouchcancel={onFeedTouchEnd}
	>
		<div class="feed-body" bind:this={feedBodyEl}>
			{#if driveSession.error}
				<p class="banner"><span class="err">{driveSession.error}</span></p>
			{/if}

			{#if chronological.length === 0 && (!chatUi.settled || chatUi.loading) && !presence.length}
				<FeedSkeleton rows={6} />
			{:else if chronological.length === 0 && !presence.length}
				<div class="empty">
					<p class="empty-title">{t('chat.noMessages')}</p>
					<p class="empty-body">{t('chat.writeBelow')}</p>
				</div>
			{:else}
				<div class="stack">
					{#each feedBlocks as block, bi (block.key)}
						{@const prevIso = bi > 0 ? blockDayIso(feedBlocks[bi - 1]) : ''}
						{@const curIso = blockDayIso(block)}
						{@const showDay = Boolean(curIso && dayKey(curIso) !== dayKey(prevIso))}
						{#if showDay}
							<div class="day-chip-row" role="separator" aria-label={formatDayChip(curIso)}>
								<span class="day-chip">{formatDayChip(curIso)}</span>
							</div>
						{/if}
						{#if block.type === 'status'}
							{@const msg = block.messages[0]}
							{@const subject = String(msg?.ref?.id || msg?.author || '')
								.trim()
								.toLowerCase()}
							{#if visitFirstNewId && String(msg?.id) === visitFirstNewId && visitNewCount > 0}
								<div class="new-chip-row" role="separator" aria-label={newMessagesChipLabel()}>
									<span class="new-chip">{newMessagesChipLabel()}</span>
								</div>
							{/if}
							<ChatStatusLine
								text={chatStatusText(msg)}
								email={subject}
								name={displayNameFromEmail(subject)}
							/>
						{:else if block.type === 'panel'}
							{@const refMeta = block.refMeta}
							{@const projectBox =
								refMeta?.box === 'project' && refMeta.project
									? chatProjectBoxProps(refMeta.project)
									: null}
							{@const authors =
								Array.isArray(refMeta?.tipEmails) && refMeta.tipEmails.length
									? refMeta.tipEmails
									: tipAuthors(block.messages)}
							{@const bubbles = panelBubbles(block.messages)}
							<section class="pub-panel" class:tip-only={bubbles.length === 0}>
								<button
									type="button"
									class="pub-tip"
									class:deleted={Boolean(refMeta?.deleted)}
									class:loading={Boolean(refMeta?.loading)}
									aria-label={refMeta ? `${refMeta.kind}: ${refMeta.title}` : t('chat.open')}
									onclick={() => openChatRef(block.messages[0])}
								>
									{#if refMeta?.box === 'task'}
										<span class="pub-box" aria-hidden="true">
											<TaskBox state={refMeta.status || 'open'} size={TIP_ICON} />
										</span>
									{:else if refMeta?.box === 'project'}
										<span class="pub-box" aria-hidden="true">
											<ProjectBox
												state={projectBox?.state || 'active'}
												icon={projectBox?.icon}
												size={TIP_ICON}
											/>
										</span>
									{:else if refMeta?.box === 'enterprise'}
										<span class="pub-box" aria-hidden="true">
											<EnterpriseBox
												state={refMeta.enterprise?.status ?? 'active'}
												icon={refMeta.enterprise?.icon}
												size={TIP_ICON}
											/>
										</span>
									{:else}
										<span class="pub-glyph" aria-hidden="true">
											<TipTypeIcon name={refMeta?.icon || 'chat'} size={TIP_ICON} />
										</span>
									{/if}
									{#if refMeta}
										<span class="pub-kind">{refMeta.kind}</span>
										<span class="pub-title">{refMeta.title}</span>
									{/if}
									{#if authors.length}
										<span class="tip-pfps" aria-hidden="true">
											{#each authors as email, i (email)}
												{@const tipName = refMeta?.tipNames?.[email]}
												{@const rp = asPerson(email)}
												{@const rn = tipName || rp?.name || displayNameFromEmail(email)}
												<span class="tip-pfp" style:z-index={authors.length - i}>
													<ProfilePic
														name={rn}
														email={email}
														pictureUrl={pictureUrlFor(email)}
														size={TIP_PFP}
														bare
													/>
												</span>
											{/each}
										</span>
									{/if}
								</button>
								{#if bubbles.length}
									{@const showViewMore =
										Boolean(commentableRefType(block.messages[0]?.ref?.type)) &&
										hasPriorComments(block.refKey, bubbles)}
									{@const firstBubble = bubbles[0]}
									{@const firstMine = (() => {
										const me = String(activePerson().email || '')
											.trim()
											.toLowerCase();
										const author = String(firstBubble?.author || '')
											.trim()
											.toLowerCase();
										return Boolean(me && author && me === author);
									})()}
									<div class="pub-body" class:has-view-more={showViewMore}>
										{#if showViewMore}
											<div class="view-more-row" class:mine={firstMine}>
												<button
													type="button"
													class="view-more-pill"
													aria-label={t('comments.viewMore')}
													onclick={() => viewMoreComments(block.messages[0], bubbles)}
												>
													<span class="view-more-dots" aria-hidden="true">
														<span></span><span></span><span></span>
													</span>
												</button>
											</div>
										{/if}
										{#each bubbles as msg, bi (msg.id)}
											{@const st = stackMap.get(String(msg.id)) || { isFirst: true, isLast: true }}
											{#if visitFirstNewId && String(msg.id) === visitFirstNewId && visitNewCount > 0}
												<div class="new-chip-row" role="separator" aria-label={newMessagesChipLabel()}>
													<span class="new-chip">{newMessagesChipLabel()}</span>
												</div>
											{/if}
											<div
												class="bubble-anchor"
												class:jump-flash={highlightId === msg.id}
												class:panel-first={bi === 0}
												data-msg-id={msg.id}
											>
												<ChatFeedCard
													{msg}
													parent={findChatParent(msg.reply_to)}
													when={formatWhen(msg.created_at)}
													onReply={() => startReply(msg)}
													onQuoteClick={scrollToQuoted}
													stackFirst={st.isFirst}
													stackLast={st.isLast}
													threaded
												/>
											</div>
										{/each}
									</div>
								{/if}
							</section>
						{:else}
							{#each block.messages as msg (msg.id)}
								{@const st = stackMap.get(String(msg.id)) || { isFirst: true, isLast: true }}
								{#if visitFirstNewId && String(msg.id) === visitFirstNewId && visitNewCount > 0}
									<div class="new-chip-row" role="separator" aria-label={newMessagesChipLabel()}>
										<span class="new-chip">{newMessagesChipLabel()}</span>
									</div>
								{/if}
								<div
									class="bubble-anchor"
									class:jump-flash={highlightId === msg.id}
									data-msg-id={msg.id}
								>
									<ChatFeedCard
										{msg}
										parent={findChatParent(msg.reply_to)}
										when={formatWhen(msg.created_at)}
										onReply={() => startReply(msg)}
										onQuoteClick={scrollToQuoted}
										stackFirst={st.isFirst}
										stackLast={st.isLast}
									/>
								</div>
							{/each}
						{/if}
					{/each}
					{#each presence as e (e.actor + e.state)}
						<div
							class="bubble-anchor typing-anchor"
							aria-live="polite"
							aria-label={presenceLabel(e)}
						>
							<article class="typing-card">
								<div class="typing-avatar">
									<ProfilePic
										name={displayNameFromEmail(e.actor)}
										email={e.actor}
										pictureUrl={pictureUrlFor(e.actor)}
										size={34}
									/>
								</div>
								<div class="typing-bubble" aria-hidden="true">
									<span class="typing-wave">
										<i></i><i></i><i></i>
									</span>
								</div>
							</article>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if showScrollFab || pendingNewCount > 0}
		<div class="scroll-fabs">
			<button
				type="button"
				class="scroll-fab"
				aria-label={t('chat.scrollToBottom')}
				onclick={onJumpToLatest}
			>
				<ArrowDown size={18} />
				{#if pendingNewCount > 0}
					<span class="fab-badge">{pendingNewCount > 99 ? '99+' : pendingNewCount}</span>
				{/if}
			</button>
		</div>
	{/if}

	<div class="composer-fade" aria-hidden="true"></div>
	<div class="composer-dock" bind:this={composerDockEl}>
		<!-- Suggest sits outside the pill so overflow:hidden / shine mask cannot clip it -->
		<div class="composer-stack">
			<ComposerSuggest {inputEl} value={draft} oninsert={onSuggestInsert} />
			<ChatComposer expanded={chromeExpanded}>
				{#if replyPreview}
					<div class="composer-quote-wrap">
						<div class="composer-quote" role="group" aria-label={t('chat.replyingTo', { name: replyPreview.name })}>
							<div
								class="composer-quote-bar"
								style:background={replyPreview.accent}
								aria-hidden="true"
							></div>
							<div class="composer-quote-body">
								<span class="composer-quote-name" style:color={replyPreview.nameColor}
									>{replyPreview.name}</span
								>
								<span class="composer-quote-text">{replyPreview.text}</span>
							</div>
							<button
								type="button"
								class="composer-quote-clear"
								aria-label={t('chat.cancelReply')}
								onclick={clearReply}>×</button
							>
						</div>
					</div>
				{/if}
				{#if pendingFiles.length}
					<div class="attach-bar">
						{#each pendingFiles as f, i (f.file.name + i)}
							<span class="attach-chip">
								{f.kind === 'image' ? t('chat.image') : f.kind === 'video' ? t('chat.video') : f.file.name}
								<button
									type="button"
									class="attach-x"
									aria-label={t('chat.remove')}
									onclick={() => {
										if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
										pendingFiles = pendingFiles.filter((_, j) => j !== i);
									}}>×</button
								>
							</span>
						{/each}
						<button type="button" class="attach-clear" onclick={clearPendingFiles}>{t('chat.clear')}</button>
					</div>
				{/if}
				{#if voiceOpen}
					<div class="voice-shell">
						<span class="voice-pulse" aria-hidden="true"></span>
						<span class="voice-label"
							>{t('chat.recording', { name: displayNameFromEmail(activePerson().email) })}
							{voiceSecs}s</span
						>
						<button type="button" class="voice-cancel" onclick={cancelVoiceShell}>{t('chat.cancel')}</button>
						<button
							type="button"
							class="voice-send"
							onclick={() => {
								cancelVoiceShell();
								chatUi.error = t('chat.voiceNext');
							}}>{t('chat.send')}</button
						>
					</div>
				{/if}
				<div class="composer-row" class:chrome-expanded={chromeExpanded}>
					<input
						bind:this={fileInputEl}
						type="file"
						class="file-input"
						multiple
						accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
						onchange={onFilesPicked}
					/>
					<button type="button" class="side-btn plus" aria-label={t('chat.attach')} onclick={openAttach}>
						<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
							<path
								d="M9 3.5v11M3.5 9h11"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
							/>
						</svg>
					</button>
					<div
						class="composer-field"
						class:fade-top={fadeTop}
						class:fade-bottom={fadeBottom}
					>
						<textarea
							bind:this={inputEl}
							class="composer-input"
							rows="1"
							placeholder={replyTo ? t('chat.reply') : t('chat.message')}
							bind:value={draft}
							onkeydown={onKey}
							oninput={onInput}
							onscroll={updateInputFade}
							aria-label={t('chat.message')}
						></textarea>
					</div>
					{#if canSend}
						<button type="button" class="side-btn send" aria-label={t('chat.send')} onclick={() => void send()}>
							<AlphaLogo size={15} />
						</button>
					{:else}
						<button
							type="button"
							class="side-btn mic"
							aria-label={t('chat.voiceMessage')}
							title={t('chat.voiceMessage')}
							onclick={openVoiceShell}
						>
							<Voice size={22} />
						</button>
					{/if}
				</div>
			</ChatComposer>
		</div>
	</div>
</div>

<style>
	.chat {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
		background: transparent;
	}

	.messages {
		flex: 1;
		min-height: 0;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		/* No class "feed" — app.css list feed-pad would crush bottom to 36px. */
		padding: 56px 24px var(--composer-clear, calc(120px + env(safe-area-inset-bottom, 0px)));
	}

	/* Match other 2nd-column gutters when chat is compacted (after a detail open). */
	.chat.compact .messages {
		padding-left: 10px;
		padding-right: 10px;
	}

	.chat.compact .composer-dock {
		padding-left: 10px;
		padding-right: 10px;
	}

	.chat.compact .messages,
	.chat:not(.compact).was-compact .messages,
	.chat.compact .composer-dock,
	.chat:not(.compact).was-compact .composer-dock {
		transition: padding 0.34s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.feed-body {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: min-content;
	}

	.banner {
		margin: 0;
		padding: 10px 0;
		font-size: 13px;
	}

	.err {
		color: #b44;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin: auto;
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

	.stack {
		display: flex;
		flex-direction: column;
		/* Tight like alpha-chat — stack groups use card margins, not a fat gap. */
		gap: 0;
		padding: 8px 0 12px;
		margin-top: auto;
	}

	.stack > .pub-panel {
		margin-top: 10px;
	}

	.bubble-anchor {
		border-radius: 16px;
		transition: background-color 0.35s ease;
	}

	.bubble-anchor.jump-flash {
		animation: quote-flash 1.35s ease;
	}

	@keyframes quote-flash {
		0% {
			background-color: color-mix(in srgb, var(--accent-1) 28%, transparent);
		}
		55% {
			background-color: color-mix(in srgb, var(--accent-1) 14%, transparent);
		}
		100% {
			background-color: transparent;
		}
	}

	.pub-panel {
		display: flex;
		flex-direction: column;
		gap: 0;
		/* Keep wash; tighter tip chrome than before (no extra tip pad). */
		padding: 8px 8px 10px;
		border-radius: var(--radius-16);
		background: color-mix(in srgb, var(--fg) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.pub-panel.tip-only {
		padding: 6px 8px;
	}

	.pub-tip {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		width: 100%;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.pub-tip.deleted .pub-kind,
	.pub-tip.deleted .pub-title {
		color: var(--fg-33);
		font-weight: 500;
	}

	.pub-tip.deleted .pub-box,
	.pub-tip.deleted .pub-glyph {
		opacity: 0.45;
	}

	.pub-tip.loading .pub-kind,
	.pub-tip.loading .pub-title {
		color: var(--fg-33);
		font-weight: 500;
	}

	.pub-tip:hover,
	.pub-tip:focus,
	.pub-tip:focus-visible {
		background: transparent;
		outline: none;
	}

	.tip-pfps {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		margin-left: auto;
		padding-left: 8px;
		height: 22px;
		opacity: 0.66;
	}

	.tip-pfp {
		position: relative;
		margin-left: -6px;
		line-height: 0;
	}

	.tip-pfp:first-child {
		margin-left: 0;
	}

	.pub-box {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		max-width: 22px;
		max-height: 22px;
		overflow: hidden;
		display: grid;
		place-items: center;
		box-sizing: border-box;
	}

	.pub-glyph {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		max-width: 22px;
		max-height: 22px;
		overflow: hidden;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		color: var(--fg-33);
	}

	/* Tip → body: 10px (non-grouped bubble gap); with view-more: tip→pill ≤6px. */
	.pub-body {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin-top: 10px;
	}

	.pub-body.has-view-more {
		margin-top: 6px;
	}

	/* Kill ChatFeedCard stack-first top margin so tip/pill spacing is exact. */
	.pub-body > .bubble-anchor.panel-first :global(.card.stack-first),
	.pub-body > .bubble-anchor.panel-first :global(.card) {
		margin-top: 0;
	}

	.view-more-row {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding: 0;
		/* Same 6px under the pill as above (tip → pill). */
		margin: 0 0 6px;
	}

	.view-more-row:not(.mine) {
		justify-content: flex-start;
		/* 6px left of prior 40px — tracks incoming bubble start with 26px avatar. */
		padding-left: 34px;
	}

	.view-more-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 18px;
		padding: 0 8px;
		margin: 0;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		color: var(--fg-33);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		flex-shrink: 0;
	}

	.view-more-pill:hover {
		color: var(--fg-66);
	}

	.view-more-dots {
		display: inline-flex;
		align-items: center;
		gap: 2.5px;
		line-height: 0;
	}

	.view-more-dots span {
		width: 2.5px;
		height: 2.5px;
		border-radius: 999px;
		background: currentColor;
	}

	.pub-kind,
	.pub-title {
		font-size: 13px;
		font-weight: 500;
	}

	.pub-kind {
		flex-shrink: 0;
		color: var(--fg-33);
	}

	.pub-title {
		min-width: 0;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Ephemeral typing — mirrors incoming ChatFeedCard row; fixed bubble box. */
	.typing-anchor {
		margin-top: 2px;
		pointer-events: none;
	}

	.typing-card {
		display: flex;
		gap: 6px;
		align-items: flex-end;
		width: 100%;
	}

	.typing-avatar {
		flex-shrink: 0;
		width: 34px;
		line-height: 0;
	}

	.typing-bubble {
		box-sizing: border-box;
		width: 56px;
		height: 34px;
		padding: 0;
		border-radius: 16px 16px 16px 4px;
		background: var(--bubble-bg, color-mix(in srgb, var(--fg) 12%, transparent));
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.typing-wave {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		height: 14px;
		width: 28px;
	}

	.typing-wave i {
		display: block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--fg-33);
		/* Animate inside fixed box — never change bubble height. */
		animation: typing-wave 1.15s ease-in-out infinite;
	}

	.typing-wave i:nth-child(2) {
		animation-delay: 0.15s;
	}

	.typing-wave i:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes typing-wave {
		0%,
		80%,
		100% {
			transform: translateY(0);
			opacity: 0.35;
		}
		40% {
			transform: translateY(-4px);
			opacity: 0.95;
		}
	}

	.day-chip-row,
	.new-chip-row {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		padding: 10px 0 6px;
		pointer-events: none;
	}

	.day-chip,
	.new-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		max-width: 100%;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-33);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.01em;
		line-height: 1.2;
		white-space: nowrap;
	}

	.new-chip {
		/* Whisper accent mark — not a filled CTA */
		color: var(--accent-1);
		background: color-mix(in srgb, var(--accent-1) 12%, var(--fg-8));
	}

	.scroll-fabs {
		position: absolute;
		right: 24px;
		/* ~2px above live dock top (was +12px; sit ~10px closer to composer) */
		bottom: calc(var(--composer-dock-h, 67px) + 2px);
		z-index: 8;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		pointer-events: none;
	}

	.scroll-fabs > * {
		pointer-events: auto;
	}

	@media (max-width: 767px) {
		.scroll-fabs {
			right: 14px;
		}
	}

	.scroll-fab {
		position: relative;
		/* Match composer pill / dock control height */
		width: 47px;
		height: 47px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: var(--composer-bg, color-mix(in srgb, var(--glass) 72%, transparent));
		color: var(--fg-33);
		cursor: pointer;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		-webkit-tap-highlight-color: transparent;
		isolation: isolate;
	}

	.scroll-fab::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		pointer-events: none;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--fg) 12%, transparent) 0%,
			color-mix(in srgb, var(--fg) 3%, transparent) 45%,
			color-mix(in srgb, var(--fg) 3%, transparent) 55%,
			color-mix(in srgb, var(--fg) 9%, transparent) 100%
		);
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
	}

	.scroll-fab:hover {
		color: var(--fg-66);
	}

	.fab-badge {
		position: absolute;
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
		min-width: 24px;
		height: 24px;
		padding: 0 6px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: var(--gradient-accent-1, radial-gradient(circle at top left, #5c5fff 0%, #4542ff 100%));
		color: #fff;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 12px;
		font-weight: 700;
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		line-height: 1;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-1) 35%, transparent);
	}

	/* Soft veil behind composer — fixed band (not tied to clear pad). */
	.composer-fade {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		/* Above shell list-bottom-fade (z5) when that chrome is present elsewhere */
		z-index: 6;
		height: calc(88px + env(safe-area-inset-bottom, 0px));
		pointer-events: none;
		background: linear-gradient(
			to top,
			var(--bg) 0%,
			color-mix(in srgb, var(--bg) 80%, transparent)
				calc(28px + env(safe-area-inset-bottom, 0px) * 0.5),
			transparent 100%
		);
	}

	/* Float over feed — feed scrolls underneath (z-index) */
	.composer-dock {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 7;
		padding: 10px 24px calc(10px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		pointer-events: none;
		background: transparent;
		transition: padding 0.34s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.composer-dock > * {
		pointer-events: auto;
	}

	@media (max-width: 767px) {
		.messages {
			padding: calc(88px + env(safe-area-inset-top, 0px)) 14px
				var(--composer-clear, calc(120px + env(safe-area-inset-bottom, 0px)));
		}

		.composer-fade {
			height: calc(88px + env(safe-area-inset-bottom, 0px));
			background: linear-gradient(
				to top,
				var(--shell, var(--bg)) 0%,
				color-mix(in srgb, var(--shell, var(--bg)) 80%, transparent)
					calc(28px + env(safe-area-inset-bottom, 0px) * 0.5),
				transparent 100%
			);
		}

		.composer-dock {
			padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
		}
	}

	.composer-quote-wrap {
		padding: 8px 8px 0;
		box-sizing: border-box;
		position: relative;
		z-index: 2;
	}

	.composer-quote {
		display: flex;
		align-items: stretch;
		min-width: 0;
		width: 100%;
		border-radius: 8px;
		overflow: hidden;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.composer-quote-bar {
		width: 2.8px;
		flex-shrink: 0;
		align-self: stretch;
	}

	.composer-quote-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 4px 8px 5px;
	}

	.composer-quote-name {
		font-size: 13px;
		font-weight: 700;
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.composer-quote-text {
		font-size: 13px;
		line-height: 1.35;
		color: var(--fg-66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.composer-quote-clear {
		flex-shrink: 0;
		align-self: flex-start;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		margin: 2px 2px 0 0;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-33);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}

	.composer-row {
		display: flex;
		align-items: flex-end;
		gap: 7px;
		min-height: calc(47px - 14px);
		padding: 7px;
		box-sizing: border-box;
		position: relative;
		z-index: 2;
	}

	.composer-row.chrome-expanded {
		padding-top: 4px;
	}

	.side-btn {
		width: 33px;
		height: 33px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 9999px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.side-btn.plus {
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		color: var(--fg-66);
	}

	.side-btn.plus:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.side-btn.mic {
		background: transparent;
		color: var(--fg-33);
	}

	.side-btn.send {
		background: var(--gradient-accent-1);
		color: #fff;
	}

	.composer-stack {
		position: relative;
		width: 100%;
		z-index: 5;
	}

	.composer-field {
		flex: 1;
		min-width: 0;
		max-height: 140px;
		display: flex;
		align-items: flex-end;
		/* Soft-clip overflow via mask; edges only when scrolled past threshold */
		-webkit-mask-image: linear-gradient(#000, #000);
		mask-image: linear-gradient(#000, #000);
	}

	.composer-field.fade-top {
		-webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 8px, #000 100%);
		mask-image: linear-gradient(to bottom, transparent 0, #000 8px, #000 100%);
	}

	.composer-field.fade-bottom {
		-webkit-mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 8px), transparent 100%);
		mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 8px), transparent 100%);
	}

	.composer-field.fade-top.fade-bottom {
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0,
			#000 8px,
			#000 calc(100% - 8px),
			transparent 100%
		);
		mask-image: linear-gradient(
			to bottom,
			transparent 0,
			#000 8px,
			#000 calc(100% - 8px),
			transparent 100%
		);
	}

	.composer-input {
		flex: 1;
		min-width: 0;
		width: 100%;
		min-height: 20px;
		max-height: 140px;
		margin: 0;
		padding: 6px 4px 7px;
		border: 0;
		outline: none;
		resize: none;
		overflow-y: auto;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 15px;
		line-height: 20px;
		field-sizing: content;
	}

	.composer-input::placeholder {
		color: var(--fg-33);
	}

	.file-input {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	.attach-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 8px 10px 0;
	}

	.attach-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--fg-8);
		font-size: 12px;
		color: var(--fg-66);
	}

	.attach-x,
	.attach-clear {
		border: 0;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
		font: inherit;
		font-size: 12px;
		padding: 0 2px;
	}

	.voice-shell {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px 0;
	}

	.voice-pulse {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #e44;
		animation: voice-blink 1s ease infinite;
	}

	@keyframes voice-blink {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}

	.voice-label {
		flex: 1;
		font-size: 13px;
		color: var(--fg-66);
	}

	.voice-cancel,
	.voice-send {
		border: 0;
		border-radius: 999px;
		padding: 6px 12px;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.voice-cancel {
		background: var(--fg-8);
		color: var(--fg-66);
	}

	.voice-send {
		background: var(--gradient-accent-1);
		color: #fff;
	}
</style>
