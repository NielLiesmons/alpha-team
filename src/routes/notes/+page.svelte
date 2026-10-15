<script>
	import { notePlainText } from '$lib/note-text.js';
	import { notes, selectEntity, ui } from '$lib/workspace.svelte.js';
</script>

<svelte:head><title>Notes</title></svelte:head>

<div class="feed">
	{#if notes.length === 0}
		<p class="empty">No notes yet</p>
	{:else}
		<div class="card-stack">
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
		</div>
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding-bottom: 8px;
	}

	.empty {
		padding: 48px 16px;
		color: var(--fg-66);
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.2rem;
		width: 100%;
		padding: 0.85rem 0.9rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
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
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		line-height: 1.4;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
