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
		customEmojiUrl
	} from '$lib/custom-emoji.svelte.js';
	import { isCustomEmojiToken } from '$lib/message-emoji.js';

	/** @type {{ token: string, size?: number, className?: string }} */
	let { token = '', size = 20, className = '' } = $props();

	const shortcode = $derived(isCustomEmojiToken(token));
	const custom = $derived(shortcode ? customEmojiByName(token) : null);
	const src = $derived(custom ? customEmojiUrl(token) : null);
	const failed = $derived(custom ? customEmojiFailed(custom.path) : false);
	const label = $derived(custom ? `:${custom.name}:` : token);
	const indexReady = $derived(customEmojiIndexReady());

	let imgFailed = $state(false);

	$effect(() => {
		src;
		imgFailed = false;
	});
</script>

{#if shortcode}
	{#if src && !failed && !imgFailed}
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
			}}
		/>
	{:else}
		<span
			class="chat-emoji skel {className}"
			class:failed={failed || imgFailed || (indexReady && !custom)}
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
