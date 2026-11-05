<script>
	/**
	 * Unicode glyph or Space custom emoji (:name:) for bubbles / reactions.
	 */
	import { customEmojiByName, customEmojiUrl } from '$lib/custom-emoji.svelte.js';
	import { isCustomEmojiToken } from '$lib/message-emoji.js';

	/** @type {{ token: string, size?: number, className?: string }} */
	let { token = '', size = 20, className = '' } = $props();

	const custom = $derived(isCustomEmojiToken(token) ? customEmojiByName(token) : null);
	const src = $derived(custom ? customEmojiUrl(token) : null);
	const label = $derived(custom ? `:${custom.name}:` : token);
</script>

{#if custom}
	{#if src}
		<img
			class="chat-emoji custom {className}"
			src={src}
			alt={label}
			title={label}
			width={size}
			height={size}
			draggable="false"
		/>
	{:else}
		<span class="chat-emoji pending {className}" style:font-size="{size}px" title={label}
			>{label}</span
		>
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

	.chat-emoji.pending {
		opacity: 0.45;
		font-size: 11px !important;
		font-weight: 600;
		color: var(--fg-33);
		vertical-align: middle;
	}

	.chat-emoji.glyph {
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
	}

	.chat-emoji.sticker {
		display: block;
		vertical-align: 0;
	}
</style>
