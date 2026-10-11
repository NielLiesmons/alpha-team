<script>
	import { categories, ctaLabel, formatEur, stockLabel } from '$lib/fixtures.js';
	import { products, setStock } from '$lib/preview.svelte.js';

	let category = $state('all');
	let selectedId = $state(products[0]?.id ?? '');

	let visible = $derived(
		category === 'all' ? products : products.filter((item) => item.category === category)
	);
	let selected = $derived(products.find((item) => item.id === selectedId) ?? null);

	/** @param {string} id */
	function pickCategory(id) {
		category = id;
		const next = id === 'all' ? products : products.filter((item) => item.category === id);
		if (!next.some((item) => item.id === selectedId)) selectedId = next[0]?.id ?? '';
	}

	const stocks = /** @type {const} */ (['in', 'low', 'out']);
</script>

<header class="page-head">
	<div>
		<h1>Boutique</h1>
		<p>Les produits du site. Le stock ici est un exemple, il ne change pas la boutique publique.</p>
	</div>
</header>

<div class="filters" role="tablist" aria-label="Catégories">
	{#each categories as item (item.id)}
		<button
			type="button"
			class="btn ghost small"
			class:primary={category === item.id}
			onclick={() => pickCategory(item.id)}
		>
			{item.label}
		</button>
	{/each}
</div>

<div class="split">
	<div class="panel">
		<table class="data">
			<thead>
				<tr>
					<th>Produit</th>
					<th>Prix</th>
					<th>Stock</th>
				</tr>
			</thead>
			<tbody>
				{#each visible as product (product.id)}
					<tr class:selected={product.id === selectedId}>
						<td>
							<button type="button" class="row-hit" onclick={() => (selectedId = product.id)}>
								{product.name}
							</button>
						</td>
						<td>{formatEur(product.priceEur)}</td>
						<td><span class="pill {product.stock}">{stockLabel[product.stock]}</span></td>
					</tr>
				{:else}
					<tr>
						<td colspan="3" class="empty">Aucun produit dans cette catégorie.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if selected}
		<div class="panel detail">
			<p class="field-label">Produit</p>
			<h2>{selected.name}</h2>
			<p class="muted">{formatEur(selected.priceEur)} · {ctaLabel[selected.cta]}</p>
			<div class="field" style="margin-top: 18px">
				<span class="field-label">Stock</span>
				<div class="segments">
					{#each stocks as stock (stock)}
						<button
							type="button"
							class:on={selected.stock === stock}
							onclick={() => setStock(selected.id, stock)}
						>
							{stockLabel[stock]}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.row-hit {
		display: block;
		width: 100%;
		border: 0;
		background: transparent;
		text-align: left;
		padding: 12px 0;
		font-weight: 600;
	}

	td:first-child {
		padding-top: 0;
		padding-bottom: 0;
	}

	h2 {
		font-size: 22px;
		letter-spacing: -0.03em;
		font-weight: 650;
	}

	.detail .muted {
		margin-top: 6px;
	}

	.filters :global(.btn.primary) {
		background-image: var(--gradient-blurple);
		color: var(--whiteEnforced);
	}
</style>
