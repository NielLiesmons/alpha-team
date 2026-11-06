<script>
	import CreateSheet from './CreateSheet.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { closeComposer, enterprises, saveMetric, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let key = $state('');
	let expr = $state('sum(table:egg_laying, col:eggs)');
	/** @type {string} */
	let enterpriseId = $state('');
	/** @type {string | null} */
	let seededFor = $state(null);

	const open = $derived(ui.composer?.kind === 'metric');

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		const seedKey = typeof ui.composer?.enterprise_id === 'string' ? ui.composer.enterprise_id : '';
		const stamp = `__new__:${seedKey}`;
		if (seededFor === stamp) return;
		seededFor = stamp;
		title = '';
		key = '';
		expr = 'sum(table:egg_laying, col:eggs)';
		enterpriseId = seedKey;
	});

	async function save() {
		const k = key.trim() || title.trim().toLowerCase().replace(/\s+/g, '.');
		if (!k || !expr.trim()) return;
		await saveMetric(
			{
				title: title.trim() || k,
				key: k,
				expr: expr.trim(),
				enterprise_id: enterpriseId || null
			},
			true
		);
		closeComposer();
	}
</script>

<CreateSheet {open} label="New metric" onclose={closeComposer}>
	<input class="sheet-input" placeholder="Title" bind:value={title} />
	<input class="sheet-input" placeholder="Key (eggs.month_total)" bind:value={key} />
	<textarea class="sheet-input area" rows="3" placeholder="Expression" bind:value={expr}></textarea>
	{#if enterprises.length}
		<select class="sheet-input" bind:value={enterpriseId}>
			<option value="">Enterprise (optional)</option>
			{#each enterprises as ent (ent.id)}
				<option value={ent.id}>{ent.title}</option>
			{/each}
		</select>
	{/if}
	<div class="sheet-bottom">
		<PrimaryButton size="sheet" disabled={!expr.trim()} onclick={() => void save()}>Create</PrimaryButton>
	</div>
</CreateSheet>

<style>
	.area {
		min-height: 72px;
		resize: vertical;
		padding-top: 10px;
	}
</style>
