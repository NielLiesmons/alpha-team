<script>
	/**
	 * Unicode glyph or Space custom emoji (:name:) for bubbles / reactions.
	 * Custom shortcodes never paint raw `:name:` text — skeleton (emojiFill mask) while
	 * loading / missing / failed.
	 */
	import EmojiFill from './icons/EmojiFill.svelte';
	import {
		customEmojiByName,
		customEmojiFailed,
		customEmojiIndexReady,
		customEmojiUrl,
		ensureCustomEmojiUrl,
		kickCustomEmojiRefresh
	} from '$lib/custom-emoji.svelte.js';
	import { isCustomEmojiToken } from '$lib/message-emoji.js';

	/** @type {{ token: string, size?: number, className?: string }} */
	let { token = '', size = 20, className = '' } = $props();

	const shortcode = $derived(isCustomEmojiToken(token));
	const custom = $derived(shortcode ? customEmojiByName(token) : null);
	const src = $derived(custom ? customEmojiUrl(token) : null);
	const pathFailed = $derived(custom ? customEmojiFailed(custom.path) : false);
	const label = $derived(custom ? `:${custom.name}:` : token);
	const indexReady = $derived(customEmojiIndexReady());
	/** Unknown shortcode only after a successful index hydrate. */
	const unknown = $derived(Boolean(shortcode && indexReady && !custom));

	let imgFailed = $state(false);
	let retriedImg = $state(false);

	$effect(() => {
		src;
		imgFailed = false;
		retriedImg = false;
	});

	/*
	 * Feed often paints :name: before boot index lands — keep skeleton pulsing and
	 * kick (debounced) refresh so we never stick on blank/failed forever.
	 */
	$effect(() => {
		if (!shortcode) return;
		if (!indexReady) kickCustomEmojiRefresh();
		else if (!custom) kickCustomEmojiRefresh({ force: true });
	});

	$effect(() => {
		if (!custom?.path || src) return;
		void ensureCustomEmojiUrl(custom.path);
	});
</script>

{#if shortcode}
	{#if src && !imgFailed}
		<img
			class="chat-emoji custom {className}"
			src={src}
			alt={label}
			title={label}
			width={size}
			height={size}
			draggable="false"
			onerror={() => {
				imgFailed = true;
				if (!retriedImg && custom?.path) {
					retriedImg = true;
					void ensureCustomEmojiUrl(custom.path, { force: true }).then((url) => {
						if (url) imgFailed = false;
					});
				}
			}}
		/>
	{:else}
		<span
			class="chat-emoji skel {className}"
			class:failed={unknown || pathFailed || (imgFailed && retriedImg)}
			style:width="{size}px"
			style:height="{size}px"
			title={label}
			aria-hidden="true"
		>
			<span class="skel-mask" aria-hidden="true">
				<EmojiFill size={size} />
			</span>
		</span>
	{/if}
{:else}
	<span class="chat-emoji glyph {className}" style:font-size="{size}px">{token}</span>
{/if}

<style>
	.chat-emoji {
		display: inline-block;
		vertical-align: -0.15em;
		line-height: 1;
		flex-shrink: 0;
	}

	.chat-emoji.custom {
		object-fit: contain;
		vertical-align: -0.2em;
	}

	.chat-emoji.skel {
		position: relative;
		display: inline-grid;
		place-items: center;
		vertical-align: -0.2em;
		/* Fully round so the skeleton latches the emojiFill smiley — never a rounded square. */
		border-radius: 50%;
		overflow: hidden;
		background: var(--fg-8);
		color: var(--fg-16);
	}

	.chat-emoji.skel .skel-mask {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		animation: emoji-skel-pulse 1.1s ease-in-out infinite;
	}

	.chat-emoji.skel.failed .skel-mask {
		animation: none;
		opacity: 0.55;
	}

	.chat-emoji.glyph {
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
	}

	.chat-emoji.sticker {
		display: block;
		vertical-align: 0;
	}

	.chat-emoji.skel.sticker {
		display: grid;
	}

	@keyframes emoji-skel-pulse {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 0.72;
		}
	}
</style>
