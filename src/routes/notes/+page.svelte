<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { notePlainText } from '$lib/note-text.js';
	import { notes, selectEntity, ui } from '$lib/workspace.svelte.js';

	const RECENT_MS = 7 * 86_400_000;

	/** @param {any} note */
	function noteEditedAt(note) {
		return note.updatedAt || note.createdAt || 0;
	}

	const filtered = $derived.by(() => {
		const f = ui.listFilter;
		const now = Date.now();
		let list = [...notes];
		if (f === 'recent') {
			list = list.filter((n) => {
				const t = noteEditedAt(n);
				return t > 0 && now - t < RECENT_MS;
			});
		} else if (f === 'linked') {
			list = list.filter((n) => (n.project_ids ?? []).length > 0);
		} else if (f === 'unlinked') {
			list = list.filter((n) => (n.project_ids ?? []).length === 0);
		}
		return list.sort((a, b) => noteEditedAt(b) - noteEditedAt(a));
	});

	/** @param {number | undefined} ts */
	function formatNoteTime(ts) {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		const now = new Date();
		const sameYear = d.getFullYear() === now.getFullYear();
		return d.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			...(sameYear ? {} : { year: 'numeric' })
		});
	}
</script>

<svelte:head><title>Notes</title></svelte:head>

<div class="feed">
	{#if !appBoot.listsReady && notes.length === 0}
		<FeedSkeleton rows={8} />
	{:else if notes.length === 0}
		<p class="empty">No notes yet</p>
	{:else if filtered.length === 0}
		<p class="empty">No notes match this filter</p>
	{:else}
		<div class="card-stack">
			{#each filtered as note (note.id)}
				<button
					type="button"
					class="row"
					class:on={ui.selection?.kind === 'note' && ui.selection.id === note.id}
					onclick={() => selectEntity('note', note.id)}
				>
					<span class="title-row">
						<span class="title">{note.title}</span>
						{#if noteEditedAt(note)}
							<span class="time">{formatNoteTime(noteEditedAt(note))}</span>
						{/if}
					</span>
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
		}

	.empty {
		padding: 48px 16px;
		color: var(--fg-66);
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 6px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(0.2rem + 2px);
		width: 100%;
		padding: calc(0.85rem - 4px) calc(0.9rem - 2px);
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
		background: var(--fg-4);
	}

	.title-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-width: 0;
		margin: 0;
		padding: 0;
	}

	.title,
	.preview {
		display: block;
		margin: 0;
		padding: 0;
		text-align: left;
	}

	.title {
		flex: 1;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.time {
		flex-shrink: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
		letter-spacing: 0.01em;
		white-space: nowrap;
	}

	.preview {
		width: 100%;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		line-height: 1.4;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
