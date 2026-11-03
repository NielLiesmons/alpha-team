<script>
	import { onMount, tick, untrack } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import folderUrl from '@alpha/ui/icons/folder.svg';
	import { listEntries, uploadFile } from '$lib/drive/entities.js';
	import { childrenOf } from '$lib/drive/tree.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { driveUploadUi } from '$lib/drive/upload-ui.svelte.js';
	import {
		fileDisplayTitle,
		fileTypeColors,
		folderDisplayTitle,
		splitFileTitle
	} from '$lib/file-display.js';
	import { filesView, isFilesFolderPath, setFilesEntries } from '$lib/files-view.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';

	const RECENT_KEY = 'alpha.files.recent.v1';
	const FAV_KEY = 'alpha.files.favorites.v1';
	const RECENT_MAX = 12;
	const ENTRIES_CACHE_KEY = 'alpha.files.entries.v1';

	/** Highlighted item path in the list. */
	let selected = $state(/** @type {string | null} */ (null));
	let uploading = $state(false);
	/** @type {string[]} */
	let recentPaths = $state(readPathList(RECENT_KEY));
	/** @type {string[]} */
	let favoritePaths = $state(readPathList(FAV_KEY));
	/** @type {HTMLInputElement | undefined} */
	let fileInput;
	/** Prevent overlapping Drive list fetches. */
	let reloadGen = 0;
	let reloadInFlight = false;

	const entries = $derived(filesView.entries);
	const loading = $derived(filesView.loading);
	const err = $derived(filesView.error);
	const items = $derived(childrenOf(entries, ''));

	const pathIndex = $derived.by(() => {
		/** @type {Map<string, { path: string, kind: string, display_name?: string | null }>} */
		const map = new Map();
		for (const e of entries) map.set(e.path, e);
		return map;
	});

	/** @param {string[]} paths */
	function resolveItems(paths) {
		/** @type {import('$lib/drive/tree.js').TreeItem[]} */
		const out = [];
		const seen = new Set();
		for (const path of paths) {
			if (!path || seen.has(path)) continue;
			const entry = pathIndex.get(path);
			if (!entry) continue;
			seen.add(path);
			const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
			const isFolder = entry.kind === 'folder' || isFilesFolderPath(path);
			out.push({
				name,
				path,
				kind: isFolder ? 'folder' : entry.kind,
				isFolder,
				display_name: entry.display_name ?? null
			});
		}
		return out;
	}

	const recentItems = $derived(resolveItems(recentPaths));
	const favoriteItems = $derived(resolveItems(favoritePaths));

	/** @param {string} key */
	function readPathList(key) {
		if (typeof localStorage === 'undefined') return [];
		try {
			const raw = JSON.parse(localStorage.getItem(key) || '[]');
			return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
		} catch {
			return [];
		}
	}

	/** @param {string} key @param {string[]} list */
	function writePathList(key, list) {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(key, JSON.stringify(list));
		} catch {
			/* quota */
		}
	}

	function hydrateEntriesFromCache() {
		if (typeof localStorage === 'undefined') return;
		if (filesView.entries.length > 0) return;
		try {
			const raw = JSON.parse(localStorage.getItem(ENTRIES_CACHE_KEY) || 'null');
			if (Array.isArray(raw?.entries) && raw.entries.length) {
				setFilesEntries(raw.entries);
			}
		} catch {
			/* ignore */
		}
	}

	/** @param {typeof filesView.entries} list */
	function persistEntries(list) {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify({ at: Date.now(), entries: list }));
		} catch {
			/* ignore */
		}
	}

	/** @param {string} path */
	function touchRecent(path) {
		const next = [path, ...recentPaths.filter((p) => p !== path)].slice(0, RECENT_MAX);
		recentPaths = next;
		writePathList(RECENT_KEY, next);
	}

	/** @param {string} path */
	function toggleFavorite(path) {
		const on = favoritePaths.includes(path);
		const next = on ? favoritePaths.filter((p) => p !== path) : [path, ...favoritePaths];
		favoritePaths = next;
		writePathList(FAV_KEY, next);
	}

	async function reload() {
		const session = activeSession();
		if (!session) {
			setFilesEntries([]);
			return;
		}
		const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
		if (offline && filesView.entries.length > 0) {
			filesView.loading = false;
			return;
		}
		if (reloadInFlight) return;
		reloadInFlight = true;
		const gen = ++reloadGen;
		filesView.loading = filesView.entries.length === 0;
		filesView.error = '';
		try {
			const list = await listEntries(session);
			if (gen !== reloadGen) return;
			setFilesEntries(list);
			persistEntries(list);
		} catch (e) {
			if (gen !== reloadGen) return;
			filesView.error = e instanceof Error ? e.message : String(e);
			/* keep cached entries */
		} finally {
			if (gen === reloadGen) {
				filesView.loading = false;
				reloadInFlight = false;
			}
		}
	}

	/*
	 * Load once when Drive is available — never track filesView.entries here or
	 * assigning the list re-fires the effect into an infinite tip/fetch loop.
	 */
	$effect(() => {
		const connected = driveSession.connected;
		const source = ui.source;
		if (!(source === 'drive' || connected)) return;
		untrack(() => {
			hydrateEntriesFromCache();
			void reload();
		});
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

	onMount(() => {
		untrack(() => hydrateEntriesFromCache());
	});

	/**
	 * @param {import('$lib/drive/tree.js').TreeItem} item
	 */
	function onItem(item) {
		selected = item.path;
		touchRecent(item.path);
		/* Folders + files open in the detail (3rd) column — never replace the list. */
		selectEntity('file', item.path);
	}

	async function onFiles(/** @type {Event} */ e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = input.files;
		const session = activeSession();
		if (!session || !files?.length) return;
		uploading = true;
		filesView.error = '';
		try {
			for (const file of files) {
				const path = await uploadFile(session, 'files', file);
				touchRecent(path);
			}
			await reload();
		} catch (ex) {
			filesView.error = ex instanceof Error ? ex.message : String(ex);
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

{#snippet fileCard(item)}
	{@const titleText = item.isFolder ? folderDisplayTitle(item) : fileDisplayTitle(item)}
	{@const parts = splitFileTitle(titleText, { isFolder: item.isFolder })}
	{@const colors = fileTypeColors(parts.ext || 'file')}
	<button
		type="button"
		class="drive-card"
		class:selected={selected === item.path ||
			(ui.selection?.kind === 'file' && ui.selection?.id === item.path)}
		onclick={() => onItem(item)}
		oncontextmenu={(e) => {
			e.preventDefault();
			toggleFavorite(item.path);
		}}
	>
		{#if item.isFolder}
			<img class="folder-ico" src={folderUrl} alt="" width="18" height="18" />
			<span class="folder-name">{parts.stem}</span>
			<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path
					d="M6 3.5 10.5 8 6 12.5"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		{:else}
			<span
				class="type-box"
				style:color={colors.ink}
				style:background={colors.wash}
				aria-hidden="true">{parts.label || 'FILE'}</span
			>
			<span class="name-line"
				><span class="stem">{parts.stem}</span
				>{#if parts.ext}<span class="ext">.{parts.ext}</span>{/if}</span
			>
		{/if}
	</button>
{/snippet}

<svelte:head><title>Files</title></svelte:head>

<div class="feed drive">
	{#if ui.source === 'drive'}
		<input bind:this={fileInput} type="file" multiple hidden onchange={onFiles} />
	{/if}

	{#if ui.source !== 'drive'}
		<p class="empty">Files is disconnected. Connect Drive in Settings, then browse here.</p>
	{:else}
		{#if err}
			<p class="err">{err}</p>
		{/if}
		{#if uploading}
			<p class="status">Uploading…</p>
		{/if}
		{#if loading && entries.length === 0}
			<FeedSkeleton rows={8} />
		{:else}
			<section class="file-section">
				<div class="group-header">
					<span class="eyebrow-label-xs">Recent</span>
					<span class="group-count">{recentItems.length}</span>
				</div>
				{#if recentItems.length === 0}
					<p class="section-empty">Nothing recent yet</p>
				{:else}
					<div class="card-stack">
						{#each recentItems as item (item.path)}
							{@render fileCard(item)}
						{/each}
					</div>
				{/if}
			</section>

			<section class="file-section">
				<div class="group-header">
					<span class="eyebrow-label-xs">Favorites</span>
					<span class="group-count">{favoriteItems.length}</span>
				</div>
				{#if favoriteItems.length === 0}
					<p class="section-empty">Right-click a file to favorite it</p>
				{:else}
					<div class="card-stack">
						{#each favoriteItems as item (item.path)}
							{@render fileCard(item)}
						{/each}
					</div>
				{/if}
			</section>

			<section class="file-section">
				<div class="group-header">
					<span class="eyebrow-label-xs">Files</span>
					<span class="group-count">{items.length}</span>
				</div>
				{#if items.length === 0}
					<p class="section-empty">Empty</p>
				{:else}
					<div class="card-stack">
						{#each items as item (item.path)}
							{@render fileCard(item)}
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</div>

<style>
	.drive {
		display: flex;
		flex-direction: column;
		min-height: 0;
		gap: 0;
	}

	.file-section {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 0;
	}

	.group-count {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 500;
		font-variant-numeric: lining-nums;
		font-feature-settings: 'lnum' 1, 'tnum' 0, 'onum' 0;
		color: var(--fg-33);
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.section-empty {
		margin: 0;
		padding: 10px 16px 6px;
		font-size: 13px;
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
		gap: 10px;
		width: 100%;
		min-height: 40px;
		padding: 6px 10px;
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

	.folder-ico {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		object-fit: contain;
		display: block;
		opacity: 0.72;
	}

	.folder-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 400;
		color: var(--fg-66);
	}

	.chev {
		flex-shrink: 0;
		color: var(--fg-33);
		opacity: 0.55;
	}

	.type-box {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.name-line {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 500;
	}

	.stem {
		color: var(--fg);
	}

	.ext {
		color: var(--fg-33);
		font-weight: 500;
	}
</style>
