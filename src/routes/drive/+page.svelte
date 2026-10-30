<script>
	import { tick } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import { listEntries, uploadFile } from '$lib/drive/entities.js';
	import { childrenOf } from '$lib/drive/tree.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { driveUploadUi } from '$lib/drive/upload-ui.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';

	/** @type {{ path: string, kind: string }[]} */
	let entries = $state([]);
	/** Current folder path (`''` = drive root). */
	let cwd = $state('');
	/** Highlighted item path within the current folder. */
	let selected = $state(/** @type {string | null} */ (null));
	let loading = $state(false);
	let uploading = $state(false);
	let err = $state('');
	/** @type {HTMLInputElement | undefined} */
	let fileInput;

	const items = $derived(childrenOf(entries, cwd));

	const uploadFolder = $derived(cwd || 'files');

	const backLabel = $derived.by(() => {
		if (!cwd) return '';
		const i = cwd.lastIndexOf('/');
		if (i < 0) return 'Drive';
		const parent = cwd.slice(0, i);
		const seg = parent.includes('/') ? parent.slice(parent.lastIndexOf('/') + 1) : parent;
		return seg || 'Drive';
	});

	/** @param {string} name */
	function labelOf(name) {
		if (!name) return name;
		return name.charAt(0).toUpperCase() + name.slice(1);
	}

	async function reload() {
		const session = activeSession();
		if (!session) {
			entries = [];
			return;
		}
		loading = true;
		err = '';
		try {
			entries = await listEntries(session);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (ui.source === 'drive' || driveSession.connected) reload();
	});

	$effect(() => {
		driveUploadUi.requestId;
		if (!driveUploadUi.pending) return;
		if (ui.source !== 'drive') {
			driveUploadUi.pending = false;
			return;
		}
		driveUploadUi.pending = false;
		tick().then(() => fileInput?.click());
	});

	/**
	 * @param {import('$lib/drive/tree.js').TreeItem} item
	 */
	function onItem(item) {
		selected = item.path;
		if (item.isFolder) {
			cwd = item.path;
			selected = null;
		}
	}

	function goUp() {
		if (!cwd) return;
		const i = cwd.lastIndexOf('/');
		const parent = i >= 0 ? cwd.slice(0, i) : '';
		selected = cwd;
		cwd = parent;
	}

	async function onFiles(/** @type {Event} */ e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = input.files;
		const session = activeSession();
		if (!session || !files?.length) return;
		uploading = true;
		err = '';
		try {
			for (const file of files) {
				await uploadFile(session, uploadFolder, file);
			}
			await reload();
		} catch (ex) {
			err = ex instanceof Error ? ex.message : String(ex);
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<svelte:head><title>Drive</title></svelte:head>

<div class="feed drive">
	{#if ui.source === 'drive'}
		<input bind:this={fileInput} type="file" multiple hidden onchange={onFiles} />
	{/if}

	{#if ui.source !== 'drive'}
		<p class="empty">Drive is disconnected. Connect in Settings, then browse here.</p>
	{:else}
		{#if err}
			<p class="err">{err}</p>
		{/if}
		{#if cwd}
			<button type="button" class="back" onclick={goUp}>
				<span class="back-chev" aria-hidden="true">‹</span>
				<span>{labelOf(backLabel)}</span>
			</button>
		{/if}
		{#if uploading}
			<p class="status">Uploading to <code>{uploadFolder}/</code>…</p>
		{/if}
		{#if loading && entries.length === 0}
			<FeedSkeleton rows={8} />
		{:else if items.length === 0}
			<p class="empty">Empty folder</p>
		{:else}
			<div class="card-stack">
				{#each items as item (item.path)}
					<button
						type="button"
						class="drive-card"
						class:selected={selected === item.path}
						onclick={() => onItem(item)}
					>
						<span class="title">{labelOf(item.name)}</span>
						<span class="meta">{item.isFolder ? 'Folder' : item.kind}</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.drive {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		align-self: flex-start;
		margin: 0 10px 4px;
		padding: 6px 8px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.back:hover {
		background: var(--fg-4);
		color: var(--fg);
	}

	.back-chev {
		font-size: 16px;
		line-height: 1;
		color: var(--fg-33);
	}

	.status,
	.empty,
	.err {
		margin: 0;
		padding: 12px 16px;
		color: var(--fg-66);
		font-size: 13px;
	}

	.err {
		color: var(--danger, #c44);
	}

	.status code {
		color: var(--fg-33);
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 4px 6px 10px;
		box-sizing: border-box;
	}

	.drive-card {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		height: 44px;
		padding: 10px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.drive-card:hover {
		background: var(--fg-4);
	}

	.drive-card.selected {
		background: var(--fg-4);
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
	}

	.meta {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-33);
	}
</style>
