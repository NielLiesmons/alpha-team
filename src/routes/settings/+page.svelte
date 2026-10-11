<script>
	import { setTheme, themeChoice } from '$lib/theme.svelte.js';

	const choices = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'gray', label: 'Gray' },
		{ id: 'dark', label: 'Dark' }
	];
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<header class="page-head">
	<div>
		<h1>Settings</h1>
		<p>Appearance follows this browser until you pick a theme.</p>
	</div>
</header>

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
	}
</style>
