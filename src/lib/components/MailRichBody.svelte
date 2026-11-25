<script>
	/**
	 * Renders mail plain text with nested quote rails colored by author email.
	 * Applies light Gmail-plain formatting (*bold*, lists, links) inside segments.
	 */
	import { nestMailSegments, parseMailSegments, plainMailToSafeHtml } from '$lib/mail-body.js';
	import { profileAccentCss } from '$lib/color.js';

	/** @type {{ text?: string, fallbackEmail?: string, minDepth?: number }} */
	let { text = '', fallbackEmail = '', minDepth = 0 } = $props();

	const tree = $derived(
		nestMailSegments(parseMailSegments(text, fallbackEmail, { minDepth }))
	);

	/** @param {string} email @param {number} depth */
	function barColor(email, depth) {
		const mix = Math.max(32, 58 - Math.max(0, depth - 1) * 8);
		const accent = profileAccentCss(email || fallbackEmail || 'unknown');
		return `color-mix(in srgb, ${accent} ${mix}%, transparent)`;
	}
</script>

{#snippet nodes(list)}
	{#each list as node, i (i)}
		{#if node.depth <= 0}
			{#if node.text}
				<div class="plain">{@html plainMailToSafeHtml(node.text)}</div>
			{/if}
			{#if node.children?.length}
				{@render nodes(node.children)}
			{/if}
		{:else}
			<div
				class="quote"
				style:border-left-color={barColor(node.email, node.depth)}
			>
				{#if node.text}
					<div class="quote-text">{@html plainMailToSafeHtml(node.text)}</div>
				{/if}
				{#if node.children?.length}
					{@render nodes(node.children)}
				{/if}
			</div>
		{/if}
	{/each}
{/snippet}

<div class="mail-rich">
	{@render nodes(tree)}
</div>

<style>
	.mail-rich {
		display: flex;
		flex-direction: column;
		gap: 6px;
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
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--fg-83);
		word-break: break-word;
		overflow-wrap: anywhere;
	}

	.plain :global(.plain-line),
	.quote-text :global(.plain-line) {
		white-space: pre-wrap;
	}

	.plain :global(ul),
	.quote-text :global(ul) {
		margin: 0.25em 0 0.5em;
		padding-left: 1.25rem;
	}

	.plain :global(li),
	.quote-text :global(li) {
		margin: 0.15em 0;
		white-space: normal;
	}

	.plain :global(strong),
	.quote-text :global(strong) {
		font-weight: 600;
		color: var(--fg);
	}

	.plain :global(em),
	.quote-text :global(em) {
		font-style: italic;
	}

	.plain :global(a),
	.quote-text :global(a) {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.plain :global(a:hover),
	.quote-text :global(a:hover) {
		color: var(--link-hover);
	}

	.quote {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		margin: 2px 0 0;
		padding: 0 0 0 10px;
		border-left: 3px solid var(--fg-33);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.quote .quote {
		margin-top: 4px;
	}

	.quote-text {
		font-size: 0.875rem;
		color: var(--fg-66);
	}
</style>
