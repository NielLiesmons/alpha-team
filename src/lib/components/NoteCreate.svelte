<script>
	import CreateSheet from './CreateSheet.svelte';
	import { closeComposer, notes, ui } from '$lib/workspace.svelte.js';

	let title = $state('');
	let body = $state('');

	const editing = $derived(
		ui.composer?.kind === 'note' && ui.composer.id
			? notes.find((n) => n.id === ui.composer.id)
			: null
	);
	const open = $derived(ui.composer?.kind === 'note');

	$effect(() => {
		if (!open) return;
		title = editing?.title ?? '';
		body = editing?.body ?? '';
	});

	function save() {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		if (editing) {
			editing.title = nextTitle;
			editing.body = body;
		} else {
			const id = crypto.randomUUID();
			notes.unshift({ id, title: nextTitle, body });
			ui.noteId = id;
			ui.selection = { kind: 'note', id };
		}
		closeComposer();
	}
</script>

<CreateSheet {open} label={editing ? 'Edit note' : 'New note'} onclose={closeComposer}>
	<div class="title-row">
		<input class="sheet-input" placeholder="Note title" bind:value={title} />
	</div>
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="Write in markdown" bind:value={body}></textarea>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={!title.trim()} onclick={save}>
			{editing ? 'Save' : 'Create'}
		</button>
	</div>
</CreateSheet>
