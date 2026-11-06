<script>
	/**
	 * Family chat bubble — Alpha Chat look + Zapstore desktop hover actions.
	 * Outgoing: accent gradient, no profile pic. Incoming: muted bubble + avatar.
	 * Desktop: React / Reply circle buttons on hover. Mobile: long-press → react picker.
	 */
	import ProfilePic from './ProfilePic.svelte';
	import Heart from './icons/Heart.svelte';
	import Reply from './icons/Reply.svelte';
	import { actor, asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { REACTION_EMOJI, reactionsForMessage, toggleReaction } from '$lib/chat.svelte.js';
	import { profileAccentCss, profileNameCss } from '$lib/color.js';
	import { customEmojis, customEmojiUrl } from '$lib/custom-emoji.svelte.js';
	import { customEmojiShortcode, emojiOnlyInfo, tokenizeChatBody } from '$lib/message-emoji.js';
	import { members } from '$lib/members.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import ChatEmoji from './ChatEmoji.svelte';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { getPath } from '$lib/drive/client.js';
	import { getMediaBlob } from '$lib/drive/media.js';

	const REACTION_PFP_MAX = 3;
	/** @type {Record<string, string>} path → object URL for remote attachments */
	let attUrls = $state(/** @type {Record<string, string>} */ ({}));

	/**
	 * @type {{
	 *   msg: any,
	 *   parent?: any | null,
	 *   when?: string,
	 *   onReply?: () => void,
	 *   onQuoteClick?: (parentId: string) => void,
	 *   stackFirst?: boolean,
	 *   stackLast?: boolean,
	 *   showAuthor?: boolean
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
		showAuthor = true
	} = $props();

	let pickerOpen = $state(false);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let holdTimer = null;
	let holdFired = false;
	/** @type {{ x: number, y: number } | null} */
	let holdOrigin = null;

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
	const isReply = $derived(Boolean(parent));
	const isMine = $derived.by(() => {
		const me = (actor.email || '').trim().toLowerCase();
		const author = String(msg.author || '').trim().toLowerCase();
		return Boolean(me && author && me === author);
	});
	const reactions = $derived(reactionsForMessage(msg.id));
	/** sending = not on Drive yet (no check); sent = single ✓; read = double ✓✓ (other account). */
	const delivery = $derived.by(() => {
		if (msg._failed) return 'failed';
		if (msg._pending || msg.delivery === 'sending' || String(msg.id || '').startsWith('local-')) {
			return 'sending';
		}
		const me = (actor.email || '').trim().toLowerCase();
		const readBy = Array.isArray(msg.read_by)
			? msg.read_by.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
			: [];
		/* Double-check only when at least one *other* account is in read_by. */
		if (readBy.some((e) => e && e !== me)) return 'read';
		return 'sent';
	});
	const showReceipt = $derived(
		isMine && stackLast && (delivery === 'sent' || delivery === 'read')
	);

	const hasAttachments = $derived(
		Array.isArray(msg.attachments) && msg.attachments.length > 0
	);
	const emojiOnly = $derived.by(() => {
		if (isReply || hasAttachments) return null;
		return emojiOnlyInfo(msg.body);
	});
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
	async function onReact(emoji) {
		pickerOpen = false;
		try {
			await toggleReaction(msg.id, emoji);
		} catch {
			/* feed will show failure on next refresh */
		}
	}

	function openReactPicker() {
		pickerOpen = !pickerOpen;
	}

	function clearHold() {
		if (holdTimer != null) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	/** @param {PointerEvent} e */
	function onBubblePointerDown(e) {
		if (e.pointerType === 'mouse') return;
		holdFired = false;
		holdOrigin = { x: e.clientX, y: e.clientY };
		clearHold();
		holdTimer = setTimeout(() => {
			holdFired = true;
			pickerOpen = true;
			holdTimer = null;
		}, 450);
	}

	function onBubblePointerUp() {
		clearHold();
		holdOrigin = null;
	}

	/** @param {PointerEvent} e */
	function onBubblePointerMove(e) {
		if (!holdOrigin || holdTimer == null) return;
		const dx = e.clientX - holdOrigin.x;
		const dy = e.clientY - holdOrigin.y;
		if (dx * dx + dy * dy > 100) clearHold();
	}

	function onBubblePointerCancel() {
		clearHold();
		holdOrigin = null;
	}

	/** @param {Event} e */
	function onBubbleContextMenu(e) {
		/* Mobile long-press often fires contextmenu — keep picker instead of OS menu. */
		if (pickerOpen || holdFired) {
			e.preventDefault();
		}
	}

	function handleReply() {
		pickerOpen = false;
		onReply?.();
	}

	$effect(() => {
		if (!pickerOpen) return;
		/** @param {PointerEvent} e */
		function onDoc(e) {
			const t = /** @type {Node | null} */ (e.target);
			const root = document.querySelector(`[data-chat-bubble="${msg.id}"]`);
			if (root && t && root.contains(t)) return;
			pickerOpen = false;
		}
		document.addEventListener('pointerdown', onDoc, true);
		return () => document.removeEventListener('pointerdown', onDoc, true);
	});

	$effect(() => {
		const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
		const session = activeSession();
		const need = atts.filter(
			(a) =>
				a?.path &&
				!String(a.path).startsWith('local:') &&
				!a.previewUrl &&
				!a.url &&
				!attUrls[a.path] &&
				(a.kind === 'image' || a.kind === 'video' || a.kind === 'voice')
		);
		if (!session || !need.length) return;
		let cancelled = false;
		/** @type {string[]} */
		const created = [];
		void (async () => {
			for (const a of need) {
				try {
					const path = String(a.path);
					/** @type {Uint8Array} */
					let bytes;
					/** @type {string} */
					let type = a.content_type || 'application/octet-stream';
					if (path.endsWith('media.json') || a.kind === 'voice' || a.kind === 'video') {
						const loaded = await getMediaBlob(session, path);
						bytes = loaded.bytes;
						type = loaded.manifest?.content_type || type;
					} else {
						bytes = await getPath(session, path);
					}
					if (cancelled) return;
					const url = URL.createObjectURL(new Blob([bytes], { type }));
					created.push(url);
					attUrls = { ...attUrls, [path]: url };
				} catch {
					/* leave placeholder */
				}
			}
		})();
		return () => {
			cancelled = true;
			for (const u of created) URL.revokeObjectURL(u);
		};
	});
</script>

<article
	class="card desktop-bubble-actions-target"
	class:mine={isMine}
	class:failed={msg._failed}
	class:stack-first={stackFirst}
	class:stack-last={stackLast}
	class:stack-mid={!stackFirst && !stackLast}
	data-chat-bubble={msg.id}
>
	{#if !isMine}
		<div class="avatar-wrap" class:hidden-slot={!stackLast}>
			{#if stackLast}
				<ProfilePic name={name} email={msg.author} pictureUrl={pictureUrlFor(msg.author)} size={34} />
			{/if}
		</div>
	{/if}

	<div class="bubble-trailing">
		<div class="bubble-stack">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="bubble"
				class:quoted={isReply}
				class:mine={isMine}
				class:emoji-only={Boolean(emojiOnly)}
				class:stack-first={stackFirst}
				class:stack-last={stackLast}
				class:stack-mid={!stackFirst && !stackLast}
			onpointerdown={onBubblePointerDown}
			onpointerup={onBubblePointerUp}
			onpointermove={onBubblePointerMove}
			onpointercancel={onBubblePointerCancel}
			oncontextmenu={onBubbleContextMenu}
			role="group"
			aria-label={isMine ? 'Your message' : `Message from ${name}`}
		>
			{#if !isMine && showAuthor && stackFirst && !emojiOnly}
				<div class="bubble-head">
					<span class="author" style:color={nameColor(msg.author, name)}>{name}</span>
					{#if when}<span class="when">{when}</span>{/if}
				</div>
			{/if}
			{#if parent}
				<button
					type="button"
					class="quote"
					aria-label={`Jump to message from ${parentName}`}
					onclick={(e) => {
						e.stopPropagation();
						onQuoteClick?.(String(parent.id));
					}}
				>
					<div
						class="quote-bar"
						style:background={accentRgb(parent.author, parentName)}
						aria-hidden="true"
					></div>
					<div class="quote-body">
						<span class="quote-name" style:color={nameColor(parent.author, parentName)}
							>{parentName}</span
						>
						<span class="quote-text">{preview(parent.body)}</span>
					</div>
				</button>
			{/if}
			{#if emojiOnly}
				<p class="text emoji-only-text" style:--emoji-size="{emojiOnlyPx}px">
					{#each emojiOnly.tokens as tok, i (tok + i)}
						<ChatEmoji token={tok} size={emojiOnlyPx} className="sticker" />
					{/each}
				</p>
			{:else if msg.body}
				<p class="text">
					{#each bodyTokens as tok, i (`${tok.type}-${i}`)}
						{#if tok.type === 'text'}
							{tok.value}
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
			{#if Array.isArray(msg.attachments) && msg.attachments.length}
				<div class="attachments">
					{#each msg.attachments as att, ai (att.path || att.name || ai)}
						{@const src = att.previewUrl || att.url || (att.path ? attUrls[att.path] : '')}
						{#if att.kind === 'image' && src}
							<img class="att-image" src={src} alt={att.name || 'Image'} />
						{:else if att.kind === 'video' && src}
							<video class="att-video" src={src} controls playsinline></video>
						{:else if att.kind === 'voice' && src}
							<audio class="att-voice" src={src} controls preload="metadata"></audio>
						{:else}
							<div class="att-file">
								<span class="att-name">{att.name || att.kind || 'File'}</span>
								{#if att.bytes}
									<span class="att-size">{Math.round(att.bytes / 1024)} KB</span>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
			{#if isMine && stackLast && !emojiOnly && (showReceipt || when)}
				<div class="meta-out">
					{#if when}<span class="when">{when}</span>{/if}
					{#if showReceipt}
						<span
							class="receipt"
							class:read={delivery === 'read'}
							title={delivery === 'read' ? 'Read' : 'Sent'}
							aria-label={delivery}
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
			{#if msg._failed && !emojiOnly}
				<p class="fail-hint">Couldn’t send — pull to refresh and try again.</p>
			{/if}

			{#if pickerOpen}
				<div class="react-picker" role="listbox" aria-label="Reactions">
					{#each customEmojis.slice(0, 6) as em (em.id)}
						{@const code = customEmojiShortcode(em.name)}
						{@const src = customEmojiUrl(em.name)}
						<button
							type="button"
							class="react-pick custom"
							role="option"
							title={code}
							onclick={(e) => {
								e.stopPropagation();
								void onReact(code);
							}}
						>
							{#if src}
								<img src={src} alt={code} width="22" height="22" draggable="false" />
							{:else}
								{code}
							{/if}
						</button>
					{/each}
					{#each REACTION_EMOJI as emoji (emoji)}
						<button
							type="button"
							class="react-pick"
							role="option"
							onclick={(e) => {
								e.stopPropagation();
								void onReact(emoji);
							}}
						>
							{emoji}
						</button>
					{/each}
				</div>
			{/if}
			</div>

			{#if isMine && stackLast && emojiOnly && (showReceipt || when)}
				<div class="meta-out meta-out-sticker">
					{#if when}<span class="when">{when}</span>{/if}
					{#if showReceipt}
						<span
							class="receipt"
							class:read={delivery === 'read'}
							title={delivery === 'read' ? 'Read' : 'Sent'}
							aria-label={delivery}
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
			{#if msg._failed && emojiOnly}
				<p class="fail-hint fail-hint-sticker">Couldn’t send — pull to refresh and try again.</p>
			{/if}

			{#if reactions.length}
				<div class="reaction-pills" role="list">
					{#each reactions as r (r.emoji)}
						<button
							type="button"
							class="reaction-pill"
							class:mine={r.mine}
							role="listitem"
							aria-label={r.mine
								? `Remove your ${r.emoji} reaction`
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

		<div class="action-rail" role="group" aria-label="Message actions">
			<button
				type="button"
				class="rail-btn"
				aria-label="React"
				aria-expanded={pickerOpen}
				onclick={(e) => {
					e.stopPropagation();
					openReactPicker();
				}}
			>
				<Heart size={14} />
			</button>
			<button
				type="button"
				class="rail-btn"
				aria-label="Reply"
				onclick={(e) => {
					e.stopPropagation();
					handleReply();
				}}
			>
				<Reply size={14} />
			</button>
		</div>
	</div>
</article>

<style>
	.card {
		display: flex;
		gap: 6px;
		align-items: flex-end;
		width: 100%;
		position: relative;
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

	/* Clear hanging reaction pills so they never cover the next bubble */
	.card:has(.reaction-pills) {
		margin-bottom: 28px;
	}

	.card.mine {
		flex-direction: row-reverse;
		justify-content: flex-start;
	}

	.card.failed .text {
		opacity: 0.7;
	}

	.avatar-wrap {
		flex-shrink: 0;
		width: 34px;
		line-height: 0;
		align-self: flex-end;
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

	.card.mine .bubble-trailing {
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

	.card.mine .bubble-stack {
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
		background: color-mix(in srgb, var(--fg) 12%, transparent);
		color: inherit;
		text-align: left;
		font: inherit;
		-webkit-touch-callout: none;
		user-select: text;
		touch-action: manipulation;
	}

	.bubble.mine {
		border-radius: 16px 16px 4px 16px;
		background: var(--gradient-accent-1);
		color: #fff;
		padding-bottom: 4px;
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

	.bubble.mine.stack-last {
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
		padding: 4px 8px 6px;
	}

	.att-image,
	.att-video {
		display: block;
		max-width: min(260px, 72vw);
		max-height: 220px;
		border-radius: 10px;
		object-fit: cover;
	}

	.att-voice {
		display: block;
		width: min(240px, 70vw);
		margin: 2px 0;
	}

	.att-file {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.bubble.mine .att-file {
		background: rgba(0, 0, 0, 0.18);
	}

	.att-name {
		font-size: 13px;
		font-weight: 600;
	}

	.att-size {
		font-size: 11px;
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
		font-size: 13px;
		font-weight: 600;
	}

	.when {
		font-size: 11px;
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

	.quote:focus-visible {
		outline: 2px solid var(--accent-1);
		outline-offset: 1px;
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

	.quote-body {
		flex: 1;
		min-width: 0;
		padding: 5px 8px 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.quote-name {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quote-text {
		font-size: 12px;
		line-height: 1.3;
		color: var(--fg-66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bubble.mine .quote-text {
		color: rgba(255, 255, 255, 0.72);
	}

	.text {
		margin: 0;
		padding: 0 11px;
		font-size: 15px;
		line-height: 1.4;
		color: var(--fg-83);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.mention {
		font-weight: 600;
		/* Keep account color even inside outgoing white text */
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

	.fail-hint {
		margin: 6px 0 0;
		padding: 0 11px;
		font-size: 11px;
		font-weight: 500;
		color: #c45;
	}

	.fail-hint-sticker {
		padding: 0;
		text-align: right;
	}

	.bubble.mine .fail-hint {
		color: #ffe0e0;
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

	.react-picker {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		z-index: 5;
		display: flex;
		gap: 2px;
		padding: 4px;
		border-radius: 999px;
		border: 1px solid var(--glass-border);
		background: var(--glass-panel);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		box-shadow: 0 8px 24px var(--shadow);
	}

	.card.mine .react-picker {
		left: auto;
		right: 0;
	}

	.react-pick {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
	}

	.react-pick:hover {
		background: var(--fg-8);
	}

	.react-pick.custom img {
		display: block;
		width: 22px;
		height: 22px;
		object-fit: contain;
	}

	.reaction-pills {
		position: absolute;
		top: 100%;
		left: 0;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		width: max-content;
		max-width: min(100vw, 280px);
		/* Hang ~4px onto the bubble bottom edge */
		margin-top: -4px;
		padding-left: 4px;
		z-index: 2;
	}

	.card.mine .reaction-pills {
		left: auto;
		right: 0;
		padding-left: 0;
		padding-right: 4px;
		justify-content: flex-end;
	}

	.reaction-pill {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		flex-shrink: 0;
		gap: 4px;
		/* Right pad matches top/bottom around the pfp */
		padding: 3px 3px 3px 5px;
		border: 1px solid color-mix(in srgb, var(--fg) 8%, transparent);
		border-radius: 999px;
		/* Same surface as dropdown / FloatPanel popovers */
		background: var(--popover);
		color: var(--fg);
		font: inherit;
		cursor: pointer;
		line-height: 1;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.reaction-pill.mine {
		/* Own reaction: accent wash on top of popover */
		background: color-mix(in srgb, var(--accent-1) 28%, var(--popover));
		border-color: color-mix(in srgb, var(--accent-1) 35%, transparent);
	}

	.reaction-pill .emoji {
		font-size: 17px;
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
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		padding-right: 0;
	}
</style>
