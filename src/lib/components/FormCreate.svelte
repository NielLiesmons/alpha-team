<script>
	import CreateSheet from './CreateSheet.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { closeComposer, dataTables, saveCaptureForm, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	/** @type {string} */
	let tableId = $state('');

	const open = $derived(ui.composer?.kind === 'form');
	const table = $derived(dataTables.find((t) => t.id === tableId));

	$effect(() => {
		if (!open) return;
		title = '';
		tableId = dataTables[0]?.id || '';
	});

	async function save() {
		if (!tableId || !title.trim()) return;
		const fields = (table?.columns || []).map((c) => ({
			column_key: c.key,
			required: true,
			default: c.type === 'date' ? 'today' : undefined
		}));
		await saveCaptureForm(
			{
				title: title.trim(),
				table_id: tableId,
				enterprise_id: table?.enterprise_id ?? null,
				fields: fields.length ? fields : [{ column_key: 'value', required: true }]
			},
			true
		);
		closeComposer();
	}
</script>

<CreateSheet {open} label="New capture form" onclose={closeComposer}>
	<input class="sheet-input" placeholder="Log eggs" bind:value={title} />
	<select class="sheet-input" bind:value={tableId}>
		<option value="" disabled>Select table</option>
		{#each dataTables as t (t.id)}
			<option value={t.id}>{t.title}</option>
		{/each}
	</select>
	<div class="sheet-bottom">
		<PrimaryButton size="sheet" disabled={!tableId || !title.trim()} onclick={() => void save()}
			>Create</PrimaryButton
		>
	</div>
</CreateSheet>
