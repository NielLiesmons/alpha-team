<script>
	import {
		cancelUploadJob,
		closeUploadModal,
		openUploadModal,
		uploadUi
	} from '$lib/player.svelte.js';
	import CreateSheet from './CreateSheet.svelte';

	const open = $derived(uploadUi.open);
	const done = $derived(uploadUi.items.filter((i) => i.status === 'done').length);
	const total = $derived(uploadUi.items.length);
	const failed = $derived(uploadUi.items.filter((i) => i.status === 'error').length);
	const heading = $derived(
		uploadUi.active
			? `Uploading ${done}/${total}`
			: total
				? failed
					? `Uploaded ${done}/${total} (${failed} failed)`
					: `Uploaded ${done}/${total}`
				: 'Upload'
	);

	function onclose() {
		closeUploadModal();
	}
</script>

{#if uploadUi.active && !uploadUi.open}
	<button type="button" class="upload-chip" onclick={openUploadModal}>
		<span class="chip-label">Uploading {done}/{total}</span>
		<span class="chip-bar" aria-hidden="true">
			<span class="chip-fill" style={`width: ${total ? Math.round((done / total) * 100) : 0}%`}
			></span>
		</span>
	</button>
{/if}

<CreateSheet {open} label="Upload audio" {onclose}>
	<div class="sheet-title-row">
		<p class="heading">{heading}</p>
	</div>
	<div class="form-divider"></div>
	<div class="list">
		{#if uploadUi.items.length === 0}
			<p class="empty">No files in this batch.</p>
		{:else}
			{#each uploadUi.items as item (item.id)}
				<div class="row" class:done={item.status === 'done'} class:err={item.status === 'error'}>
					<div class="meta">
						<span class="name">{item.name}</span>
						<span class="status">
							{#if item.status === 'queued'}Queued
							{:else if item.status === 'uploading'}{item.progress}%
							{:else if item.status === 'done'}Done
							{:else if item.status === 'canceled'}Canceled
							{:else}{item.error || 'Error'}
							{/if}
						</span>
					</div>
					<div class="bar" aria-hidden="true">
						<span
							class="fill"
							class:fail={item.status === 'error'}
							class:cancel={item.status === 'canceled'}
							style={`width: ${item.status === 'done' ? 100 : item.status === 'queued' ? 0 : item.progress}%`}
						></span>
					</div>
				</div>
			{/each}
		{/if}
	</div>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		{#if uploadUi.active}
			<button type="button" class="cancel-btn" onclick={cancelUploadJob}>Cancel all</button>
		{/if}
		<button type="button" class="publish-btn" onclick={onclose}>
			{uploadUi.active ? 'Hide' : 'Done'}
		</button>
	</div>
</CreateSheet>

<style>
	.upload-chip {
		position: fixed;
		z-index: 45;
		right: 16px;
		bottom: calc(88px + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 160px;
		max-width: min(240px, calc(100vw - 32px));
		padding: 10px 12px;
		border: 1px solid var(--hairline);
		border-radius: 14px;
		background: var(--modal-bg);
		box-shadow: 0 10px 28px var(--shadow-strong);
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.chip-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-66);
	}

	.chip-bar {
		display: block;
		height: 3px;
		border-radius: 999px;
		background: var(--fg-8);
		overflow: hidden;
	}

	.chip-fill {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: 999px;
	}

	.heading {
		margin: 0;
		flex: 1;
		min-width: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--fg);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 16px;
		max-height: min(50vh, 360px);
		overflow: auto;
	}

	.empty {
		margin: 0;
		font-size: 14px;
		color: var(--fg-33);
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.status {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-33);
		font-variant-numeric: tabular-nums;
	}

	.row.err .status {
		color: var(--fg-66);
	}

	.bar {
		height: 4px;
		border-radius: 999px;
		background: var(--fg-8);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--accent);
		transition: width 0.15s linear;
	}

	.fill.fail,
	.fill.cancel {
		background: var(--fg-33);
	}

	.cancel-btn {
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.cancel-btn:hover {
		background: var(--fg-11);
		color: var(--fg);
	}

	@media (min-width: 768px) {
		.upload-chip {
			bottom: 24px;
			right: 24px;
		}
	}
</style>
