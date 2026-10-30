<script>
	import CreateSheet from './CreateSheet.svelte';
	import { closeComposer, enterprises, saveDataTable, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let key = $state('');
	/** @type {string} */
	let enterpriseId = $state('');
	/** @type {string | null} */
	let seededFor = $state(null);

	const open = $derived(ui.composer?.kind === 'table');

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
		enterpriseId = seedKey;
	});

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		const k =
			key.trim() ||
			nextTitle
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '_')
				.replace(/^_|_$/g, '');
		await saveDataTable(
			{
				title: nextTitle,
				key: k,
				enterprise_id: enterpriseId || null,
				columns: [
					{ key: 'value', label: 'Value', type: 'number' },
					{ key: 'note', label: 'Note', type: 'text' }
				]
			},
			true
		);
		closeComposer();
	}
</script>

<CreateSheet {open} label="New table" onclose={closeComposer}>
	<input class="sheet-input" placeholder="Table title" bind:value={title} />
	<input class="sheet-input" placeholder="Key (optional)" bind:value={key} />
	{#if enterprises.length}
		<select class="sheet-input" bind:value={enterpriseId}>
			<option value="">Enterprise (optional)</option>
			{#each enterprises as ent (ent.id)}
				<option value={ent.id}>{ent.title}</option>
			{/each}
		</select>
	{/if}
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={() => void save()}
			>Create</button
		>
	</div>
</CreateSheet>
