<script>
	import { notePlainText } from '$lib/note-text.js';
	import { notes, selectEntity, ui } from '$lib/workspace.svelte.js';
</script>

<svelte:head><title>Notes</title></svelte:head>

<div class="feed">
	{#if notes.length === 0}
		<p class="empty">No notes yet</p>
	{:else}
		{#each notes as note (note.id)}
			<button
				type="button"
				class="row"
				class:on={ui.selection?.kind === 'note' && ui.selection.id === note.id}
				onclick={() => selectEntity('note', note.id)}
			>
				<span class="title">{note.title}</span>
				<span class="preview">{notePlainText(note.body).slice(0, 140)}</span>
			</button>
		{/each}
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
	}

	.empty {
		padding: 48px 16px;
		color: var(--white66);
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.2rem;
		width: 100%;
		padding: 0.9rem 1rem;
		border: 0;
		border-bottom: 1.4px solid var(--white11);
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--white4);
	}

	.row.on {
		background: var(--white8);
	}

	.title,
	.preview {
		display: block;
		width: 100%;
		margin: 0;
		padding: 0;
		text-align: left;
	}

	.title {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		line-height: 1.4;
		color: var(--white33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
