<script>
	import CreateSheet from './CreateSheet.svelte';
	import { closeComposer, notes, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let body = $state('');

	const open = $derived(ui.composer?.kind === 'note' && !ui.composer.id);

	$effect(() => {
		if (!open) return;
		title = '';
		body = '';
	});

	function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		const id = crypto.randomUUID();
		notes.unshift({ id, title: nextTitle, body });
		ui.noteId = id;
		closeComposer();
	}
</script>

<CreateSheet {open} label="New note" onclose={closeComposer}>
	<div class="title-row">
		<input class="sheet-input" placeholder="Note title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="Write in markdown" bind:value={body}></textarea>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>Create</button>
	</div>
</CreateSheet>
