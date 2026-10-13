<script>
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
				<span class="preview">{note.body.replace(/\s+/g, ' ').trim().slice(0, 120)}</span>
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
		align-items: flex-start;
		gap: 0.25rem;
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

	.title {
		font-size: 15px;
		font-weight: 600;
		color: var(--white);
	}

	.preview {
		font-size: 13px;
		line-height: 1.4;
		color: var(--white33);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
