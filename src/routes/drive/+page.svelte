<script>
	import { listEntries, uploadFile } from '$lib/drive/entities.js';
	import { childrenOf } from '$lib/drive/tree.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';

	/** @type {{ path: string, kind: string }[]} */
	let entries = $state([]);
	/** @type {string[]} selected folder path per column (column i shows children of selected[i-1] or root) */
	let selection = $state(/** @type {string[]} */ ([]));
	let loading = $state(false);
	let uploading = $state(false);
	let err = $state('');
	/** @type {HTMLInputElement | undefined} */
	let fileInput;

	const columns = $derived.by(() => {
		/** @type {{ folderPath: string, items: ReturnType<typeof childrenOf>, selected: string | null }[]} */
		const cols = [];
		cols.push({
			folderPath: '',
			items: childrenOf(entries, ''),
			selected: selection[0] ?? null
		});
		for (let i = 0; i < selection.length; i++) {
			const folderPath = selection[i];
			const items = childrenOf(entries, folderPath);
			const hasFolderChild = items.some((it) => it.isFolder);
			const isFile = entries.some((e) => e.path === folderPath && e.kind !== 'folder');
			if (isFile && items.length === 0) break;
			cols.push({
				folderPath,
				items,
				selected: selection[i + 1] ?? null
			});
			if (!hasFolderChild && items.every((it) => !it.isFolder)) {
				/* last column showing files — ok */
			}
		}
		return cols;
	});

	const targetFolder = $derived(
		(() => {
			if (selection.length === 0) return 'files';
			const last = selection[selection.length - 1];
			const kids = childrenOf(entries, last);
			const self = entries.find((e) => e.path === last);
			if (self && kids.length === 0 && !self.path.endsWith('/')) {
				/* selected a file — upload to its parent */
				const i = last.lastIndexOf('/');
				return i >= 0 ? last.slice(0, i) : 'files';
			}
			return last;
		})()
	);

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

	/**
	 * @param {number} colIndex
	 * @param {import('$lib/drive/tree.js').TreeItem} item
	 */
	function selectItem(colIndex, item) {
		selection = [...selection.slice(0, colIndex), item.path];
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
				await uploadFile(session, targetFolder, file);
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

<header class="page-head">
	<div>
		<h1>Drive</h1>
		<p>
			Column browser — content-type folders. Upload into the selected folder.
		</p>
	</div>
	{#if ui.source === 'drive'}
		<button type="button" class="new-btn" disabled={uploading} onclick={() => fileInput?.click()}>
			{uploading ? 'Uploading…' : 'Upload'}
		</button>
		<input bind:this={fileInput} type="file" multiple hidden onchange={onFiles} />
	{/if}
</header>

{#if ui.source !== 'drive'}
	<p class="empty">Drive is disconnected. Connect in Settings, then browse here.</p>
{:else}
	<p class="path">Upload → <code>{targetFolder}/</code></p>
	{#if err}
		<p class="err">{err}</p>
	{/if}
	{#if loading && entries.length === 0}
		<p class="muted">Loading…</p>
	{:else}
		<div class="miller" role="navigation" aria-label="Drive folders">
			{#each columns as col, colIndex (col.folderPath + '-' + colIndex)}
				<div class="col">
					{#if col.items.length === 0}
						<p class="col-empty">Empty</p>
					{:else}
						{#each col.items as item (item.path)}
							<button
								type="button"
								class="row"
								class:on={col.selected === item.path}
								class:folder={item.isFolder}
								onclick={() => selectItem(colIndex, item)}
							>
								<span class="name">{item.name}</span>
								{#if item.isFolder}
									<span class="chev" aria-hidden="true">›</span>
								{:else}
									<span class="kind">{item.kind}</span>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.page-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1rem 0.5rem;
	}

	.page-head p {
		margin: 0.35rem 0 0;
		font-size: 13px;
		color: var(--white66);
	}

	.page-head a {
		color: var(--white);
	}

	.new-btn {
		flex-shrink: 0;
		height: 2.25rem;
		padding: 0 1rem;
		border: 0;
		border-radius: 10px;
		background: var(--white);
		color: var(--black);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.new-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.path {
		margin: 0;
		padding: 0 1rem 0.65rem;
		font-size: 12px;
		color: var(--white33);
	}

	.path code {
		color: var(--white66);
	}

	.muted,
	.empty,
	.err {
		padding: 1rem;
		color: var(--white66);
		font-size: 13px;
	}

	.miller {
		display: flex;
		align-items: stretch;
		min-height: min(60dvh, 520px);
		border-top: 1px solid var(--white11);
		overflow-x: auto;
	}

	.col {
		flex: 0 0 min(220px, 42vw);
		min-width: 160px;
		max-width: 280px;
		border-right: 1px solid var(--white11);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.col-empty {
		margin: 0;
		padding: 1rem;
		font-size: 12px;
		color: var(--white33);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.55rem 0.75rem;
		border: 0;
		border-bottom: 1px solid var(--white8);
		background: transparent;
		color: var(--white66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--white4);
		color: var(--white);
	}

	.row.on {
		background: var(--white8);
		color: var(--white);
	}

	.row.folder .name {
		font-weight: 600;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chev {
		color: var(--white33);
		font-size: 14px;
	}

	.kind {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--white33);
	}

	@media (max-width: 767px) {
		.miller {
			min-height: 50dvh;
		}

		.col {
			flex-basis: 70vw;
			max-width: none;
		}
	}
</style>
