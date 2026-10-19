<script>
	/**
	 * Shared emoji picker body — use inside a nested CreateSheet.
	 */
	import { EMOJI_CATEGORIES, searchEmojis } from '$lib/emoji.js';

	/** @type {{ value?: string | null, onselect: (emoji: string) => void, onclear?: (() => void) | null }} */
	let { value = null, onselect, onclear = null } = $props();

	let query = $state('');
	let categoryId = $state(EMOJI_CATEGORIES[0]?.id ?? 'smileys');

	const active = $derived(EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? EMOJI_CATEGORIES[0]);
	const searching = $derived(query.trim().length > 0);
	const items = $derived.by(() => {
		if (searching) return searchEmojis(query, 280);
		return active?.items ?? [];
	});
</script>

<div class="picker">
	<div class="search-row">
		<input class="text" type="search" placeholder="Search emoji" bind:value={query} aria-label="Search emoji" />
		{#if value && onclear}
			<button type="button" class="clear" onclick={onclear}>Remove</button>
		{/if}
	</div>
	{#if !searching}
		<div class="tabs" role="tablist" aria-label="Categories">
			{#each EMOJI_CATEGORIES as cat (cat.id)}
				<button
					type="button"
					class="tab"
					class:on={cat.id === categoryId}
					role="tab"
					aria-selected={cat.id === categoryId}
					title={cat.label}
					onclick={() => (categoryId = cat.id)}
				>
					{cat.items[0]?.g ?? '•'}
				</button>
			{/each}
		</div>
		<p class="cat-label">{active?.label}</p>
	{:else}
		<p class="cat-label">{items.length} result{items.length === 1 ? '' : 's'}</p>
	{/if}
	<div class="grid" role="listbox">
		{#each items as item (item.g + (item.n ?? ''))}
			<button
				type="button"
				class="cell"
				class:on={value === item.g}
				role="option"
				aria-selected={value === item.g}
				title={item.n}
				onclick={() => onselect(item.g)}
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
		gap: 10px;
		min-height: 0;
		flex: 1;
		padding: 4px 16px 0;
		box-sizing: border-box;
	}

	.search-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.search-row .text {
		flex: 1;
		min-width: 0;
		height: 42px;
		padding: 0 14px;
		border-radius: 12px;
		font: inherit;
		font-size: 15px;
		color: var(--fg);
		box-sizing: border-box;
	}

	.clear {
		flex-shrink: 0;
		height: 42px;
		padding: 0 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--destructive);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 2px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		flex-shrink: 0;
		padding-bottom: 2px;
	}

	.tab {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}

	.tab:hover,
	.tab.on {
		background: var(--fg-8);
	}

	.cat-label {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
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
		min-height: 280px;
		max-height: min(52svh, 420px);
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 8px;
	}

	.cell {
		aspect-ratio: 1;
		border: 0;
		border-radius: 10px;
		background: transparent;
		font-size: 24px;
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
		margin: 28px 0;
		text-align: center;
		font-size: 13px;
		color: var(--fg-33);
	}

	@media (min-width: 640px) {
		.grid {
			grid-template-columns: repeat(9, minmax(0, 1fr));
			min-height: 320px;
			max-height: 380px;
		}
	}
</style>
