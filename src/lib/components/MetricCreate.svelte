<script>
	import CreateSheet from './CreateSheet.svelte';
	import { closeComposer, enterprises, saveMetric, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let key = $state('');
	let expr = $state('sum(table:egg_actuals, col:dozen)');
	/** @type {string} */
	let enterpriseId = $state('');

	const open = $derived(ui.composer?.kind === 'metric');

	$effect(() => {
		if (!open) return;
		title = '';
		key = '';
		expr = 'sum(table:egg_actuals, col:dozen)';
		enterpriseId = '';
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
	<input class="sheet-input" placeholder="Key (eggs.actual_month)" bind:value={key} />
	<textarea class="sheet-input area" rows="3" placeholder="Expression" bind:value={expr}></textarea>
	<select class="sheet-input" bind:value={enterpriseId}>
		<option value="">Enterprise (optional)</option>
		{#each enterprises as ent (ent.id)}
			<option value={ent.id}>{ent.title}</option>
		{/each}
	</select>
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!expr.trim()} onclick={() => void save()}
			>Create</button
		>
	</div>
</CreateSheet>

<style>
	.area {
		min-height: 72px;
		resize: vertical;
		padding-top: 10px;
	}
</style>
