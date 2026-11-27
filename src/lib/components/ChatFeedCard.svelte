<script>
	/**
	 * Family chat bubble — Alpha Chat look.
	 * Mobile: tap or long-press → reaction/actions overlay.
	 * Desktop: right-click (or hover rail) → same overlay.
	 */
	import ChatBubbleOverlay from './ChatBubbleOverlay.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import Heart from './icons/Heart.svelte';
	import Reply from './icons/Reply.svelte';
	import { actor, asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		reactionsForMessage,
		retryChatMessage,
		softDeleteChatMessageUi,
		toggleReaction
	} from '$lib/chat.svelte.js';
	import { profileAccentCss, profileNameCss } from '$lib/color.js';
	import { emojiOnlyInfo, tokenizeChatBody } from '$lib/message-emoji.js';
	import { members } from '$lib/members.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import ChatEmoji from './ChatEmoji.svelte';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { getAttachmentObjectUrl } from '$lib/drive/media-cache.js';
	import { inferMediaKind } from '$lib/drive/media-kind.js';
	import { paintBlurhash } from '$lib/drive/media-preview.js';
	import ChatVoiceBubble from './ChatVoiceBubble.svelte';
	import { openMediaLightbox } from '$lib/media-lightbox.svelte.js';
	import { swipeLeftReply } from '$lib/swipe-left-reply.js';

	const REACTION_PFP_MAX = 3;
	/** @type {Record<string, string>} path → object URL for remote attachments */
	let attUrls = $state(/** @type {Record<string, string>} */ ({}));
	/** Soft fail counts — tip lag must not permanently stick on a filename chip. */
	let attFailCount = $state(/** @type {Record<string, number>} */ ({}));
	const ATT_FAIL_MAX = 6;

	/** @param {unknown} url */
	function isBlobPreview(url) {
		return typeof url === 'string' && url.startsWith('blob:');
	}

	/** @param {HTMLCanvasElement} node @param {string} hash */
	function mountBlurhash(node, hash) {
		void paintBlurhash(node, hash);
		return {
			/** @param {string} next */
			update(next) {
				void paintBlurhash(node, next);
			}
		};
	}

	/**
	 * @type {{
	 *   msg: any,
	 *   parent?: any | null,
	 *   when?: string,
	 *   onReply?: () => void,
	 *   onQuoteClick?: (parentId: string) => void,
	 *   stackFirst?: boolean,
	 *   stackLast?: boolean,
	 *   showAuthor?: boolean,
	 *   threaded?: boolean
	 * }}
	 */
	let {
		msg,
		parent = null,
		when = '',
		onReply,
		onQuoteClick,
		stackFirst = true,
		stackLast = true,
		showAuthor = true,
		threaded = false
	} = $props();

	let overlayOpen = $state(false);
	let overlayX = $state(0);
	let overlayY = $state(0);
	/** Explicit Select action — default bubbles suppress selection / callout. */
	let textSelectable = $state(false);
	/** @type {HTMLElement | undefined} */
	let bubbleEl = $state();
	/** @type {ReturnType<typeof setTimeout> | null} */
	let holdTimer = null;
	/** Long-press armed; overlay opens on pointerup (never under a still-down finger). */
	let holdArmed = false;
	let moved = false;
	/** @type {{ x: number, y: number } | null} */
	let holdOrigin = null;
	/** @type {number | null} */
	let activePointerId = null;
	const isDeleted = $derived(Boolean(msg?.deleted || msg?.deleted_at));

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	const person = $derived(asPerson(msg.author));
	const name = $derived(person?.name || displayNameFromEmail(msg.author));
	const parentPerson = $derived(parent ? asPerson(parent.author) : null);
	const parentName = $derived(
		parent ? parentPerson?.name || displayNameFromEmail(parent.author) : ''
	);
	const parentDeleted = $derived(
		Boolean(parent && (parent.deleted || parent.deleted_at || parent._deleted))
	);
	const isReply = $derived(Boolean(parent));
	const isMine = $derived.by(() => {
		const me = (actor.email || '').trim().toLowerCase();
		const author = String(msg.author || '').trim().toLowerCase();
		return Boolean(me && author && me === author);
	});
	/** Threaded layout (smaller left avatar) is incoming-only — never flip outgoing. */
	const useThreaded = $derived(Boolean(threaded) && !isMine);
	const reactions = $derived(reactionsForMessage(msg.id));
	/**
	 * sending = not on Drive yet (no check); sent = single ✓; read = double ✓✓ (other account).
	 * Self never counts toward ✓✓.
	 */
	const delivery = $derived.by(() => {
		if (msg._failed) return 'failed';
		if (msg._pending || msg.delivery === 'sending' || String(msg.id || '').startsWith('local-')) {
			return 'sending';
		}
		const me = (actor.email || '').trim().toLowerCase();
		const readBy = Array.isArray(msg.read_by)
			? msg.read_by.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
			: [];
		if (readBy.some((e) => e && e !== me)) return 'read';
		return 'sent';
	});
	/** Outgoing receipt: ✓ after server ack, ✓✓ when another account has seen. */
	const showReceipt = $derived(
		isMine && stackLast && (delivery === 'sent' || delivery === 'read')
	);
	/** Peers who have this message in their read_by (excludes self). */
	const seenByProfiles = $derived.by(() => {
		const me = (actor.email || '').trim().toLowerCase();
		const readBy = Array.isArray(msg.read_by) ? msg.read_by : [];
		/** @type {{ name: string, email: string }[]} */
		const out = [];
		const seen = new Set();
		for (const raw of readBy) {
			const email = String(raw || '')
				.trim()
				.toLowerCase();
			if (!email || email === me || seen.has(email)) continue;
			seen.add(email);
			const p = asPerson(email);
			out.push({ email, name: p?.name || displayNameFromEmail(email) });
		}
		return out;
	});

	const hasAttachments = $derived(
		Array.isArray(msg.attachments) && msg.attachments.length > 0
	);
	/** Body shown under media as caption — skip duplicate text block. */
	const bodyMirroredInCaptions = $derived.by(() => {
		const body = String(msg.body || '').trim();
		if (!body || !Array.isArray(msg.attachments) || msg.attachments.length !== 1) return false;
		const att = msg.attachments[0];
		if (inferMediaKind(att) === 'file') return false;
		const cap = String(att?.caption || '').trim();
		return !cap || cap === body;
	});
	/** 1–3 emoji body → large glyphs (quote chrome does not disqualify). */
	const emojiOnly = $derived.by(() => {
		if (hasAttachments) return null;
		return emojiOnlyInfo(msg.body);
	});
	/** Transparent sticker shell — only when there is no quote to host. */
	const emojiSticker = $derived(Boolean(emojiOnly) && !isReply);
	const bodyTokens = $derived.by(() => {
		members.length;
		const people = members.map((m) => ({
			email: String(m.email || ''),
			name: String(m.name || displayNameFromEmail(m.email) || '')
		}));
		return tokenizeChatBody(msg.body, { people });
	});
	const emojiOnlyPx = $derived(
		emojiOnly?.count === 1 ? 56 : emojiOnly?.count === 2 ? 48 : 40
	);

	function nameColor(email, label) {
		return profileNameCss(email, label, isDark);
	}

	function accentRgb(email, label) {
		return profileAccentCss(email, label);
	}

	function preview(text, max = 80) {
		const plain = String(text || '')
			.replace(/\s+/g, ' ')
			.trim();
		if (plain.length <= max) return plain;
		return `${plain.slice(0, max).trim()}…`;
	}

	/** @param {string} emoji */
	function onReact(emoji) {
		/* Close first; toggleReaction paints the chip synchronously before Drive. */
		overlayOpen = false;
		void toggleReaction(msg.id, emoji).catch(() => {
			/* feed will show failure on next refresh */
		});
	}

	/** @param {number} x @param {number} y */
	function openOverlayAt(x, y) {
		if (isDeleted) return;
		textSelectable = false;
		overlayX = x;
		overlayY = y;
		/* Open synchronously — avoid a frame of empty overlay before place. */
		overlayOpen = true;
	}

	/**
	 * Voice play/wave/speed: short tap runs the control; long-press still opens
	 * the message-actions overlay (see data-voice-control + pointerup branch).
	 * @param {EventTarget | null} target
	 */
	function isVoiceControlTarget(target) {
		return target instanceof Element && Boolean(target.closest('[data-voice-control]'));
	}

	/**
	 * Retry / quote / media controls / links must win over the reaction overlay.
	 * Voice controls are excluded so the bubble can arm a long-press.
	 * @param {EventTarget | null} target
	 */
	function isBubbleInteractiveTarget(target) {
		if (!(target instanceof Element)) return false;
		if (isVoiceControlTarget(target)) return false;
		return Boolean(
			target.closest(
				'a, button, input, textarea, select, audio, video, label, [data-bubble-action], [contenteditable="true"]'
			)
		);
	}

	/** Soft keyboard + composer CE focused — keep open when arming message actions. */
	function isComposerFocused() {
		if (typeof document === 'undefined') return false;
		const ae = document.activeElement;
		if (!(ae instanceof HTMLElement)) return false;
		return Boolean(ae.isContentEditable || ae.closest?.('.composer-input, .composer-stack'));
	}

	function clearHold() {
		if (holdTimer != null) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	function resetGesture() {
		clearHold();
		holdOrigin = null;
		holdArmed = false;
		moved = false;
		activePointerId = null;
	}

	/** @param {PointerEvent} e */
	function onBubblePointerDown(e) {
		if (isDeleted) return;
		if (isBubbleInteractiveTarget(e.target)) return;
		if (e.pointerType === 'mouse') return;
		if (textSelectable) return;
		/*
		 * Keep the slid-out keyboard: touching the bubble would otherwise blur
		 * the composer CE. preventDefault stops that focus steal (same as mic).
		 */
		if (e.cancelable && isComposerFocused()) {
			e.preventDefault();
		}
		holdArmed = false;
		moved = false;
		holdOrigin = { x: e.clientX, y: e.clientY };
		activePointerId = e.pointerId;
		/*
		 * Never capture on voice controls — setPointerCapture on the card steals
		 * the play/wave button’s click, so the actions overlay “wins” the tap.
		 * Wave scrubbing captures on the wave element itself.
		 */
		if (!isVoiceControlTarget(e.target)) {
			try {
				e.currentTarget?.setPointerCapture?.(e.pointerId);
			} catch {
				/* ignore */
			}
		}
		clearHold();
		const sx = e.clientX;
		const sy = e.clientY;
		holdTimer = setTimeout(() => {
			holdArmed = true;
			holdTimer = null;
			/* Suppress iOS callout / selection — open happens on pointerup. */
			try {
				window.getSelection()?.removeAllRanges();
			} catch {
				/* ignore */
			}
			if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
				try {
					navigator.vibrate(8);
				} catch {
					/* ignore */
				}
			}
			/* Keep last coords if finger drifted slightly while holding. */
			holdOrigin = { x: sx, y: sy };
		}, 420);
	}

	/** @param {PointerEvent} e */
	function onBubblePointerUp(e) {
		if (activePointerId != null && e.pointerId !== activePointerId) return;
		const wasHold = holdArmed;
		const wasMoved = moved;
		const ox = holdOrigin?.x ?? e.clientX;
		const oy = holdOrigin?.y ?? e.clientY;
		try {
			e.currentTarget?.releasePointerCapture?.(e.pointerId);
		} catch {
			/* ignore */
		}
		resetGesture();
		if (e.pointerType === 'mouse' || isDeleted) return;
		if (textSelectable) return;
		if (isBubbleInteractiveTarget(e.target)) return;
		/*
		 * Voice controls: short tap → let the control’s click handler run.
		 * Long-press → open message actions (control click is suppressed by duration).
		 */
		if (isVoiceControlTarget(e.target)) {
			if (wasHold) openOverlayAt(ox, oy);
			return;
		}
		/*
		 * Open on pointerup only — tap OR long-press. Never open under a still-down
		 * finger (that was landing accidental reactions on the first release).
		 */
		if (wasHold || !wasMoved) openOverlayAt(ox, oy);
	}

	/** @param {PointerEvent} e */
	function onBubblePointerMove(e) {
		if (!holdOrigin) return;
		if (activePointerId != null && e.pointerId !== activePointerId) return;
		const dx = e.clientX - holdOrigin.x;
		const dy = e.clientY - holdOrigin.y;
		if (dx * dx + dy * dy > 100) {
			moved = true;
			clearHold();
			holdArmed = false;
		}
	}

	function onBubblePointerCancel() {
		resetGesture();
	}

	/** @param {MouseEvent} e */
	function onBubbleContextMenu(e) {
		if (textSelectable) return;
		if (isBubbleInteractiveTarget(e.target)) return;
		e.preventDefault();
		if (isDeleted) return;
		openOverlayAt(e.clientX, e.clientY);
	}

	function handleReply() {
		overlayOpen = false;
		onReply?.();
	}

	async function handleCopy() {
		const text = String(msg?.body || '').trim();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			/* fallback */
			try {
				const ta = document.createElement('textarea');
				ta.value = text;
				ta.setAttribute('readonly', '');
				ta.style.position = 'fixed';
				ta.style.opacity = '0';
				document.body.appendChild(ta);
				ta.select();
				document.execCommand('copy');
				ta.remove();
			} catch {
				/* ignore */
			}
		}
	}

	function handleSelect() {
		textSelectable = true;
		overlayOpen = false;
		queueMicrotask(() => {
			const el = bubbleEl;
			if (!el) return;
			const range = document.createRange();
			range.selectNodeContents(el);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
		});
	}

	async function handleDelete() {
		overlayOpen = false;
		try {
			await softDeleteChatMessageUi(msg.id);
		} catch {
			/* chatUi.error set in helper */
		}
	}

	/** @param {number} startIndex */
	function openMessageMedia(startIndex) {
		const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
		/** @type {import('$lib/media-lightbox.svelte.js').MediaLightboxItem[]} */
		const list = [];
		let focus = 0;
		atts.forEach((att, i) => {
			const kind = inferMediaKind(att);
			if (kind !== 'image' && kind !== 'video') return;
			const path = String(att.path || '');
			const url =
				(path && attUrls[path]) || att.previewUrl || att.url || '';
			list.push({
				id: `${msg.id}:${path || i}`,
				kind,
				name: String(att.name || (kind === 'video' ? t('chat.video') : t('chat.image'))),
				path: path || undefined,
				url: url || undefined,
				previewUrl: att.previewUrl || undefined
			});
			if (i === startIndex) focus = list.length - 1;
		});
		openMediaLightbox(list, focus);
	}

	$effect(() => {
		const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
		const session = activeSession();
		/*
		 * Tip lag / peer replication can fail the first few fetches. Voice must
		 * never stick on a filename chip — keep retrying past ATT_FAIL_MAX with
		 * a capped backoff. Image/video still soft-cap so broken media falls back.
		 */
		const need = atts.filter((a) => {
			const path = String(a?.path || '');
			if (!path || path.startsWith('local:')) return false;
			if (attUrls[path]) return false;
			const kind = inferMediaKind(a);
			if (kind === 'file') return false;
			if (kind !== 'voice' && (attFailCount[path] || 0) >= ATT_FAIL_MAX) return false;
			/* Non-blob remote URL already displayable — skip fetch. blob: still needs Drive resolve. */
			if (a.url && !isBlobPreview(a.url)) return false;
			return true;
		});
		if (!session || !need.length) return;
		const ac = new AbortController();
		for (const a of need) {
			const path = String(a.path);
			const kind = inferMediaKind(a);
			const run = async () => {
				let attempt = attFailCount[path] || 0;
				const maxAttempts = kind === 'voice' ? 40 : ATT_FAIL_MAX;
				while (attempt < maxAttempts) {
					if (ac.signal.aborted || attUrls[path]) return;
					const res = await getAttachmentObjectUrl(session, a, { signal: ac.signal });
					if (ac.signal.aborted) return;
					if (res?.url) {
						attUrls = { ...attUrls, [path]: res.url };
						if (attFailCount[path]) {
							const next = { ...attFailCount };
							delete next[path];
							attFailCount = next;
						}
						return;
					}
					attempt += 1;
					attFailCount = { ...attFailCount, [path]: attempt };
					const wait = Math.min(kind === 'voice' ? 12_000 : 10_000, 400 * 2 ** Math.min(attempt, 5));
					await new Promise((r) => setTimeout(r, wait));
				}
			};
			void run();
		}
		return () => {
			ac.abort();
			/* object URLs are owned by media-cache — do not revoke here */
		};
	});
</script>

<article
	class="card desktop-bubble-actions-target"
	class:mine={isMine}
	class:threaded={useThreaded}
	class:failed={msg._failed}
	class:deleted={isDeleted}
	class:stack-first={stackFirst}
	class:stack-last={stackLast}
	class:stack-mid={!stackFirst && !stackLast}
	data-chat-bubble={msg.id}
	use:swipeLeftReply={{ onReply: isDeleted ? () => {} : handleReply }}
>
	{#if !isMine}
		<div class="avatar-wrap" class:hidden-slot={!stackLast} class:threaded={useThreaded}>
			{#if stackLast}
				<ProfilePic
					name={name}
					email={msg.author}
					pictureUrl={pictureUrlFor(msg.author)}
					size={useThreaded ? 26 : 34}
				/>
			{/if}
		</div>
	{/if}

	<div class="bubble-trailing">
		<div class="bubble-stack">
			{#if isDeleted}
				<div
					class="bubble deleted-bubble"
					class:mine={isMine}
					class:stack-first={stackFirst}
					class:stack-last={stackLast}
					class:stack-mid={!stackFirst && !stackLast}
					role="group"
					aria-label={t('chat.deletedMessage')}
				>
					<p class="deleted-text">{t('chat.deletedMessage')}</p>
				</div>
			{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={bubbleEl}
				class="bubble"
				class:quoted={isReply}
				class:mine={isMine}
				class:emoji-only={emojiSticker}
				class:stack-first={stackFirst}
				class:stack-last={stackLast}
				class:stack-mid={!stackFirst && !stackLast}
				class:selectable={textSelectable}
				onpointerdown={onBubblePointerDown}
				onpointerup={onBubblePointerUp}
				onpointermove={onBubblePointerMove}
				onpointercancel={onBubblePointerCancel}
				oncontextmenu={onBubbleContextMenu}
				role="group"
				aria-label={isMine ? t('chat.yourMessage') : t('chat.messageFrom', { name })}
			>
			{#if showAuthor && stackFirst && !emojiSticker && !isMine}
				<div class="bubble-head">
					<span class="author" style:color={nameColor(msg.author, name)}>{name}</span>
					{#if when}<span class="when">{when}</span>{/if}
				</div>
			{/if}
			{#if parent}
				<button
					type="button"
					class="quote"
					class:deleted={parentDeleted}
					data-bubble-action="quote"
					aria-label={parentDeleted
						? t('chat.deletedMessage')
						: `${t('chat.jumpToMessage')}: ${parentName}`}
					onpointerdown={(e) => e.stopPropagation()}
					onpointerup={(e) => e.stopPropagation()}
					onclick={(e) => {
						e.stopPropagation();
						onQuoteClick?.(String(parent.id));
					}}
				>
					<div
						class="quote-bar"
						style:background={parentDeleted
							? undefined
							: accentRgb(parent.author, parentName)}
						aria-hidden="true"
					></div>
					<div class="quote-body">
						{#if parentDeleted}
							<span class="quote-text deleted">{t('chat.deletedMessage')}</span>
						{:else}
							<span class="quote-name" style:color={nameColor(parent.author, parentName)}
								>{parentName}</span
							>
							<span class="quote-text">{preview(parent.body)}</span>
						{/if}
					</div>
				</button>
			{/if}
			{#if Array.isArray(msg.attachments) && msg.attachments.length}
				<div class="attachments">
					{#each msg.attachments as att, ai (att.path || att.name || ai)}
						{@const mediaKind = inferMediaKind(att)}
						{@const src =
							(att.path && attUrls[att.path]) || att.previewUrl || att.url || ''}
						{@const exhausted =
							mediaKind !== 'voice' &&
							Boolean(att.path) &&
							(attFailCount[att.path] || 0) >= ATT_FAIL_MAX &&
							!attUrls[att.path] &&
							!att.previewUrl &&
							!att.url}
						{@const caption =
							String(att.caption || '').trim() ||
							(msg.attachments.length === 1 &&
							mediaKind !== 'file' &&
							bodyMirroredInCaptions
								? String(msg.body || '').trim()
								: '')}
						<div class="att-block">
							{#if mediaKind === 'image' && src}
								<button
									type="button"
									class="att-media-btn"
									aria-label={att.name || t('chat.image')}
									onclick={(e) => {
										e.stopPropagation();
										openMessageMedia(ai);
									}}
								>
									<img class="att-image" src={src} alt="" loading="lazy" />
								</button>
							{:else if mediaKind === 'video' && src}
								<button
									type="button"
									class="att-media-btn"
									aria-label={att.name || t('chat.video')}
									onclick={(e) => {
										e.stopPropagation();
										openMessageMedia(ai);
									}}
								>
									<video class="att-video" src={src} muted playsinline preload="metadata"></video>
									<span class="att-play" aria-hidden="true">
										<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
											<path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
										</svg>
									</span>
								</button>
							{:else if mediaKind === 'voice' && src}
								<ChatVoiceBubble
									msgId={`${msg.id}:${att.path || ai}`}
									{src}
									isMine={isMine}
									durationMs={typeof att.duration_ms === 'number' ? att.duration_ms : 0}
									author={msg.author || ''}
									speakerName={name}
									name={att.name || t('chat.voiceMessage')}
									onRequestActions={(x, y) => openOverlayAt(x, y)}
								/>
							{:else if mediaKind === 'voice'}
								<!-- Never fall through to a filename chip — keep a voice-shaped loader. -->
								<div
									class="att-media-loading voice"
									aria-busy="true"
									aria-label={t('chat.loadingMedia')}
								></div>
							{:else if mediaKind !== 'file' && !exhausted}
								<div
									class="att-media-loading"
									class:image={mediaKind === 'image'}
									class:video={mediaKind === 'video'}
									aria-busy="true"
									aria-label={t('chat.loadingMedia')}
								>
									{#if att.blurhash}
										<canvas
											class="att-blur"
											aria-hidden="true"
											use:mountBlurhash={att.blurhash}
										></canvas>
									{/if}
								</div>
							{:else}
								<div class="att-file">
									<span class="att-name">{att.name || att.kind || t('chat.file')}</span>
									{#if att.bytes}
										<span class="att-size">{Math.round(att.bytes / 1024)} KB</span>
									{/if}
								</div>
							{/if}
							{#if caption}
								<p class="att-caption">{caption}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if emojiOnly}
				<p class="text emoji-only-text" style:--emoji-size="{emojiOnlyPx}px">
					{#each emojiOnly.tokens as tok, i (tok + i)}
						<ChatEmoji token={tok} size={emojiOnlyPx} className="sticker" />
					{/each}
				</p>
			{:else if msg.body && !bodyMirroredInCaptions}
				<p class="text">
					{#each bodyTokens as tok, i (`${tok.type}-${i}`)}
						{#if tok.type === 'text'}
							{tok.value}
						{:else if tok.type === 'link'}
							<a
								class="msg-link"
								href={tok.href}
								target="_blank"
								rel="noopener noreferrer"
								>{tok.value}</a
							>
						{:else if tok.type === 'mention'}
							<span
								class="mention"
								style:color={nameColor(tok.email || '', tok.label || tok.value)}
								>{tok.value}</span
							>
						{:else}
							<ChatEmoji token={tok.value} size={18} />
						{/if}
					{/each}
				</p>
			{/if}
			{#if isMine && stackLast && !emojiSticker && (showReceipt || when)}
				<div class="meta-out">
					{#if when}<span class="when">{when}</span>{/if}
					{#if showReceipt}
						<span
							class="receipt"
							class:read={delivery === 'read'}
							title={delivery === 'read' ? t('chat.read') : t('chat.sent')}
							aria-label={delivery === 'read' ? t('chat.read') : t('chat.sent')}
						>
							{#if delivery === 'read'}
								<svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
									<path
										d="M1.2 5.2 3.6 7.6 8.8 1.6M6.2 5.2 8.6 7.6 14.2 1.6"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
									<path
										d="M1.2 5.2 4.1 8.1 10.6 1.5"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{/if}
						</span>
					{/if}
				</div>
			{/if}
			{#if msg._failed && !emojiSticker}
				<button
					type="button"
					class="fail-retry"
					data-bubble-action="retry"
					onpointerdown={(e) => e.stopPropagation()}
					onpointerup={(e) => e.stopPropagation()}
					onclick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						void retryChatMessage(msg).catch(() => {});
					}}>{t('chat.sendFailed')}</button
				>
			{/if}

			</div>
			{/if}

			{#if isMine && stackLast && emojiSticker && (showReceipt || when)}
				<div class="meta-out meta-out-sticker">
					{#if when}<span class="when">{when}</span>{/if}
					{#if showReceipt}
						<span
							class="receipt"
							class:read={delivery === 'read'}
							title={delivery === 'read' ? t('chat.read') : t('chat.sent')}
							aria-label={delivery === 'read' ? t('chat.read') : t('chat.sent')}
						>
							{#if delivery === 'read'}
								<svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
									<path
										d="M1.2 5.2 3.6 7.6 8.8 1.6M6.2 5.2 8.6 7.6 14.2 1.6"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
									<path
										d="M1.2 5.2 4.1 8.1 10.6 1.5"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{/if}
						</span>
					{/if}
				</div>
			{/if}
			{#if msg._failed && emojiSticker}
				<button
					type="button"
					class="fail-retry fail-retry-sticker"
					data-bubble-action="retry"
					onpointerdown={(e) => e.stopPropagation()}
					onpointerup={(e) => e.stopPropagation()}
					onclick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						void retryChatMessage(msg).catch(() => {});
					}}>{t('chat.sendFailed')}</button
				>
			{/if}

			{#if !isDeleted && reactions.length}
				<div class="reaction-pills" role="list">
					{#each reactions as r (r.emoji)}
						<button
							type="button"
							class="reaction-pill"
							class:mine={r.mine}
							role="listitem"
							aria-label={r.mine
								? t('chat.removeReaction', { emoji: r.emoji })
								: `${r.emoji} ${r.count}`}
							onclick={() => void onReact(r.emoji)}
						>
							<span class="emoji"><ChatEmoji token={r.emoji} size={16} /></span>
							{#if r.count <= REACTION_PFP_MAX}
								<span class="reactors" aria-hidden="true">
									{#each r.authors.slice(0, REACTION_PFP_MAX) as email, i (email)}
										{@const rp = asPerson(email)}
										{@const rn = rp?.name || displayNameFromEmail(email)}
										<span class="reactor" style:z-index={REACTION_PFP_MAX - i}>
											<ProfilePic
												name={rn}
												email={email}
												pictureUrl={pictureUrlFor(email)}
												size={20}
												bare
											/>
										</span>
									{/each}
								</span>
							{:else}
								<span class="count">{r.count}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if !isDeleted}
			<div class="action-rail" role="group" aria-label={t('chat.messageActions')}>
				<button
					type="button"
					class="rail-btn"
					aria-label={t('chat.react')}
					aria-expanded={overlayOpen}
					onclick={(e) => {
						e.stopPropagation();
						const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
						openOverlayAt(r.left + r.width / 2, r.top);
					}}
				>
					<Heart size={14} />
				</button>
				<button
					type="button"
					class="rail-btn"
					aria-label={t('chat.reply')}
					onclick={(e) => {
						e.stopPropagation();
						handleReply();
					}}
				>
					<Reply size={14} />
				</button>
			</div>
		{/if}
	</div>
</article>

<ChatBubbleOverlay
	open={overlayOpen}
	x={overlayX}
	y={overlayY}
	canDelete={isMine}
	seenBy={seenByProfiles}
	onclose={() => (overlayOpen = false)}
	onreact={(emoji) => void onReact(emoji)}
	onreply={handleReply}
	oncopy={String(msg?.body || '').trim() ? () => void handleCopy() : null}
	onselect={() => handleSelect()}
	ondelete={isMine ? () => void handleDelete() : null}
/>

<style>
	.card {
		display: flex;
		gap: 6px;
		align-items: flex-end;
		width: 100%;
		position: relative;
		touch-action: pan-y;
	}

	.card.swipe-replying {
		z-index: 3;
	}

	.card.stack-mid,
	.card:not(.stack-first):not(.stack-last) {
		margin-top: 2px;
	}

	.card.stack-last:not(.stack-first) {
		margin-top: 2px;
	}

	.card.stack-first {
		margin-top: 10px;
	}

	/* Reaction row participates in layout (multi-line wrap gets real space). */
	.card:has(.reaction-pills) {
		margin-bottom: 4px;
	}

	.card.mine:not(.threaded) {
		flex-direction: row-reverse;
		justify-content: flex-start;
	}

	.card.failed .text {
		opacity: 0.7;
	}

	.bubble.deleted-bubble {
		background: var(--fg-4) !important;
		color: var(--fg-33);
		padding: 8px 12px;
		min-height: 0;
		box-shadow: none;
	}

	.bubble.deleted-bubble.mine {
		background: var(--fg-4) !important;
	}

	.deleted-text {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg-33);
		line-height: 1.3;
	}

	.avatar-wrap {
		flex-shrink: 0;
		width: 34px;
		line-height: 0;
		align-self: flex-end;
	}

	/* Publication-panel comments: 26px incoming avatar (tip icons stay 22). */
	.avatar-wrap.threaded {
		width: 26px;
	}

	.avatar-wrap.hidden-slot {
		visibility: hidden;
	}

	.bubble-trailing {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		min-width: 0;
		max-width: calc(100% - 40px);
	}

	/* Voice rows: ~80% of the card, capped at 400px on desktop. */
	.card:has(:global(.voice)) .bubble-trailing {
		width: min(400px, 80%);
	}

	.card:has(:global(.voice)) .bubble-stack,
	.bubble:has(:global(.voice)) {
		width: 100%;
		max-width: 100%;
	}

	.card.threaded .bubble-trailing {
		max-width: calc(100% - 32px);
	}

	.card.mine:not(.threaded) .bubble-trailing {
		flex-direction: row-reverse;
		max-width: 100%;
	}

	.bubble-stack {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		max-width: 100%;
	}

	.card.mine:not(.threaded) .bubble-stack {
		align-items: flex-end;
	}

	.bubble {
		position: relative;
		z-index: 0;
		width: fit-content;
		max-width: min(85vw, 100%);
		/* Vertical shell only — text vs quote use different horizontal insets (Alpha Chat). */
		padding: 6px 0 7px;
		border: 0;
		border-radius: 16px 16px 16px 4px;
		background: var(--bubble-bg, color-mix(in srgb, var(--fg) 12%, transparent));
		color: inherit;
		text-align: left;
		font: inherit;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
		touch-action: manipulation;
	}

	.bubble.selectable {
		-webkit-touch-callout: default;
		-webkit-user-select: text;
		user-select: text;
	}

	.bubble.mine {
		border-radius: 16px 16px 4px 16px;
		background: var(--gradient-accent-1);
		color: #fff;
		padding-bottom: 4px;
	}

	/* Threaded comments: left tail even when mine (Zapstore forum). */
	.card.threaded .bubble.mine {
		border-radius: 16px 16px 16px 4px;
	}

	.card.threaded .bubble.mine.stack-last {
		border-radius: 16px 16px 16px 4px;
	}

	/* 1–3 emoji stickers: no chrome, just the glyphs */
	.bubble.emoji-only,
	.bubble.emoji-only.mine {
		padding: 0 !important;
		background: transparent !important;
		border-radius: 0;
		color: inherit;
	}

	/* Mid-stack: all corners full. Tail only on last. */
	.bubble.stack-mid,
	.bubble:not(.stack-last) {
		border-radius: 16px;
	}

	.card:not(.threaded) .bubble.mine.stack-last {
		border-radius: 16px 16px 4px 16px;
	}

	.bubble:not(.mine).stack-last {
		border-radius: 16px 16px 16px 4px;
	}

	.bubble.quoted {
		min-width: min(240px, 100%);
	}

	.attachments {
		display: flex;
		flex-direction: column;
		gap: 6px;
		/* No shell pad — pics/vids use quote-like inset; chips/captions pad themselves. */
		padding: 0;
	}

	.att-block {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.att-media-btn {
		position: relative;
		display: block;
		margin: 0 6px;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
		max-width: min(260px, 72vw);
		-webkit-tap-highlight-color: transparent;
	}

	.att-image,
	.att-video {
		display: block;
		/* Match .quote horizontal inset (ChatQuoteBubblePadH = 6px). */
		margin: 0;
		max-width: min(260px, 72vw);
		max-height: 220px;
		border-radius: 8px;
		object-fit: cover;
		pointer-events: none;
	}

	.att-play {
		position: absolute;
		inset: auto 10px 10px auto;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		color: var(--fg);
		pointer-events: none;
	}

	.att-caption {
		margin: 0;
		/* Align with .text horizontal inset (11px). */
		padding: 0 11px 2px;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.35;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.att-media-loading {
		position: relative;
		overflow: hidden;
		margin: 0 6px;
		width: min(180px, 52vw);
		height: 120px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		animation: att-pulse 1.1s ease-in-out infinite;
	}

	.att-blur {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		transform: scale(1.1);
		filter: blur(14px);
		pointer-events: none;
	}

	.att-media-loading.video {
		height: 140px;
	}

	/* Voice: row-shaped pulse — never the 180×120 image skeleton. */
	.att-media-loading.voice {
		width: min(400px, 80%);
		max-width: 100%;
		height: 56px;
		margin: 0 8px;
		border-radius: 14px;
	}

	.bubble.mine .att-media-loading {
		background: rgba(0, 0, 0, 0.18);
	}

	@keyframes att-pulse {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}

	.att-voice {
		display: block;
		width: min(240px, 70vw);
		/* Keep chip-like inset (paragraph pad), not media-flush. */
		margin: 2px 11px;
	}

	.att-file {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0 8px;
		padding: 8px 10px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.bubble.mine .att-file {
		background: rgba(0, 0, 0, 0.18);
	}

	.att-name {
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.att-size {
		font-size: 0.6875rem;
		opacity: 0.7;
	}

	.bubble-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 2px;
		padding: 1px 11px 0;
	}

	.author {
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.when {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--fg-33);
		flex-shrink: 0;
	}

	.bubble.mine .when {
		color: rgba(255, 255, 255, 0.55);
	}

	.meta-out {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 5px;
		margin-top: -1px;
		padding: 0 11px 1px;
	}

	/* Outside sticker bubble — no bubble inset, quiet grayscale receipt */
	.meta-out-sticker {
		margin-top: 2px;
		padding: 0;
	}

	.meta-out-sticker .when {
		color: var(--fg-33);
	}

	.receipt {
		display: inline-flex;
		color: rgba(255, 255, 255, 0.5);
		line-height: 0;
	}

	.receipt.read {
		color: color-mix(in srgb, #fff 70%, var(--accent-1));
	}

	.meta-out-sticker .receipt {
		color: var(--fg-33);
	}

	.meta-out-sticker .receipt.read {
		color: var(--fg-66);
	}

	.quote {
		display: flex;
		min-width: 0;
		width: calc(100% - 12px);
		/* Tighter than paragraph inset (11px) — matches Alpha Chat ChatQuoteBubblePadH. */
		margin: 0 6px 6px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		overflow: hidden;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.quote.deleted {
		cursor: default;
	}

	.quote:focus-visible {
		outline: 2px solid var(--accent-1);
		outline-offset: 1px;
	}

	.quote.deleted:focus-visible {
		outline: none;
	}

	.bubble.mine .quote {
		/* Outgoing accent bubble: darken quote, never a white wash. */
		background: rgba(0, 0, 0, 0.18);
	}

	.quote-bar {
		width: 2.8px;
		flex-shrink: 0;
		align-self: stretch;
	}

	.quote.deleted .quote-bar {
		background: var(--fg-33);
	}

	.quote-body {
		flex: 1;
		min-width: 0;
		padding: 5px 8px 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.quote-name {
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quote-text {
		font-size: 0.75rem;
		line-height: 1.3;
		color: var(--fg-66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quote-text.deleted {
		font-weight: 500;
		color: var(--fg-33);
	}

	.bubble.mine .quote-text {
		color: rgba(255, 255, 255, 0.72);
	}

	.bubble.mine .quote-text.deleted {
		color: rgba(255, 255, 255, 0.55);
	}

	.text {
		margin: 0;
		padding: 0 11px;
		font-size: 0.9375rem;
		line-height: 1.4;
		color: var(--fg-83);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.mention {
		font-weight: 600;
		/* Keep account color even inside outgoing white text */
	}

	.msg-link {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		word-break: break-all;
	}

	.msg-link:hover {
		opacity: 0.88;
	}

	.text.emoji-only-text {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 !important;
		margin: 0;
		font-size: var(--emoji-size, 56px);
		line-height: 1;
		color: inherit;
		white-space: nowrap;
	}

	/* Quoted reply keeps bubble chrome — inset large emoji like body text. */
	.bubble.quoted .text.emoji-only-text {
		padding: 0 11px !important;
	}

	.bubble.mine .text {
		color: #fff;
	}

	.bubble.emoji-only.mine .text {
		color: inherit;
	}

	/* Mid-stack outgoing: +1px under text only (not image-only / sticker bubbles). */
	.bubble.mine:not(.stack-last):not(.emoji-only) .text {
		padding-bottom: 1px;
	}

	.fail-retry {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		align-self: flex-start;
		margin: 6px 11px 4px;
		padding: 7px 14px;
		min-height: 32px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}

	.fail-retry-sticker {
		align-self: flex-end;
		margin: 6px 0 0;
	}

	.bubble.mine .fail-retry {
		background: rgba(255, 255, 255, 0.16);
		color: rgba(255, 255, 255, 0.78);
	}

	.action-rail {
		display: none;
		flex-shrink: 0;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		height: 28px;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}

	.rail-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		margin: 0;
		border: none;
		border-radius: 50%;
		background: var(--fg-8);
		color: var(--fg-33);
		cursor: pointer;
		flex-shrink: 0;
	}

	.rail-btn:hover {
		background: color-mix(in srgb, var(--fg) 14%, transparent);
		color: var(--fg-66);
	}

	.rail-btn:focus-visible {
		outline: 2px solid var(--accent-1);
		outline-offset: 2px;
		opacity: 1;
	}

	@media (hover: hover) and (pointer: fine) {
		.action-rail {
			display: flex;
		}

		.desktop-bubble-actions-target:hover .action-rail,
		.desktop-bubble-actions-target:focus-within .action-rail {
			opacity: 1;
			pointer-events: auto;
		}
	}

	.reaction-pills {
		/* In-flow so wrapped rows take real height; negative margin sits on bubble. */
		position: relative;
		left: 0;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		width: max-content;
		max-width: min(100%, 280px);
		/* Visually sit on top of the message bubble under the second row */
		margin-top: -10px;
		padding-top: 2px;
		padding-left: 4px;
		z-index: 2;
	}

	.card.mine:not(.threaded) .reaction-pills {
		left: auto;
		padding-left: 0;
		padding-right: 4px;
		justify-content: flex-end;
		align-self: flex-end;
	}

	.reaction-pill {
		position: relative;
		isolation: isolate;
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		flex-shrink: 0;
		gap: 4px;
		/* Right pad matches top/bottom around the pfp */
		padding: 3px 3px 3px 5px;
		border: 0;
		border-radius: 999px;
		/* Peer reactions: same composer/modal glass + blur as `.alpha-popover` */
		background: var(--composer-bg, var(--modal-bg, var(--glass-panel, transparent)));
		color: var(--fg);
		font: inherit;
		cursor: pointer;
		line-height: 1;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur, 22px)) saturate(1.2);
		-webkit-backdrop-filter: blur(var(--glass-blur, 22px)) saturate(1.2);
		box-shadow: 0 4px 14px var(--shadow, color-mix(in srgb, #000 12%, transparent));
	}

	/* Specular hairline — same as `.alpha-popover::after` / scroll-FAB */
	.reaction-pill::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		pointer-events: none;
		z-index: 1;
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

	.reaction-pill.mine {
		/* Own reaction: accent whisper wash on top of popover glass */
		background: color-mix(
			in srgb,
			var(--accent-1) 28%,
			var(--composer-bg, var(--modal-bg, var(--glass-panel, transparent)))
		);
		box-shadow: none;
	}

	.reaction-pill.mine::after {
		/* Accent-tinted specular so own reactions keep a quiet selected edge */
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--accent-1) 40%, transparent) 0%,
			color-mix(in srgb, var(--accent-1) 12%, transparent) 45%,
			color-mix(in srgb, var(--accent-1) 12%, transparent) 55%,
			color-mix(in srgb, var(--accent-1) 28%, transparent) 100%
		);
	}

	.reaction-pill .emoji {
		font-size: 1.0625rem;
		line-height: 1;
		/* Never inherit a translucent --fg-* — WebKit paints emoji with the text color’s alpha */
		color: var(--fg);
		opacity: 1;
	}

	.reaction-pill .reactors {
		display: inline-flex;
		align-items: center;
		height: 20px;
	}

	.reaction-pill .reactor {
		position: relative;
		margin-left: -4px;
		line-height: 0;
	}

	.reaction-pill .reactor:first-child {
		margin-left: 0;
	}

	.reaction-pill .count {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--fg-33);
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		padding-right: 0;
	}
</style>
