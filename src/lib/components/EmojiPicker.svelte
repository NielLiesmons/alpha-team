<script>
	/**
	 * Compact emoji panel — recent defaults + fast search (no category tabs).
	 */
	import { defaultEmojiPanel, rememberEmoji, searchEmojis } from '$lib/emoji.js';

	/** @type {{ value?: string | null, onselect: (emoji: string) => void, onclear?: (() => void) | null }} */
	let { value = null, onselect, onclear = null } = $props();

	let query = $state('');

	const searching = $derived(query.trim().length > 0);
	const items = $derived(searching ? searchEmojis(query, 96) : defaultEmojiPanel(64));

	/** @param {string} glyph */
	function pick(glyph) {
		rememberEmoji(glyph);
		onselect(glyph);
	}
</script>

<div class="picker">
	<div class="search-row">
		<input
			class="search"
			type="search"
			placeholder="Search emoji…"
			bind:value={query}
			aria-label="Search emoji"
		/>
		{#if value && onclear}
			<button type="button" class="clear" onclick={onclear}>Remove</button>
		{/if}
	</div>
	<p class="hint">{searching ? `${items.length} result${items.length === 1 ? '' : 's'}` : 'Recently used'}</p>
	<div class="grid" role="listbox">
		{#each items as item (item.g + (item.n ?? ''))}
			<button
				type="button"
				class="cell"
				class:on={value === item.g}
				role="option"
				aria-selected={value === item.g}
				title={item.n}
				onclick={() => pick(item.g)}
			>
				{item.g}
			</button>
		{/each}
		{#if items.length === 0}
			<p class="empty">No matches</p>
		{/if}
	</div>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
		flex: 1;
		padding: 10px 10px 8px;
		box-sizing: border-box;
	}

	.search-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.search {
		flex: 1;
		min-width: 0;
		height: 34px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-8);
		font: inherit;
		font-size: 14px;
		color: var(--fg);
		outline: none;
		box-sizing: border-box;
	}

	.search::placeholder {
		color: var(--fg-33);
	}

	.clear {
		flex-shrink: 0;
		height: 34px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--destructive);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.hint {
		margin: 0;
		padding: 0 2px;
		font-size: 10px;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-33);
		flex-shrink: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 2px;
		flex: 1;
		min-height: 0;
		max-height: 280px;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 2px;
	}

	.cell {
		aspect-ratio: 1;
		border: 0;
		border-radius: 8px;
		background: transparent;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
		padding: 0;
	}

	.cell:hover,
	.cell.on {
		background: var(--fg-8);
	}

	.empty {
		grid-column: 1 / -1;
		margin: 20px 0;
		text-align: center;
		font-size: 13px;
		color: var(--fg-33);
	}
</style>
