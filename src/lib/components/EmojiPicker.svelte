<script>
	/**
	 * Shared emoji picker body — use inside a nested CreateSheet.
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
			if (cat.label.toLowerCase().includes(q)) {
				hits.push(...cat.glyphs);
				continue;
			}
			for (const g of cat.glyphs) {
				if (g.includes(q)) hits.push(g);
			}
		}
		return [...new Set(hits)].slice(0, 240);
	});
</script>

<div class="picker">
	<div class="toolbar">
		<input class="search" type="search" placeholder="Search emoji" bind:value={query} aria-label="Search emoji" />
		{#if value && onclear}
			<button type="button" class="clear" onclick={onclear}>Remove</button>
		{/if}
	</div>
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
		<p class="cat-label">{active?.label}</p>
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
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		flex: 1;
		padding: 4px 12px 0;
		box-sizing: border-box;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.search {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0 12px;
		border: 1px solid var(--hairline);
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 14px;
		box-sizing: border-box;
	}

	.search::placeholder {
		color: var(--fg-33);
	}

	.clear {
		flex-shrink: 0;
		height: 36px;
		padding: 0 12px;
		border: 0;
		border-radius: 10px;
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
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		font-size: 17px;
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
		min-height: 220px;
		max-height: min(48svh, 360px);
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 4px;
	}

	.cell {
		aspect-ratio: 1;
		border: 0;
		border-radius: 10px;
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
		margin: 24px 0;
		text-align: center;
		font-size: 13px;
		color: var(--fg-33);
	}

	@media (min-width: 640px) {
		.grid {
			grid-template-columns: repeat(7, minmax(0, 1fr));
			max-height: 320px;
		}
	}
</style>
