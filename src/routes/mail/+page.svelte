<script>
	import { selectEntity, ui } from '$lib/workspace.svelte.js';

	/** @type {'inbox' | 'sent'} */
	let folder = $state('inbox');

	/** Placeholder until IMAP / Stalwart bridge lands — not newsletter tools. */
	const messages = $derived(
		/** @type {{ id: string, from: string, subject: string, preview: string, at: string }[]} */ ([])
	);
</script>

<svelte:head><title>Mail</title></svelte:head>

<div class="mail">
	<div class="folders" role="tablist" aria-label="Mail folders">
		<button
			type="button"
			class="folder"
			class:on={folder === 'inbox'}
			role="tab"
			aria-selected={folder === 'inbox'}
			onclick={() => (folder = 'inbox')}>Inbox</button
		>
		<button
			type="button"
			class="folder"
			class:on={folder === 'sent'}
			role="tab"
			aria-selected={folder === 'sent'}
			onclick={() => (folder = 'sent')}>Sent</button
		>
	</div>

	<div class="feed">
		{#if messages.length === 0}
			<p class="empty">
				{folder === 'inbox' ? 'Inbox is empty' : 'No sent mail yet'}
				<span class="hint"
					>Personal mailbox in/out — not the public newsletter. Wire IMAP here; list letters live under
					Publications.</span
				>
			</p>
		{:else}
			<div class="card-stack">
				{#each messages as m (m.id)}
					<button
						type="button"
						class="row"
						class:on={ui.selection?.kind === 'mail' && ui.selection.id === m.id}
						onclick={() => selectEntity('mail', m.id)}
					>
						<span class="title-row">
							<span class="title">{m.subject}</span>
							<span class="time">{m.at}</span>
						</span>
						<span class="preview">{m.from} — {m.preview}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.mail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}

	.folders {
		display: flex;
		gap: 4px;
		margin: 8px 12px 4px;
		padding: 4px;
		max-width: 220px;
		border-radius: 12px;
		background: var(--fg-4);
	}

	.folder {
		flex: 1;
		height: 32px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
	}

	.folder.on {
		background: var(--fg-8);
		color: var(--fg);
	}

	.feed {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.empty {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 48px 20px;
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg-66);
	}

	.hint {
		font-size: 13px;
		font-weight: 400;
		line-height: 1.4;
		color: var(--fg-33);
		max-width: 28rem;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		padding: 12px 14px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
	}

	.title-row {
		display: flex;
		gap: 8px;
		align-items: center;
		min-width: 0;
	}

	.title {
		flex: 1;
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.time {
		font-size: 12px;
		color: var(--fg-33);
	}

	.preview {
		font-size: 13px;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
