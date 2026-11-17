<script>
	/**
	 * Declarative content-type tip for the chat feed.
	 * Renders only: icon + type name + title (+ optional summary).
	 * Packages never supply bubble JS/CSS — host chrome only.
	 */
	import TipTypeIcon from './TipTypeIcon.svelte';

	/**
	 * @type {{
	 *   icon?: string,
	 *   typeName?: string,
	 *   title?: string,
	 *   summary?: string,
	 *   onclick?: (() => void) | null
	 * }}
	 */
	let {
		icon = 'chat',
		typeName = '',
		title = '',
		summary = '',
		onclick = null
	} = $props();
</script>

{#if onclick}
	<button type="button" class="ct-card" {onclick}>
		<span class="ct-glyph" aria-hidden="true">
			<TipTypeIcon name={icon} size={22} />
		</span>
		{#if typeName}<span class="ct-kind">{typeName}</span>{/if}
		<span class="ct-title">{title}</span>
		{#if summary}<span class="ct-summary">{summary}</span>{/if}
	</button>
{:else}
	<div class="ct-card" role="group">
		<span class="ct-glyph" aria-hidden="true">
			<TipTypeIcon name={icon} size={22} />
		</span>
		{#if typeName}<span class="ct-kind">{typeName}</span>{/if}
		<span class="ct-title">{title}</span>
		{#if summary}<span class="ct-summary">{summary}</span>{/if}
	</div>
{/if}

<style>
	.ct-card {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: default;
	}
	button.ct-card {
		cursor: pointer;
	}
	.ct-glyph {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		color: var(--fg-66);
	}
	.ct-kind {
		flex: 0 0 auto;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}
	.ct-title {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ct-summary {
		flex: 0 1 auto;
		max-width: 40%;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
