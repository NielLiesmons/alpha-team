<script>
	import { brand, setBrand } from '$lib/brand.svelte.js';
	import { setTheme, themeChoice } from '$lib/theme.svelte.js';

	const choices = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'gray', label: 'Gray' },
		{ id: 'dark', label: 'Dark' }
	];

	const fonts = [
		{ id: 'Ovo', label: 'Ovo' },
		{ id: 'Georgia', label: 'Georgia' },
		{ id: 'Inter', label: 'Inter' }
	];
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<header class="page-head">
	<div>
		<h1>Settings</h1>
		<p>Space brand and appearance for this browser (fixture until Drive-backed).</p>
	</div>
</header>

<section class="block">
	<p class="field-label">Brand</p>
	<p class="hint">One accent tints broken white/black. Display font is for headings.</p>
	<label class="row">
		<span>Accent</span>
		<input
			type="color"
			value={brand.accent}
			oninput={(e) => setBrand({ accent: e.currentTarget.value })}
		/>
		<code>{brand.accent}</code>
	</label>
	<label class="row">
		<span>Display font</span>
		<select
			value={brand.fontDisplay}
			onchange={(e) => setBrand({ fontDisplay: e.currentTarget.value })}
		>
			{#each fonts as font}
				<option value={font.id}>{font.label}</option>
			{/each}
		</select>
	</label>
	<p class="sample" style="font-family: var(--font-display)">
		Bley · accent check
		<span class="swatch" style="background: var(--accent)"></span>
	</p>
</section>

<section class="block">
	<p class="field-label">Appearance</p>
	<div class="seg" role="radiogroup" aria-label="Appearance">
		{#each choices as choice (choice.id)}
			<button
				type="button"
				class:on={themeChoice.value === choice.id}
				role="radio"
				aria-checked={themeChoice.value === choice.id}
				onclick={() => setTheme(choice.id)}
			>
				{choice.label}
			</button>
		{/each}
	</div>
</section>

<style>
	.block {
		max-width: 520px;
		margin-bottom: 1.75rem;
	}

	.hint {
		margin: 0 0 0.85rem;
		font-size: 13px;
		color: var(--white66);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		font-size: 14px;
		font-weight: 600;
	}

	.row span {
		min-width: 6.5rem;
		color: var(--white66);
		font-weight: 500;
	}

	.row input[type='color'] {
		width: 2.5rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--white11);
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
	}

	.row select {
		flex: 1;
		height: 2.25rem;
		padding: 0 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: var(--gray);
		color: var(--white);
		font: inherit;
	}

	.row code {
		font-size: 12px;
		color: var(--white33);
	}

	.sample {
		margin: 1rem 0 0;
		font-size: 1.35rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.swatch {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 999px;
	}
</style>
