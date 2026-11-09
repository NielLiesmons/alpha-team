<script>
	/**
	 * Renders mail plain text with nested quote bars colored by author email.
	 */
	import { parseMailSegments } from '$lib/mail-body.js';
	import { profileAccentCss } from '$lib/color.js';

	/** @type {{ text?: string, fallbackEmail?: string, minDepth?: number }} */
	let { text = '', fallbackEmail = '', minDepth = 0 } = $props();

	const segments = $derived(parseMailSegments(text, fallbackEmail, { minDepth }));

	/** @param {string} email @param {number} depth */
	function barColor(email, depth) {
		const mix = Math.max(28, 48 - Math.max(0, depth - 1) * 10);
		const accent = profileAccentCss(email || fallbackEmail || 'unknown');
		return `color-mix(in srgb, ${accent} ${mix}%, transparent)`;
	}
</script>

<div class="mail-rich">
	{#each segments as seg, i (i)}
		{#if seg.depth <= 0}
			<pre class="plain">{seg.text}</pre>
		{:else}
			<div
				class="quote"
				style:padding-left="{10 + (seg.depth - 1) * 8}px"
				style:border-left-color={barColor(seg.email, seg.depth)}
			>
				<pre class="quote-text">{seg.text}</pre>
			</div>
		{/if}
	{/each}
</div>

<style>
	.mail-rich {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		min-width: 0;
	}

	.plain,
	.quote-text {
		margin: 0;
		padding: 0;
		border: 0;
		width: 100%;
		background: transparent;
		font: inherit;
		font-size: 15px;
		line-height: 1.55;
		color: var(--fg-83);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.quote {
		box-sizing: border-box;
		width: 100%;
		border-left: 3px solid var(--fg-33);
		min-width: 0;
	}

	.quote-text {
		font-size: 14px;
		color: var(--fg-66);
	}
</style>
