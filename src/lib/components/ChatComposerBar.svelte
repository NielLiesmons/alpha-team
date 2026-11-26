<script>
	/**
	 * Shared chat/comment composer: plus menu, attachments, voice, quote, send.
	 * Used by ChatChannelPanel and CommentThread — one UX, wired send paths.
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import AlphaLogo from '$lib/components/icons/AlphaLogo.svelte';
	import Voice from '$lib/components/icons/Voice.svelte';
	import ChatAttachPanel from '$lib/components/ChatAttachPanel.svelte';
	import ChatMediaStage from '$lib/components/ChatMediaStage.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { chatPublicationRefKey, chatUi, postChatMessage } from '$lib/chat.svelte.js';
	import { profileAccentCss, profileNameCss } from '$lib/color.js';
	import {
		composerPeopleFromMembers,
		getComposerWireValue,
		installComposerTextareaShim,
		isComposerWireEmpty,
		normalizeComposerEmpty,
		promoteComposerTokens,
		renderComposerWire,
		serializeComposer,
		setComposerCursor
	} from '$lib/composer-wysiwyg.js';
	import { uploadChatAttachment } from '$lib/drive/entities.js';
	import { inferMediaKind, mimeFromNameAndType } from '$lib/drive/media-kind.js';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import { members } from '$lib/members.svelte.js';
	import { signalRecording, signalTyping } from '$lib/realtime.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { createVoiceRecorder } from '$lib/voice-recorder.js';
	import { formatVoiceRecordTime } from '$lib/voice-waveform.js';
	import ChatComposer from '@alpha/ui/ChatComposer.svelte';
	import Lock from '@alpha/ui/icons/Lock.svelte';
	import Pause from '@alpha/ui/icons/Pause.svelte';
	import Play from '@alpha/ui/icons/Play.svelte';
	import Trash from '@alpha/ui/icons/Trash.svelte';

	/**
	 * @type {{
	 *   channelId?: string,
	 *   commentRef?: null | {
	 *     type: string,
	 *     id: string,
	 *     title?: string,
	 *     subject?: string,
	 *     from?: string,
	 *     from_name?: string
	 *   },
	 *   replyTo?: any | null,
	 *   draft?: string,
	 *   inputEl?: HTMLElement | undefined,
	 *   signalPresence?: boolean,
	 *   onSent?: () => void,
	 *   cancelReplyLabel?: string,
	 *   voiceActive?: boolean,
	 *   voiceMode?: 'idle' | 'holding' | 'locked',
	 *   voicePaused?: boolean,
	 *   voiceLockArmed?: boolean,
	 *   externalVoiceFab?: boolean
	 * }}
	 */
	let {
		channelId = 'general',
		commentRef = null,
		replyTo = $bindable(null),
		draft = $bindable(''),
		inputEl = $bindable(undefined),
		signalPresence = true,
		onSent = () => {},
		cancelReplyLabel = undefined,
		voiceActive = $bindable(false),
		voiceMode: voiceModeOut = $bindable(/** @type {'idle' | 'holding' | 'locked'} */ ('idle')),
		voicePaused: voicePausedOut = $bindable(false),
		voiceLockArmed: voiceLockArmedOut = $bindable(false),
		externalVoiceFab = false
	} = $props();

	/** @type {HTMLInputElement | undefined} */
	let mediaInputEl = $state();
	/** @type {HTMLInputElement | undefined} */
	let fileInputEl = $state();
	let attachOpen = $state(false);
	/** Active content-type tab inside the shared expand slot. */
	let attachTab = $state('photo');
	/** Keep original / larger quality on image upload — default compressed. */
	let uploadHd = $state(false);

	/**
	 * @typedef {{
	 *   id: string,
	 *   file: File | null,
	 *   previewUrl: string | null,
	 *   kind: string,
	 *   caption: string,
	 *   hd?: boolean,
	 *   library?: import('$lib/drive/entities.js').ChatAttachmentMeta,
	 *   libraryPreview?: boolean
	 * }} PendingFile
	 */
	/** @type {PendingFile[]} */
	let pendingFiles = $state([]);
	let mediaFocus = $state(0);

	/** @typedef {'idle' | 'holding' | 'locked'} VoiceMode */
	let voiceMode = $state(/** @type {VoiceMode} */ ('idle'));
	let voiceMs = $state(0);
	let voicePaused = $state(false);
	let voiceCancelArmed = $state(false);
	let voiceLockArmed = $state(false);
	let voiceDragX = $state(0);
	let voiceDragY = $state(0);
	let voicePreviewPlaying = $state(false);
	const VOICE_BAR_COUNT = 28;
	/** @type {number[]} */
	let voiceBars = $state(Array.from({ length: VOICE_BAR_COUNT }, () => 0));
	/** @type {ReturnType<typeof setInterval> | null} */
	let voiceTimer = null;
	/** @type {number | null} */
	let voiceMeterRaf = null;
	let voiceMeterLast = 0;
	const voiceRecorder = createVoiceRecorder();
	const VOICE_MIN_MS = 1000;
	const VOICE_MIN_BYTES = 800;
	/** Max left drag (px) and arm threshold for slide-to-delete. */
	const VOICE_CANCEL_MAX_PX = 100;
	const VOICE_CANCEL_ARM_PX = 64;
	/**
	 * Max up drag = latch when the hold circle overlaps the scroll-FAB lock
	 * (47px glass, ~2px above the composer dock).
	 */
	const VOICE_LOCK_MAX_PX = 72;
	const VOICE_LOCK_ARM_PX = 56;
	const voiceRecording = $derived(voiceMode === 'holding' || voiceMode === 'locked');
	const voiceHolding = $derived(voiceMode === 'holding');
	const voiceLocked = $derived(voiceMode === 'locked');
	/** @type {number | null} */
	let holdPointerId = null;
	let holdOriginX = 0;
	let holdOriginY = 0;
	/** False if the press ended before getUserMedia resolved. */
	let holdPointerAlive = false;
	/**
	 * Release that landed while getUserMedia was still pending.
	 * Applied as soon as recording actually starts so quick hold→send isn’t dropped.
	 * @type {null | 'send' | 'cancel' | 'lock'}
	 */
	let holdReleaseIntent = null;
	/** True from mic pointerdown until start() resolves or the gesture aborts. */
	let voiceStarting = false;
	/**
	 * pointercancel from keyboard/viewport animation — keep recording; wait for a
	 * real touchend/pointerup (any id) instead of aborting as a user cancel.
	 */
	let holdCaptureLost = false;
	/**
	 * True only when the soft keyboard was already up at mic-down (CE focused +
	 * visualViewport shrunk). Preserve that state — never force-open a closed kb.
	 */
	let holdKeepKeyboard = false;
	/**
	 * Full-viewport capture layer while the hold gesture is live.
	 * Portaled to document.body so z-index beats feed + ChatBubbleOverlay
	 * (composer dock stacking context would trap an in-tree fixed scrim).
	 * Never focusable — must not steal focus from the CE (keyboard keep-open).
	 */
	let voiceGestureActive = $state(false);
	/** @type {HTMLElement | null} */
	let voiceCaptureEl = null;
	/** @type {HTMLAudioElement | null} */
	let voicePreviewAudio = null;
	/** @type {string | null} */
	let voicePreviewUrl = null;

	onMount(() => {
		if (typeof document === 'undefined') return;
		const el = document.createElement('div');
		el.setAttribute('aria-hidden', 'true');
		el.tabIndex = -1;
		el.dataset.voiceCapture = '1';
		Object.assign(el.style, {
			position: 'fixed',
			inset: '0',
			zIndex: '10050',
			touchAction: 'none',
			pointerEvents: 'none',
			background: 'transparent',
			userSelect: 'none',
			webkitUserSelect: 'none',
			outline: 'none'
		});
		document.body.appendChild(el);
		voiceCaptureEl = el;
		return () => {
			el.remove();
			if (voiceCaptureEl === el) voiceCaptureEl = null;
		};
	});

	$effect(() => {
		const el = voiceCaptureEl;
		if (!el) return;
		el.style.pointerEvents = voiceGestureActive ? 'auto' : 'none';
		/*
		 * Safety: never leave the full-viewport capture layer hit-testing
		 * after the gesture / recording has ended (cancel races, remounts).
		 */
		if (!voiceGestureActive) return;
		const alive = voiceRecording || voiceStarting || holdPointerAlive || holdCaptureLost;
		if (alive) return;
		const t = window.setTimeout(() => {
			if (voiceGestureActive && !voiceRecording && !voiceStarting && !holdPointerAlive) {
				endVoiceGesture();
			}
		}, 600);
		return () => window.clearTimeout(t);
	});

	/** CE (or a descendant) is the document activeElement. */
	function isComposerActive() {
		const el = inputEl;
		if (!el || typeof document === 'undefined') return false;
		const ae = document.activeElement;
		return ae === el || (ae instanceof Node && el.contains(ae));
	}

	/**
	 * Soft keyboard visibly open (iOS often keeps CE focused after dismiss).
	 * Without this, re-focus would slide the keyboard back out when it was closed.
	 */
	function isSoftKeyboardOpen() {
		if (typeof window === 'undefined') return false;
		const vv = window.visualViewport;
		if (!vv) return isComposerActive();
		return window.innerHeight - vv.height > 120;
	}

	/**
	 * Blur-recovery only when the keyboard was already open at mic-down.
	 * Never call from mic-down itself — preventDefault keeps focus; calling
	 * focus() with a closed keyboard opens it (forbidden).
	 */
	function restoreComposerKeyboardIfKept() {
		if (!holdKeepKeyboard) return;
		const el = inputEl;
		if (!el || isComposerActive()) return;
		try {
			el.focus({ preventScroll: true });
		} catch {
			try {
				el.focus();
			} catch {
				/* ignore */
			}
		}
	}

	$effect(() => {
		voiceActive = voiceRecording;
		voiceModeOut = voiceMode;
		voicePausedOut = voicePaused;
		voiceLockArmedOut = voiceLockArmed;
	});

	let fadeTop = $state(false);
	let fadeBottom = $state(false);
	let fieldTall = $state(false);
	const COMPOSER_FADE_THRESHOLD = 4;
	const COMPOSER_MAX_H = 140;
	/** Slop above one line (pad + line-height) before we treat the field as multi-line. */
	const COMPOSER_TALL_SLOP_PX = 2;
	/** Skip CE → draft echo when we just painted from `draft`. */
	let wysiwygApplying = false;
	/** Last wire string painted into the CE (avoid rebuild loops). */
	let wysiwygPainted = '';
	/** IME composition — don't re-chip mid-key. */
	let wysiwygComposing = false;

	const composerPeople = $derived.by(() => {
		members.length;
		return composerPeopleFromMembers(members);
	});

	const pendingMedia = $derived(
		pendingFiles.filter((f) => f.kind === 'image' || f.kind === 'video')
	);
	const pendingDocs = $derived(
		pendingFiles.filter((f) => f.kind !== 'image' && f.kind !== 'video')
	);
	const canSend = $derived(Boolean(draft.trim()) || pendingFiles.length > 0);

	const attachItems = $derived([
		{ kind: 'photo', label: t('nav.photos'), icon: 'photos' },
		{ kind: 'file', label: t('nav.drive'), icon: 'folder' },
		{ kind: 'poll', label: t('chat.poll'), icon: 'poll' },
		{ kind: 'location', label: t('chat.location'), icon: 'globe' },
		{ kind: 'contact', label: t('chat.contact'), icon: 'people' },
		{ kind: 'event', label: t('chat.event'), icon: 'calendar' }
	]);

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
			name: n,
			text,
			accent: profileAccentCss(email, n),
			nameColor: profileNameCss(email, n, isDark)
		};
	});

	const chromeExpanded = $derived(
		Boolean(replyPreview) || pendingFiles.length > 0 || fieldTall || attachOpen
	);

	/** Shared expand slot: tabs OR media stage (never stacked). */
	const showExpand = $derived(attachOpen || pendingMedia.length > 0 || pendingDocs.length > 0);

	const replyClearLabel = $derived(cancelReplyLabel || t('chat.cancelReply'));

	function flushActiveCaption() {
		if (!pendingMedia.length) return;
		const focus = Math.min(Math.max(0, mediaFocus), pendingMedia.length - 1);
		const target = pendingMedia[focus];
		if (!target) return;
		const idx = pendingFiles.findIndex((f) => f.id === target.id);
		if (idx < 0) return;
		if (pendingFiles[idx].caption === draft) return;
		pendingFiles = pendingFiles.map((f, i) => (i === idx ? { ...f, caption: draft } : f));
	}

	/** @param {number} i */
	function setMediaFocus(i) {
		flushActiveCaption();
		const next = Math.min(Math.max(0, i), Math.max(0, pendingMedia.length - 1));
		mediaFocus = next;
		draft = pendingMedia[next]?.caption || '';
		tick().then(() => {
			onInput();
		});
	}

	function clearReply() {
		replyTo = null;
	}

	function toggleAttach() {
		if (attachOpen) {
			attachOpen = false;
			return;
		}
		attachOpen = true;
	}

	/** From media stage “+”: replace stage with Photos tab in the same expand slot. */
	function openAttachPhotos() {
		attachTab = 'photo';
		attachOpen = true;
	}

	function closeAttach() {
		attachOpen = false;
	}

	/**
	 * @param {File[]} files
	 */
	function addPickedFiles(files) {
		if (!files.length) return;
		const hadMedia = pendingMedia.length > 0;
		if (hadMedia) flushActiveCaption();
		const seedCaption = !hadMedia && draft.trim() ? draft.trim() : '';
		const added = files.map((file, i) => {
			const kind = inferMediaKind({
				content_type: file.type,
				name: file.name
			});
			const isMedia = kind === 'image' || kind === 'video';
			return {
				id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${i}`,
				file,
				previewUrl: isMedia ? URL.createObjectURL(file) : null,
				kind,
				caption: isMedia && i === 0 ? seedCaption : '',
				hd: uploadHd
			};
		});
		pendingFiles = [...pendingFiles, ...added];
		attachOpen = false;
		const media = pendingFiles.filter((f) => f.kind === 'image' || f.kind === 'video');
		if (!media.length) return;
		const newMedia = added.filter((a) => a.kind === 'image' || a.kind === 'video');
		if (!hadMedia) {
			mediaFocus = 0;
			draft = media[0]?.caption || '';
		} else if (newMedia.length) {
			const idx = media.findIndex((m) => m.id === newMedia[0].id);
			mediaFocus = idx >= 0 ? idx : media.length - 1;
			draft = media[mediaFocus]?.caption || '';
		}
	}

	/** @param {Event} e */
	function onFilesPicked(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = [...(input.files || [])];
		input.value = '';
		addPickedFiles(files);
	}

	/**
	 * @param {import('$lib/photos.js').PhotoItem} item
	 * @param {string | null} previewUrl
	 */
	function onPickLibrary(item, previewUrl) {
		const hadMedia = pendingMedia.length > 0;
		if (hadMedia) flushActiveCaption();
		const seedCaption = !hadMedia && draft.trim() ? draft.trim() : '';
		/** @type {PendingFile} */
		const added = {
			id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-lib`,
			file: null,
			previewUrl,
			kind: item.kind,
			caption: seedCaption,
			libraryPreview: Boolean(previewUrl),
			library: {
				path: item.path,
				content_type: mimeFromNameAndType(item.name, ''),
				kind: item.kind,
				name: item.name || t('photos.untitled'),
				bytes: 0,
				...(item.thumbPath ? { thumb_path: item.thumbPath } : {})
			}
		};
		pendingFiles = [...pendingFiles, added];
		attachOpen = false;
		const media = pendingFiles.filter((f) => f.kind === 'image' || f.kind === 'video');
		mediaFocus = Math.max(0, media.length - 1);
		draft = media[mediaFocus]?.caption || '';
	}

	function clearPendingFiles() {
		flushActiveCaption();
		for (const f of pendingFiles) {
			/* Shared media-cache URLs must not be revoked. */
			if (f.previewUrl && !f.libraryPreview) URL.revokeObjectURL(f.previewUrl);
		}
		pendingFiles = [];
		mediaFocus = 0;
		draft = '';
	}

	/** @param {number} mediaIndex */
	function removePendingMedia(mediaIndex) {
		flushActiveCaption();
		const target = pendingMedia[mediaIndex];
		if (!target) return;
		if (target.previewUrl && !target.libraryPreview) URL.revokeObjectURL(target.previewUrl);
		pendingFiles = pendingFiles.filter((f) => f.id !== target.id);
		const media = pendingFiles.filter((f) => f.kind === 'image' || f.kind === 'video');
		if (!media.length) {
			mediaFocus = 0;
			draft = '';
			return;
		}
		mediaFocus = Math.min(mediaIndex, media.length - 1);
		draft = media[mediaFocus]?.caption || '';
	}

	function resolvePubRef(/** @type {any | null} */ parent) {
		if (commentRef?.type && commentRef?.id) {
			return { ...commentRef };
		}
		if (parent && chatPublicationRefKey(parent) && parent.ref?.type && parent.ref?.id) {
			return { type: String(parent.ref.type), id: String(parent.ref.id) };
		}
		return null;
	}

	/**
	 * @param {{
	 *   body: string,
	 *   files: typeof pendingFiles,
	 *   parent: any | null,
	 *   pubRef: { type: string, id: string } | null
	 * }} opts
	 */
	async function sendOne(opts) {
		const session = activeSession();
		if (!session) throw new Error(t('settings.connectDriveFirst'));
		const files = opts.files;
		const localAtt = files.map((f) => ({
			kind: f.kind,
			name: f.file?.name || f.library?.name || 'file',
			bytes: f.file?.size ?? f.library?.bytes ?? 0,
			content_type: f.file?.type || f.library?.content_type || '',
			previewUrl: f.previewUrl,
			path: f.library?.path || `local:${f.file?.name || 'file'}`,
			...(f.caption?.trim() ? { caption: f.caption.trim() } : {})
		}));
		const isComment = Boolean(opts.pubRef);
		await postChatMessage({
			body: opts.body,
			kind: isComment ? 'comment' : 'chat',
			ref: opts.pubRef,
			reply_to: opts.parent?.id ?? null,
			...(isComment ? {} : { channel_id: channelId }),
			...(localAtt.length ? { attachments: localAtt } : {}),
			...(files.length
				? {
						resolveAttachments: async () =>
							Promise.all(
								files.map(async (f) => {
									if (f.library) {
										return {
											...f.library,
											previewUrl: f.previewUrl,
											...(f.caption?.trim() ? { caption: f.caption.trim() } : {})
										};
									}
									if (!f.file) throw new Error(t('chat.attachment'));
									const meta = await uploadChatAttachment(session, f.file, {
										hd: Boolean(f.hd)
									});
									return {
										...meta,
										previewUrl: f.previewUrl,
										...(f.caption?.trim() ? { caption: f.caption.trim() } : {})
									};
								})
							)
					}
				: {})
		});
	}

	async function send() {
		flushActiveCaption();
		const media = pendingFiles.filter((f) => f.kind === 'image' || f.kind === 'video');
		const docs = pendingFiles.filter((f) => f.kind !== 'image' && f.kind !== 'video');
		const textOnly = draft.trim();
		if (!textOnly && !media.length && !docs.length) return;

		const filesSnapshot = pendingFiles;
		pendingFiles = [];
		mediaFocus = 0;
		draft = '';
		wysiwygPainted = '';
		fieldTall = false;
		fadeTop = false;
		fadeBottom = false;
		if (inputEl) {
			inputEl.style.height = 'auto';
			if (inputEl.isContentEditable) inputEl.replaceChildren();
		}
		const parent = replyTo;
		replyTo = null;
		const pubRef = resolvePubRef(parent);

		try {
			for (const f of media) {
				await sendOne({
					body: (f.caption || '').trim(),
					files: [f],
					parent,
					pubRef
				});
			}
			if (docs.length) {
				await sendOne({
					body: media.length ? '' : textOnly,
					files: docs,
					parent,
					pubRef
				});
			} else if (textOnly && !media.length) {
				await sendOne({ body: textOnly, files: [], parent, pubRef });
			}
			inputEl?.focus();
			/* Focus can inject a caret <br> — strip so empty chrome stays single-line. */
			normalizeComposerEmpty(inputEl);
			resizeComposerField();
			onSent();
		} catch (e) {
			pendingFiles = filesSnapshot;
			chatUi.error = e instanceof Error ? e.message : String(e);
		}
	}

	function stopVoiceTick() {
		if (voiceTimer != null) {
			clearInterval(voiceTimer);
			voiceTimer = null;
		}
	}

	function stopVoiceMeter() {
		if (voiceMeterRaf != null) {
			cancelAnimationFrame(voiceMeterRaf);
			voiceMeterRaf = null;
		}
		voiceMeterLast = 0;
	}

	function startVoiceMeter() {
		stopVoiceMeter();
		const tickFn = (/** @type {number} */ now) => {
			voiceMeterRaf = requestAnimationFrame(tickFn);
			if (voicePaused) return;
			if (now - voiceMeterLast < 80) return;
			voiceMeterLast = now;
			const level = voiceRecorder.sampleLevel();
			const next = voiceBars.slice(1);
			/* Silence → 0 (rendered as dots); speak → 0..1 bar height. */
			next.push(level);
			voiceBars = next;
		};
		voiceMeterRaf = requestAnimationFrame(tickFn);
	}

	function startVoiceTick() {
		stopVoiceTick();
		voiceTimer = setInterval(() => {
			if (!voicePaused) voiceMs = voiceRecorder.elapsedMs();
		}, 100);
	}

	function clearHoldListeners() {
		if (typeof window === 'undefined') return;
		window.removeEventListener('pointermove', onHoldPointerMove, true);
		window.removeEventListener('pointerup', onHoldPointerUp, true);
		window.removeEventListener('pointercancel', onHoldPointerCancel, true);
		window.removeEventListener('touchmove', onHoldTouchMove, true);
		window.removeEventListener('pointerup', onDetachedHoldPointerUp, true);
		window.removeEventListener('touchend', onDetachedHoldTouchEnd, true);
	}

	/** @param {number | null} pointerId */
	function releaseHoldCapture(pointerId) {
		const el = voiceCaptureEl;
		if (!el || pointerId == null) return;
		try {
			if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
		} catch {
			/* ignore */
		}
	}

	function endVoiceGesture() {
		releaseHoldCapture(holdPointerId);
		clearHoldListeners();
		holdPointerId = null;
		holdPointerAlive = false;
		holdCaptureLost = false;
		voiceGestureActive = false;
		if (voiceCaptureEl) voiceCaptureEl.style.pointerEvents = 'none';
	}

	/** After pointercancel, listen for any finger-up as the real release. */
	function armDetachedHoldRelease() {
		if (typeof window === 'undefined') return;
		window.addEventListener('pointerup', onDetachedHoldPointerUp, true);
		window.addEventListener('touchend', onDetachedHoldTouchEnd, true);
	}

	/** @param {PointerEvent} e */
	function onDetachedHoldPointerUp(e) {
		if (!holdCaptureLost) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		finishHoldRelease(e.clientX, e.clientY);
	}

	/** @param {TouchEvent} e */
	function onDetachedHoldTouchEnd(e) {
		if (!holdCaptureLost) return;
		const t = e.changedTouches?.[0];
		if (!t) return;
		finishHoldRelease(t.clientX, t.clientY);
	}

	/**
	 * Block scroll / feed pan only while the finger is still down.
	 * After pointercancel, holdCaptureLost stays true for detached release —
	 * never keep preventDefault then, or the whole shell (nav / composer /
	 * feed) stays touch-dead until remount.
	 */
	/** @param {TouchEvent} e */
	function onHoldTouchMove(e) {
		if (!holdPointerAlive) return;
		e.preventDefault();
	}

	function stopVoicePreview() {
		if (voicePreviewAudio) {
			try {
				voicePreviewAudio.pause();
			} catch {
				/* ignore */
			}
			voicePreviewAudio = null;
		}
		if (voicePreviewUrl) {
			URL.revokeObjectURL(voicePreviewUrl);
			voicePreviewUrl = null;
		}
		voicePreviewPlaying = false;
	}

	function resetVoiceUi() {
		endVoiceGesture();
		holdReleaseIntent = null;
		voiceStarting = false;
		stopVoicePreview();
		voiceMode = 'idle';
		voiceMs = 0;
		voicePaused = false;
		voiceCancelArmed = false;
		voiceLockArmed = false;
		voiceDragX = 0;
		voiceDragY = 0;
		voiceBars = Array.from({ length: VOICE_BAR_COUNT }, () => 0);
		stopVoiceTick();
		stopVoiceMeter();
		if (signalPresence) signalRecording(channelId, false);
		/* Only restore if we were keeping an already-open keyboard. */
		restoreComposerKeyboardIfKept();
		holdKeepKeyboard = false;
	}

	function updateHoldGesture(/** @type {number} */ clientX, /** @type {number} */ clientY) {
		const dx = Math.max(-VOICE_CANCEL_MAX_PX, Math.min(0, clientX - holdOriginX));
		const dy = Math.max(-VOICE_LOCK_MAX_PX, Math.min(0, clientY - holdOriginY));
		voiceDragX = dx;
		voiceDragY = dy;
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);
		const cancel = dx <= -VOICE_CANCEL_ARM_PX && absX >= absY;
		const lock = dy <= -VOICE_LOCK_ARM_PX && absY > absX;
		voiceCancelArmed = cancel;
		voiceLockArmed = !cancel && lock;
	}

	async function beginHoldRecording() {
		if (canSend) return;
		voiceStarting = true;
		try {
			await voiceRecorder.start();
			const intent = holdReleaseIntent;
			holdReleaseIntent = null;
			voiceStarting = false;
			/*
			 * Quick release while getUserMedia was pending: honor send/cancel/lock
			 * instead of dropping the take. Only abort if the press vanished with
			 * no release intent and no soft-cancel (viewport) recovery path.
			 */
			if (!holdPointerAlive && !holdCaptureLost && !intent) {
				voiceRecorder.cancel();
				resetVoiceUi();
				return;
			}
			voiceMode = 'holding';
			voiceMs = 0;
			voicePaused = false;
			voiceCancelArmed = false;
			voiceLockArmed = false;
			voiceBars = Array.from({ length: VOICE_BAR_COUNT }, () => 0);
			if (signalPresence) signalRecording(channelId, true);
			startVoiceTick();
			startVoiceMeter();
			restoreComposerKeyboardIfKept();
			if (intent === 'cancel') {
				cancelVoiceRecording();
				return;
			}
			if (intent === 'lock') {
				lockVoiceRecording();
				return;
			}
			if (intent === 'send') {
				void finishVoiceRecording(true);
				return;
			}
		} catch (e) {
			voiceStarting = false;
			resetVoiceUi();
			voiceRecorder.cancel();
			const msg = e instanceof Error ? e.message : String(e);
			chatUi.error =
				msg === 'voice.unsupported' ? t('chat.voiceUnsupported') : t('chat.voiceMicDenied');
		}
	}

	/**
	 * Shared release path for pointerup and detached (post-cancel) finger-up.
	 * @param {number} clientX
	 * @param {number} clientY
	 */
	function finishHoldRelease(clientX, clientY) {
		const wasHolding = voiceMode === 'holding';
		const wasStarting = voiceStarting;
		updateHoldGesture(clientX, clientY);
		const cancel = voiceCancelArmed;
		const lock = voiceLockArmed;
		const intent = /** @type {'send' | 'cancel' | 'lock'} */ (
			cancel ? 'cancel' : lock ? 'lock' : 'send'
		);
		endVoiceGesture();
		if (wasHolding) {
			if (intent === 'cancel') {
				cancelVoiceRecording();
				return;
			}
			if (intent === 'lock') {
				lockVoiceRecording();
				return;
			}
			void finishVoiceRecording(true);
			return;
		}
		/* Still awaiting getUserMedia — stash intent for beginHoldRecording. */
		if (wasStarting) {
			holdReleaseIntent = intent;
			holdPointerAlive = false;
		}
	}

	function cancelVoiceRecording() {
		voiceRecorder.cancel();
		resetVoiceUi();
	}

	function lockVoiceRecording() {
		if (voiceMode !== 'holding') return;
		endVoiceGesture();
		voiceMode = 'locked';
		voiceCancelArmed = false;
		voiceLockArmed = false;
		voiceDragX = 0;
		voiceDragY = 0;
	}

	/** Parent scroll-FAB (or local fallback) calls this while locked. */
	export function toggleVoicePause() {
		if (!voiceLocked) return;
		if (voicePaused) {
			stopVoicePreview();
			voiceRecorder.resume();
			voicePaused = false;
		} else {
			voiceRecorder.pause();
			voicePaused = true;
			voiceMs = voiceRecorder.elapsedMs();
		}
	}

	function toggleVoicePreview() {
		if (!voiceLocked || !voicePaused) return;
		if (voicePreviewPlaying) {
			stopVoicePreview();
			return;
		}
		const blob = voiceRecorder.previewBlob();
		if (!blob || blob.size < 32) return;
		stopVoicePreview();
		voicePreviewUrl = URL.createObjectURL(blob);
		const audio = new Audio(voicePreviewUrl);
		voicePreviewAudio = audio;
		audio.onended = () => {
			if (voicePreviewAudio === audio) stopVoicePreview();
		};
		audio.onerror = () => {
			if (voicePreviewAudio === audio) stopVoicePreview();
		};
		voicePreviewPlaying = true;
		void audio.play().catch(() => stopVoicePreview());
	}

	async function finishVoiceRecording(/** @type {boolean} */ doSend) {
		const elapsed = voiceRecorder.elapsedMs();
		if (!doSend) {
			voiceRecorder.cancel();
			resetVoiceUi();
			return;
		}
		const result = await voiceRecorder.stop();
		resetVoiceUi();
		if (!result || elapsed < VOICE_MIN_MS || result.bytes < VOICE_MIN_BYTES) {
			chatUi.error = t('chat.voiceTooShort');
			return;
		}
		const session = activeSession();
		if (!session) {
			chatUi.error = t('settings.connectDriveFirst');
			return;
		}
		const parent = replyTo;
		replyTo = null;
		const pubRef = resolvePubRef(parent);
		const previewUrl = URL.createObjectURL(result.blob);
		const localAtt = {
			kind: 'voice',
			name: result.file.name,
			bytes: result.bytes,
			content_type: result.file.type,
			previewUrl,
			path: `local:${result.file.name}`,
			duration_ms: result.durationMs
		};
		try {
			await postChatMessage({
				body: '',
				kind: pubRef ? 'comment' : 'chat',
				ref: pubRef,
				reply_to: parent?.id ?? null,
				...(pubRef ? {} : { channel_id: channelId }),
				attachments: [localAtt],
				resolveAttachments: async () => {
					/* Force voice so .webm never lands under media/video as a misclassified clip. */
					const meta = await uploadChatAttachment(session, result.file, { kind: 'voice' });
					return [
						{
							...meta,
							kind: 'voice',
							content_type:
								meta.content_type ||
								result.file.type ||
								mimeFromNameAndType(result.file.name, 'audio/webm'),
							previewUrl,
							duration_ms: result.durationMs
						}
					];
				}
			});
			onSent();
		} catch (e) {
			chatUi.error = e instanceof Error ? e.message : String(e);
		}
	}

	/**
	 * Start hold-to-record without fighting the composer for focus.
	 * - Keyboard closed: stay closed (never focus() the CE from this path).
	 * - Keyboard open: stay open via preventDefault (mic never becomes
	 *   activeElement); blur recovery only if we already had kb+CE focus.
	 * Capture lives on a fixed non-focusable scrim so the idle→holding chrome
	 * swap can’t drop the gesture.
	 * @param {PointerEvent} e
	 */
	function onMicPointerDown(e) {
		if (canSend || voiceMode !== 'idle' || voiceStarting) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		/* Stop focus steal → keyboard close. Must run before any await. */
		e.preventDefault();
		e.stopPropagation();
		/*
		 * Snapshot before capture/chrome work. CE focused alone is not enough
		 * (iOS can leave focus after kb dismiss) — require a shrunk viewport.
		 * Never focus() here; that opens a closed keyboard.
		 */
		holdKeepKeyboard = isComposerActive() && isSoftKeyboardOpen();
		holdPointerId = e.pointerId;
		holdPointerAlive = true;
		holdCaptureLost = false;
		holdReleaseIntent = null;
		voiceGestureActive = true;
		if (voiceCaptureEl) voiceCaptureEl.style.pointerEvents = 'auto';
		holdOriginX = e.clientX;
		holdOriginY = e.clientY;
		voiceDragX = 0;
		voiceDragY = 0;
		voiceCancelArmed = false;
		voiceLockArmed = false;
		clearHoldListeners();
		window.addEventListener('pointermove', onHoldPointerMove, true);
		window.addEventListener('pointerup', onHoldPointerUp, true);
		window.addEventListener('pointercancel', onHoldPointerCancel, true);
		window.addEventListener('touchmove', onHoldTouchMove, { capture: true, passive: false });
		/*
		 * Capture on the body-level scrim so chrome swaps can’t drop the
		 * gesture; feed stays hit-inert under it. Scrim is tabindex=-1 /
		 * aria-hidden so it never steals CE focus.
		 */
		const target = voiceCaptureEl || /** @type {HTMLElement | null} */ (e.currentTarget);
		if (target) {
			try {
				target.setPointerCapture(e.pointerId);
			} catch {
				/* window capture-phase listeners still track the gesture */
			}
		}
		/* Blur recovery only — no unconditional focus after capture. */
		restoreComposerKeyboardIfKept();
		void beginHoldRecording();
	}

	/** @param {PointerEvent} e */
	function onHoldPointerMove(e) {
		if ((!holdPointerAlive && !holdCaptureLost) || e.pointerId !== holdPointerId) return;
		if (voiceMode !== 'holding' && voiceMode !== 'idle' && !voiceStarting) return;
		e.preventDefault();
		e.stopPropagation();
		updateHoldGesture(e.clientX, e.clientY);
	}

	/** @param {PointerEvent} e */
	function onHoldPointerUp(e) {
		if (e.pointerId !== holdPointerId) return;
		e.preventDefault();
		e.stopPropagation();
		finishHoldRelease(e.clientX, e.clientY);
		restoreComposerKeyboardIfKept();
	}

	/**
	 * Keyboard / visualViewport resize often cancels the pointer mid-hold.
	 * Don’t treat that as user-abort — keep recording and wait for a real
	 * finger-up (detached listeners). If none arrives, promote to locked so
	 * the take isn’t stranded without chrome controls.
	 *
	 * CRITICAL: drop the body-level capture scrim + touchmove preventDefault
	 * immediately. A prior path left those armed whenever voiceMode wasn’t
	 * already `holding` at the 320ms timeout (getUserMedia still pending) —
	 * that froze nav, composer, and feed scroll until a full remount.
	 * @param {PointerEvent} e
	 */
	function onHoldPointerCancel(e) {
		if (e.pointerId !== holdPointerId) return;
		e.preventDefault();
		e.stopPropagation();
		holdCaptureLost = true;
		holdPointerAlive = false;
		releaseHoldCapture(holdPointerId);
		/* Unlock chrome now — detached release still tracks finger-up. */
		voiceGestureActive = false;
		if (voiceCaptureEl) voiceCaptureEl.style.pointerEvents = 'none';
		window.removeEventListener('pointermove', onHoldPointerMove, true);
		window.removeEventListener('pointerup', onHoldPointerUp, true);
		window.removeEventListener('pointercancel', onHoldPointerCancel, true);
		window.removeEventListener('touchmove', onHoldTouchMove, true);
		armDetachedHoldRelease();
		restoreComposerKeyboardIfKept();
		const cancelGen = holdPointerId;
		window.setTimeout(() => {
			if (holdPointerId !== cancelGen) return;
			if (!holdCaptureLost) return;
			clearHoldListeners();
			voiceGestureActive = false;
			if (voiceCaptureEl) voiceCaptureEl.style.pointerEvents = 'none';
			if (voiceMode === 'holding') {
				holdCaptureLost = false;
				holdPointerId = null;
				lockVoiceRecording();
				return;
			}
			if (voiceStarting) {
				/* beginHoldRecording will honor lock once getUserMedia resolves. */
				holdReleaseIntent = holdReleaseIntent || 'lock';
				return;
			}
			endVoiceGesture();
		}, 320);
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

	/**
	 * One-line outer height from computed pad + line-height (tracks rem / --ui-scale).
	 * Used so empty and single-char drafts share the same footprint — a fixed px
	 * threshold (e.g. 28) falsely marked one line as “tall” and flipped chrome.
	 * @param {HTMLElement} el
	 */
	function singleLineInputHeight(el) {
		const styles = getComputedStyle(el);
		const lh = parseFloat(styles.lineHeight);
		const pt = parseFloat(styles.paddingTop) || 0;
		const pb = parseFloat(styles.paddingBottom) || 0;
		return pt + (Number.isFinite(lh) ? lh : 20) + pb;
	}

	function wysiwygOpts() {
		return { people: composerPeople, isDark };
	}

	function syncDraftFromWysiwyg() {
		const el = inputEl;
		if (!el || !el.isContentEditable || wysiwygApplying || wysiwygComposing) return;
		promoteComposerTokens(el, wysiwygOpts());
		/* Drop leftover <br>/ZWSP so empty CE matches first-open height metrics. */
		normalizeComposerEmpty(el);
		let wire = serializeComposer(el);
		if (isComposerWireEmpty(wire)) wire = '';
		wysiwygPainted = wire;
		if (wire !== draft) draft = wire;
	}

	function resizeComposerField() {
		const el = inputEl;
		if (!el) return;
		/* Measure with height:auto so scrollHeight reflects content, not a stale inline size. */
		el.style.height = 'auto';
		const next = Math.min(el.scrollHeight, COMPOSER_MAX_H);
		const single = singleLineInputHeight(el);
		const empty = isComposerWireEmpty(draft);
		/* Empty CE must never count as tall (lone <br> serializes to "\n"). */
		const tall =
			!empty && (next > single + COMPOSER_TALL_SLOP_PX || draft.includes('\n'));
		fieldTall = tall;
		/*
		 * Empty + single line: clear inline height so CSS (min-height + field-sizing)
		 * matches fresh open — setting scrollHeight as px was what jumped the row.
		 * Multi-line: pin height so the field grows and plus/send stay flex-end.
		 */
		el.style.height = tall ? `${next}px` : '';
		updateInputFade();
	}

	function onInput() {
		const el = inputEl;
		if (!el) return;
		if (el.isContentEditable && !wysiwygApplying) syncDraftFromWysiwyg();
		resizeComposerField();
		if (signalPresence && draft.trim()) signalTyping(channelId);
	}

	/** After blur, browsers often leave a caret `<br>` — strip so empty chrome stays centered. */
	function onComposerBlur() {
		/*
		 * During hold / starting with an already-open keyboard: restore focus
		 * so iOS doesn’t collapse it. Never restore when kb was closed at mic-down.
		 */
		if (holdKeepKeyboard && (voiceRecording || voiceStarting || voiceGestureActive || holdCaptureLost)) {
			restoreComposerKeyboardIfKept();
			return;
		}
		const el = inputEl;
		if (!el?.isContentEditable || wysiwygApplying || wysiwygComposing) return;
		if (!normalizeComposerEmpty(el) && !isComposerWireEmpty(draft)) return;
		if (draft !== '') draft = '';
		wysiwygPainted = '';
		resizeComposerField();
	}

	function onCompositionStart() {
		wysiwygComposing = true;
	}

	function onCompositionEnd() {
		wysiwygComposing = false;
		onInput();
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		/*
		 * Send = button or Cmd/Ctrl+Enter (desktop). Plain Enter inserts a
		 * newline in the contenteditable — never submits.
		 */
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void send();
			return;
		}
		if (e.key === 'Escape') {
			if (voiceRecording) {
				e.preventDefault();
				cancelVoiceRecording();
				return;
			}
			if (replyTo) {
				e.preventDefault();
				clearReply();
			}
		}
	}

	/** @param {ClipboardEvent} e */
	function onPaste(e) {
		const el = inputEl;
		if (!el?.isContentEditable) return;
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') ?? '';
		document.execCommand('insertText', false, text);
		onInput();
	}

	/** Keep CE in sync when parents set `draft` (suggest insert / clear after send). */
	$effect(() => {
		const el = inputEl;
		const raw = String(draft ?? '');
		const wire = isComposerWireEmpty(raw) ? '' : raw;
		if (!el?.isContentEditable) return;
		if (wysiwygApplying) return;
		if (wire === wysiwygPainted) {
			/* Parent cleared draft but CE still has empty chrome — strip it. */
			if (!wire && normalizeComposerEmpty(el)) queueMicrotask(() => resizeComposerField());
			return;
		}
		const cur = getComposerWireValue(el);
		if (cur === wire || (isComposerWireEmpty(cur) && !wire)) {
			if (!wire) normalizeComposerEmpty(el);
			wysiwygPainted = wire;
			queueMicrotask(() => resizeComposerField());
			return;
		}
		wysiwygApplying = true;
		renderComposerWire(el, wire, wysiwygOpts());
		wysiwygPainted = wire;
		wysiwygApplying = false;
		queueMicrotask(() => onInput());
	});

	$effect(() => {
		const el = inputEl;
		if (!el?.isContentEditable) return;
		installComposerTextareaShim(
			el,
			() => serializeComposer(el),
			(wire) => {
				draft = wire;
			}
		);
	});

	/** Parent can call after suggest-insert to resize the field. */
	export function afterSuggestInsert() {
		const el = inputEl;
		if (el?.isContentEditable) {
			const cursor =
				typeof el.selectionStart === 'number' ? el.selectionStart : String(draft ?? '').length;
			wysiwygApplying = true;
			renderComposerWire(el, String(draft ?? ''), wysiwygOpts());
			wysiwygPainted = String(draft ?? '');
			setComposerCursor(el, cursor);
			wysiwygApplying = false;
		}
		onInput();
	}

	/** Whether Escape was consumed (attach / voice / reply). */
	export function onParentEscape() {
		if (attachOpen) {
			closeAttach();
			return true;
		}
		if (voiceRecording) {
			cancelVoiceRecording();
			return true;
		}
		if (replyTo) {
			clearReply();
			return true;
		}
		return false;
	}

	onDestroy(() => {
		resetVoiceUi();
		voiceRecorder.cancel();
	});
</script>

<div
	class="composer-stack"
	class:voice-active={voiceRecording}
	class:voice-holding={voiceHolding}
	class:voice-locked={voiceLocked}
>
	<ChatComposer expanded={chromeExpanded}>
		{#if replyPreview}
			<div class="composer-quote-wrap">
				<div
					class="composer-quote"
					role="group"
					aria-label={t('chat.replyingTo', { name: replyPreview.name })}
				>
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
						aria-label={replyClearLabel}
						onclick={clearReply}>×</button
					>
				</div>
			</div>
		{/if}
		{#if showExpand}
			<div class="composer-expand">
				{#if attachOpen}
					<ChatAttachPanel
						open={true}
						items={attachItems}
						bind:tab={attachTab}
						bind:hd={uploadHd}
						onPickFiles={addPickedFiles}
						onPickLibrary={onPickLibrary}
						onClose={closeAttach}
					/>
				{:else}
					{#if pendingMedia.length}
						<ChatMediaStage
							items={pendingMedia}
							activeIndex={Math.min(mediaFocus, pendingMedia.length - 1)}
							onActiveIndex={setMediaFocus}
							onRemove={removePendingMedia}
							onAddMore={openAttachPhotos}
						/>
					{/if}
					{#if pendingDocs.length}
						<div class="attach-bar">
							{#each pendingDocs as f (f.id)}
								<span class="attach-chip">
									{f.file?.name || f.library?.name || t('chat.file')}
									<button
										type="button"
										class="attach-x"
										aria-label={t('chat.remove')}
										onclick={() => {
											if (f.previewUrl && !f.libraryPreview) URL.revokeObjectURL(f.previewUrl);
											pendingFiles = pendingFiles.filter((x) => x.id !== f.id);
										}}>×</button
									>
								</span>
							{/each}
							<button type="button" class="attach-clear" onclick={clearPendingFiles}
								>{t('chat.clear')}</button
							>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
		<div class="composer-body" class:expand-rule={showExpand}>
			<input
				bind:this={mediaInputEl}
				type="file"
				class="file-input"
				multiple
				accept="image/*,video/*"
				onchange={onFilesPicked}
			/>
			<input
				bind:this={fileInputEl}
				type="file"
				class="file-input"
				multiple
				accept=".pdf,.doc,.docx,.txt,.zip,application/pdf"
				onchange={onFilesPicked}
			/>

			<!--
				Voice chrome overlays the composer row; the contenteditable stays
				mounted + focused so iOS keeps the keyboard open. Unmounting the CE
				on idle→holding was dismissing the keyboard → visualViewport resize
				→ pointercancel → flaky release-to-send.
			-->
			{#if voiceRecording}
				<div
					class="composer-row voice-row"
					class:holding={voiceHolding}
					class:locked={voiceLocked}
					class:paused={voicePaused}
					class:cancel-armed={voiceCancelArmed}
					class:lock-armed={voiceLockArmed}
					class:chrome-expanded={chromeExpanded}
					aria-live="polite"
				>
					<div class="voice-pill">
						{#if voicePaused}
							<button
								type="button"
								class="voice-dot voice-dot-btn"
								class:playing={voicePreviewPlaying}
								aria-label={voicePreviewPlaying ? t('chat.pauseVoice') : t('chat.previewVoice')}
								onclick={toggleVoicePreview}
							>
								{#if voicePreviewPlaying}
									<Pause size={8} />
								{:else}
									<Play size={8} />
								{/if}
							</button>
						{:else}
							<span class="voice-dot" aria-hidden="true"></span>
						{/if}
						<span class="voice-time">{formatVoiceRecordTime(voiceMs)}</span>
						<div class="voice-wave" aria-hidden="true">
							{#each voiceBars as h, i (i)}
								{@const half = h < 0.04 ? 1 : Math.round(1 + h * 9)}
								<span class="voice-bar-col">
									<span class="voice-bar top" style:height="{half}px"></span>
									<span class="voice-bar bot" style:height="{half}px"></span>
								</span>
							{/each}
						</div>
					</div>
					{#if voiceLocked}
						<button
							type="button"
							class="hold-delete-pill"
							aria-label={t('common.delete')}
							onclick={cancelVoiceRecording}
						>
							<span class="voice-trash"><Trash size={15} /></span>
							<span class="hold-delete-label">{t('common.delete')}</span>
						</button>
					{:else}
						<div class="hold-delete-pill" class:armed={voiceCancelArmed} aria-hidden="true">
							<span class="voice-trash"><Trash size={15} /></span>
							<span class="hold-delete-label shimmer">{t('chat.slideToDelete')}</span>
						</div>
					{/if}
					<div class="mic-slot" class:holding={voiceHolding} class:locked={voiceLocked}>
						{#if voiceLocked}
							<button
								type="button"
								class="mic-glow locked"
								aria-label={t('chat.send')}
								onclick={() => void finishVoiceRecording(true)}
							>
								<span class="send-ico"><AlphaLogo size={22} /></span>
							</button>
						{:else}
							<div
								class="mic-glow holding"
								class:cancel={voiceCancelArmed}
								style:transform="translate(calc(50% + {voiceDragX}px), calc(50% + {voiceDragY}px))"
								aria-hidden="true"
							>
								<Voice size={26} />
							</div>
						{/if}
					</div>
				</div>
			{/if}
			<div
				class="composer-row"
				class:chrome-expanded={chromeExpanded}
				class:field-tall={fieldTall}
				class:voice-kb-park={voiceRecording}
			>
				<button
					type="button"
					class="side-btn plus"
					class:open={attachOpen}
					tabindex={voiceRecording ? -1 : 0}
					aria-label={t('chat.attach')}
					aria-expanded={attachOpen}
					onclick={toggleAttach}
				>
					<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<path
							d="M9 3.5v11M3.5 9h11"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
						/>
					</svg>
				</button>
				<div class="composer-field" class:fade-top={fadeTop} class:fade-bottom={fadeBottom}>
					<!--
						Placeholder is a sibling behind the CE (z-index) so the caret paints
						above it — ::before on the CE covered the caret when empty+focused.
					-->
					{#if !draft.trim()}
						<span class="composer-placeholder" aria-hidden="true">
							{pendingMedia.length
								? t('chat.addCaption')
								: replyTo
									? t('chat.reply')
									: t('chat.message')}
						</span>
					{/if}
					<!--
						Contenteditable WYSIWYG: custom emoji + @mentions paint as chips while
						`draft` stays wire-format (:shortcode: / @CompactName). Textarea-like
						shim keeps ComposerSuggest / voice focus() paths working.
					-->
					<div
						bind:this={inputEl}
						class="composer-input"
						class:is-empty={!draft.trim()}
						contenteditable="true"
						role="textbox"
						aria-multiline="true"
						onkeydown={onKey}
						oninput={onInput}
						onpaste={onPaste}
						onblur={onComposerBlur}
						oncompositionstart={onCompositionStart}
						oncompositionend={onCompositionEnd}
						onscroll={updateInputFade}
						aria-label={pendingMedia.length ? t('chat.addCaption') : t('chat.message')}
					></div>
				</div>
				{#if canSend}
					<button
						type="button"
						class="side-btn send"
						tabindex={voiceRecording ? -1 : 0}
						aria-label={t('chat.send')}
						onclick={() => void send()}
					>
						<span class="send-ico"><AlphaLogo size={18} /></span>
					</button>
				{:else}
					<button
						type="button"
						class="side-btn mic"
						tabindex="-1"
						aria-label={t('chat.voiceMessage')}
						title={t('chat.voiceMessage')}
						onpointerdown={onMicPointerDown}
						onmousedown={(e) => e.preventDefault()}
						ontouchstart={(e) => e.preventDefault()}
						oncontextmenu={(e) => e.preventDefault()}
					>
						<Voice size={22} />
					</button>
				{/if}
			</div>
		</div>
	</ChatComposer>
	{#if !externalVoiceFab && voiceRecording}
		{#if voiceHolding}
			<div class="scroll-fab voice-scroll-fab" class:armed={voiceLockArmed} aria-hidden="true">
				<Lock size={16} />
			</div>
		{:else if voiceLocked}
			<button
				type="button"
				class="scroll-fab voice-scroll-fab"
				aria-label={voicePaused ? t('chat.resumeVoice') : t('chat.pauseVoice')}
				onclick={toggleVoicePause}
			>
				{#if voicePaused}
					<Voice size={20} />
				{:else}
					<Pause size={16} />
				{/if}
			</button>
		{/if}
	{/if}
</div>

<style>
	.composer-stack {
		/*
		 * Single-line control height = composer-input pad + line-height.
		 * Must track rem/--ui-scale so plus, send/mic, wave pill, and delete
		 * share one padding box — fixed 33px left the rem-scaled field taller
		 * and idle→holding shrank the row (hold gesture slips off the mic).
		 */
		--composer-control-h: calc(0.375rem + 1.25rem + 0.4375rem);
		--composer-row-pad-y: 0.4375rem;
		--composer-row-h: calc(var(--composer-control-h) + 2 * var(--composer-row-pad-y));
		pointer-events: auto;
		position: relative;
		width: 100%;
		z-index: 5;
		display: flex;
		flex-direction: column;
		align-items: stretch;
	}

	/* Hold/lock glow + row pills may overflow the glass pill without growing it. */
	.composer-stack.voice-active :global(.composer-pill) {
		overflow: visible;
	}

	.composer-quote-wrap {
		padding: 0.5rem 0.5rem 0;
		box-sizing: border-box;
		position: relative;
		z-index: 2;
	}

	/* Shared expand slot (attach tabs XOR media stage) — sits in the composer family. */
	.composer-expand {
		position: relative;
		z-index: 2;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
	}

	/* Edge-to-edge rule between expand content and the message row (no L/R inset). */
	.composer-body.expand-rule {
		border-top: 1px solid var(--fg-8);
	}

	.composer-quote {
		display: flex;
		align-items: stretch;
		min-width: 0;
		width: 100%;
		border-radius: 0.5rem;
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
		padding: 0.25rem 0.5rem 0.3125rem;
	}

	.composer-quote-name {
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.composer-quote-text {
		font-size: 0.8125rem;
		line-height: 1.35;
		color: var(--fg-66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.composer-quote-clear {
		flex-shrink: 0;
		align-self: flex-start;
		width: var(--chrome-desk, 1.75rem);
		height: var(--chrome-desk, 1.75rem);
		display: grid;
		place-items: center;
		margin: 0.125rem 0.125rem 0 0;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-33);
		font-size: 1.125rem;
		line-height: 1;
		cursor: pointer;
	}

	.composer-body {
		display: block;
		position: relative;
		z-index: 2;
	}

	.composer-row {
		display: flex;
		/* Empty + single line: center plus / field / send together (same as fresh open). */
		align-items: center;
		gap: 0.4375rem;
		/* border-box: min-height includes pad — same chrome idle ↔ voice. */
		min-height: var(--composer-row-h);
		padding: var(--composer-row-pad-y);
		box-sizing: border-box;
		position: relative;
		z-index: 2;
	}

	/* Multi-line: field grows up; plus + send stay on the single-line baseline. */
	.composer-row.field-tall {
		align-items: flex-end;
	}

	.composer-row.chrome-expanded {
		padding-top: 0.25rem;
	}

	/*
	 * Park the CE under voice chrome without unmounting it. Must keep a real
	 * box (not display:none / 0×0) so iOS leaves the keyboard up. No aria-hidden
	 * — focusing inside aria-hidden can force blur on WebKit.
	 */
	.composer-row.voice-kb-park {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		opacity: 0;
		pointer-events: none;
		z-index: 0;
	}

	.side-btn {
		width: var(--composer-control-h);
		height: var(--composer-control-h);
		flex-shrink: 0;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 9999px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		box-sizing: border-box;
	}

	.side-btn.plus {
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		color: var(--fg-66);
		transition: transform 0.18s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.side-btn.plus.open {
		transform: rotate(45deg);
		color: var(--fg);
	}

	.side-btn.mic {
		background: transparent;
		color: var(--fg-33);
		-webkit-tap-highlight-color: transparent;
		touch-action: none;
		user-select: none;
		/* Never take focus — CE must stay focused so the keyboard stays up. */
		-webkit-user-select: none;
	}

	.side-btn.send {
		background: var(--gradient-accent-1);
		color: #fff;
	}

	.side-btn.send .send-ico,
	.mic-glow .send-ico {
		display: inline-flex;
		padding-bottom: 0.125rem;
		line-height: 0;
	}

	.composer-field {
		flex: 1;
		min-width: 0;
		max-height: 140px;
		display: flex;
		align-items: flex-end;
		position: relative;
		-webkit-mask-image: linear-gradient(#000, #000);
		mask-image: linear-gradient(#000, #000);
	}

	/* Sibling under the CE so caret paints above (never hidden behind placeholder). */
	.composer-placeholder {
		position: absolute;
		left: 0.25rem;
		right: 0.25rem;
		top: 0.375rem;
		z-index: 0;
		color: var(--fg-33);
		font-size: 0.9375rem;
		line-height: 1.25rem;
		pointer-events: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
		position: relative;
		z-index: 1;
		flex: 1;
		min-width: 0;
		width: 100%;
		min-height: 1.25rem;
		max-height: 8.75rem;
		margin: 0;
		padding: 0.375rem 0.25rem 0.4375rem;
		border: 0;
		outline: none;
		resize: none;
		overflow-y: auto;
		overflow-x: hidden;
		background: transparent;
		color: var(--fg);
		font: inherit;
		/* rem tracks mobile --ui-scale root (no CSS zoom). */
		font-size: 0.9375rem;
		line-height: 1.25rem;
		white-space: pre-wrap;
		word-break: break-word;
		caret-color: var(--fg);
		/* Contenteditable: match former textarea field-sizing feel. */
		field-sizing: content;
	}

	/* Empty: lock single-line footprint even if the engine briefly injects a caret <br>. */
	.composer-input.is-empty {
		min-height: 1.25rem;
		height: auto;
	}

	.composer-input :global(.ce-emoji) {
		display: inline-block;
		width: 1.25rem;
		height: 1.25rem;
		object-fit: contain;
		vertical-align: -0.25em;
		margin: 0 1px;
	}

	.composer-input :global(.ce-emoji-skel) {
		border-radius: 50%;
		background: var(--fg-8);
	}

	.composer-input :global(.ce-mention) {
		font-weight: 600;
		-webkit-text-fill-color: currentColor;
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
		gap: 0.375rem;
		padding: 0.5rem 0.625rem 0;
	}

	.attach-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 999px;
		background: var(--fg-8);
		font-size: 0.75rem;
		color: var(--fg-66);
	}

	.attach-x,
	.attach-clear {
		border: 0;
		background: transparent;
		color: var(--fg-33);
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
		padding: 0 0.125rem;
	}

	.voice-row {
		--voice-dot: 0.625rem;
		align-items: center;
		min-width: 0;
	}

	.voice-row.holding {
		touch-action: none;
		user-select: none;
	}

	.voice-pill {
		flex: 1 1 auto;
		min-width: 0;
		/* Same padding box as .side-btn.plus — no idle→holding vertical reflow. */
		height: var(--composer-control-h);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 0.75rem 0 0.71875rem;
		border-radius: 999px;
		background: var(--fg-8);
		box-sizing: border-box;
	}

	.voice-dot {
		flex: 0 0 auto;
		width: var(--voice-dot);
		height: var(--voice-dot);
		border-radius: 50%;
		/* Live mark = main accent (same family as unread dots), not rouge. */
		background: var(
			--gradient-accent-1,
			radial-gradient(circle at top left, #5c5fff 0%, #4542ff 100%)
		);
		box-shadow: 0 0 8px 2px color-mix(in srgb, var(--accent-1, #5c5fff) 40%, transparent);
		animation: voice-glow 1.05s ease-in-out infinite alternate;
		box-sizing: border-box;
	}

	/* Same footprint as the glowing dot — no extra padding that shrinks the wave. */
	button.voice-dot.voice-dot-btn {
		display: grid;
		place-items: center;
		padding: 0;
		margin: 0;
		border: 0;
		background: transparent;
		box-shadow: none;
		animation: none;
		color: var(--fg-66);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	button.voice-dot.voice-dot-btn.playing {
		color: var(--fg);
	}

	button.voice-dot.voice-dot-btn :global(.icon),
	button.voice-dot.voice-dot-btn :global(svg) {
		display: block;
	}

	@keyframes voice-glow {
		from {
			transform: scale(0.88);
			box-shadow: 0 0 5px 1px color-mix(in srgb, var(--accent-1, #5c5fff) 28%, transparent);
		}
		to {
			transform: scale(1.1);
			box-shadow: 0 0 12px 3px color-mix(in srgb, var(--accent-1, #5c5fff) 48%, transparent);
		}
	}

	.voice-time {
		flex: 0 0 auto;
		font: inherit;
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		letter-spacing: 0.01em;
		color: var(--fg-66);
	}

	.voice-wave {
		flex: 1 1 auto;
		min-width: 0;
		width: 100%;
		height: var(--chrome-icon, 1.375rem);
		display: flex;
		align-items: center;
		justify-content: stretch;
		gap: 1.5px;
		overflow: hidden;
		box-sizing: border-box;
	}

	.voice-bar-col {
		flex: 1 1 0;
		min-width: 1.5px;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: center;
		gap: 0;
	}

	.voice-bar {
		display: block;
		width: 100%;
		min-height: 1px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 28%, transparent);
	}

	.voice-bar.top {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.voice-bar.bot {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}

	.voice-row.paused .voice-bar {
		opacity: 0.55;
	}

	.voice-trash {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* Optical: trash can lid sits a hair high in the SVG box. */
		transform: translateY(1px);
		line-height: 0;
		color: var(--accent-3, var(--destructive, #c44));
	}

	/* Layout slot = plus hit size; glow overflows without growing the row. */
	.mic-slot {
		position: relative;
		width: var(--composer-control-h);
		height: var(--composer-control-h);
		flex-shrink: 0;
		align-self: center;
		z-index: 6;
	}

	.mic-glow {
		position: absolute;
		right: 50%;
		bottom: 50%;
		width: 64px;
		height: 64px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 999px;
		cursor: pointer;
		color: #fff;
		/* Main accent gradient — rouge only when slide-to-delete is armed. */
		background: var(--gradient-accent-1);
		box-shadow: 0 0 16px 4px color-mix(in srgb, var(--accent-1, #5c5fff) 38%, transparent);
		-webkit-tap-highlight-color: transparent;
		touch-action: none;
		user-select: none;
		transform: translate(50%, 50%);
		z-index: 6;
		transition:
			box-shadow 0.15s ease,
			background 0.15s ease;
	}

	.mic-glow.holding {
		pointer-events: none;
	}

	.mic-glow.holding.cancel {
		background: var(--gradient-accent-3);
		box-shadow: 0 0 18px 5px color-mix(in srgb, var(--accent-3, #c44) 48%, transparent);
	}

	.mic-glow.locked {
		width: 3.5rem;
		height: 3.5rem;
		background: var(--gradient-accent-1);
		box-shadow: 0 0 14px 3px color-mix(in srgb, var(--accent-1, #5c5fff) 32%, transparent);
	}

	/*
	 * Same row as wave pill — matching height/fill; full pill tucked under the mic
	 * slot so its right round aligns with the bar’s 7px inset (mic-slot right edge).
	 */
	.hold-delete-pill {
		flex: 0 0 auto;
		align-self: center;
		height: var(--composer-control-h);
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.4375rem;
		/* Right pad clears the 64px hold circle; negative margin fills mic-slot under it. */
		padding: 0 50px 0 14px;
		margin-right: calc(-1 * var(--composer-control-h));
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		box-sizing: border-box;
		pointer-events: none;
		white-space: nowrap;
		z-index: 4;
		transition: background 0.15s ease;
	}

	.voice-row.locked .hold-delete-pill {
		pointer-events: auto;
		cursor: pointer;
		/* Locked send glow is 56px — slightly less overhang than the hold circle. */
		padding-right: 3rem;
	}

	.hold-delete-pill.armed {
		background: color-mix(in srgb, var(--accent-3, #c44) 14%, var(--fg-8));
	}

	.hold-delete-label {
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1;
		color: var(--fg-33);
	}

	.hold-delete-label.shimmer {
		color: transparent;
		background-image: linear-gradient(
			90deg,
			var(--fg-16) 0%,
			var(--fg-33) 28%,
			var(--fg-66) 50%,
			var(--fg-33) 72%,
			var(--fg-16) 100%
		);
		background-size: 220% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		animation: delete-shimmer 1.35s ease-in-out infinite;
	}

	.hold-delete-pill.armed .hold-delete-label.shimmer {
		background-image: linear-gradient(
			90deg,
			color-mix(in srgb, var(--accent-3, #c44) 45%, transparent) 0%,
			var(--accent-3, #c44) 50%,
			color-mix(in srgb, var(--accent-3, #c44) 45%, transparent) 100%
		);
	}

	@keyframes delete-shimmer {
		0% {
			background-position: 100% 0;
		}
		100% {
			background-position: -100% 0;
		}
	}

	/*
	 * Fallback lock/pause FAB for hosts without a scroll-to-bottom control
	 * (e.g. CommentThread). Matches ChatChannelPanel `.scroll-fab` chrome.
	 */
	.scroll-fab.voice-scroll-fab {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.125rem);
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
		z-index: 8;
		box-sizing: border-box;
		transition:
			transform 0.22s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)),
			color 0.15s ease;
	}

	.scroll-fab.voice-scroll-fab::after {
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

	.scroll-fab.voice-scroll-fab.armed {
		color: var(--fg);
		animation: lock-pop 0.38s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	@keyframes lock-pop {
		0% {
			transform: scale(1);
		}
		45% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1.12);
		}
	}

	.scroll-fab.voice-scroll-fab :global(.icon),
	.scroll-fab.voice-scroll-fab :global(svg),
	.hold-delete-pill :global(.icon),
	.hold-delete-pill :global(svg) {
		flex-shrink: 0;
		position: relative;
		z-index: 1;
	}
</style>
