<script>
	import { notes, ui } from '$lib/workspace.svelte.js';

	const note = $derived(notes.find((item) => item.id === ui.noteId) ?? notes[0] ?? null);
	let preview = $state(false);
</script>

<svelte:head><title>{note?.title ?? 'Notes'}</title></svelte:head>

<div class="fill">
	{#if note}
		<div class="bar">
			<input class="title" bind:value={note.title} aria-label="Note title" />
			<button type="button" class="mode" class:on={preview} onclick={() => (preview = !preview)}>
				{preview ? 'Edit' : 'Preview'}
			</button>
		</div>
		{#if preview}
			<pre class="preview">{note.body}</pre>
		{:else}
			<textarea class="editor" bind:value={note.body} aria-label="Markdown" spellcheck="false"></textarea>
		{/if}
	{:else}
		<p class="empty">No notes yet.</p>
	{/if}
</div>

<style>
	.fill {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--shell-border);
		flex-shrink: 0;
	}

	.title {
		flex: 1;
		border: 0;
		background: transparent;
		outline: none;
		color: var(--white);
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.mode {
		height: 28px;
		padding: 0 12px;
		border: 0;
		border-radius: 8px;
		background: var(--white8);
		color: var(--white66);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.mode.on {
		color: var(--white);
	}

	.editor,
	.preview {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 16px 20px 32px;
		border: 0;
		background: transparent;
		color: var(--white);
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 14px;
		line-height: 1.6;
		resize: none;
		outline: none;
		overflow: auto;
		white-space: pre-wrap;
	}

	.empty {
		padding: 24px;
		color: var(--white66);
	}
</style>
