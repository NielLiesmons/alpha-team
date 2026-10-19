<script>
	/**
	 * Shared emoji picker — categories + search.
	 * Custom/image emoji can be added later without changing the select API.
	 */
	import { EMOJI_CATEGORIES } from '$lib/emoji.js';

	/** @type {{ value?: string | null, onselect: (emoji: string) => void, onclear?: (() => void) | null }} */
	let { value = null, onselect, onclear = null } = $props();

	let query = $state('');
	let categoryId = $state(EMOJI_CATEGORIES[0]?.id ?? 'smileys');

	const active = $derived(EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? EMOJI_CATEGORIES[0]);
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return active?.glyphs ?? [];
		const hits = [];
		for (const cat of EMOJI_CATEGORIES) {
			for (const g of cat.glyphs) {
				if (g.includes(q) || cat.label.toLowerCase().includes(q)) hits.push(g);
			}
		}
		return [...new Set(hits)].slice(0, 180);
	});
</script>

<div class="picker" role="dialog" aria-label="Emoji picker">
	<input class="search" type="search" placeholder="Search" bind:value={query} aria-label="Search emoji" />
	{#if !query.trim()}
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
					{cat.glyphs[0]}
				</button>
			{/each}
		</div>
	{/if}
	<div class="grid" role="listbox">
		{#each filtered as emoji (emoji)}
			<button
				type="button"
				class="cell"
				class:on={value === emoji}
				role="option"
				aria-selected={value === emoji}
				onclick={() => onselect(emoji)}
			>
				{emoji}
			</button>
		{/each}
		{#if filtered.length === 0}
			<p class="empty">No matches</p>
		{/if}
	</div>
	{#if value && onclear}
		<button type="button" class="clear" onclick={onclear}>Remove</button>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(280px, 78vw);
		padding: 10px;
		box-sizing: border-box;
	}

	.search {
		width: 100%;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		box-sizing: border-box;
	}

	.search::placeholder {
		color: var(--fg-33);
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}

	.tab {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		font-size: 15px;
		line-height: 1;
		cursor: pointer;
	}

	.tab:hover,
	.tab.on {
		background: var(--fg-8);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 2px;
		max-height: 220px;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
	}

	.cell {
		aspect-ratio: 1;
		border: 0;
		border-radius: 8px;
		background: transparent;
		font-size: 18px;
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
		margin: 12px 0;
		text-align: center;
		font-size: 13px;
		color: var(--fg-33);
	}

	.clear {
		align-self: flex-start;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--destructive);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		padding: 6px 8px;
		cursor: pointer;
	}

	.clear:hover {
		background: var(--fg-4);
	}
</style>
