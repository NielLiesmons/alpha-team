<script>
	import { tick } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import folderUrl from '@alpha/ui/icons/folder.svg';
	import { listEntries, uploadFile } from '$lib/drive/entities.js';
	import { childrenOf } from '$lib/drive/tree.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { driveUploadUi } from '$lib/drive/upload-ui.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';

	const RECENT_KEY = 'alpha.files.recent.v1';
	const FAV_KEY = 'alpha.files.favorites.v1';
	const RECENT_MAX = 12;

	/** @type {{ path: string, kind: string }[]} */
	let entries = $state([]);
	/** Current folder path (`''` = files root). */
	let cwd = $state('');
	/** Highlighted item path within the current folder. */
	let selected = $state(/** @type {string | null} */ (null));
	let loading = $state(false);
	let uploading = $state(false);
	let err = $state('');
	/** @type {string[]} */
	let recentPaths = $state(readPathList(RECENT_KEY));
	/** @type {string[]} */
	let favoritePaths = $state(readPathList(FAV_KEY));
	/** @type {HTMLInputElement | undefined} */
	let fileInput;

	const items = $derived(childrenOf(entries, cwd));
	const atRoot = $derived(!cwd);

	const uploadFolder = $derived(cwd || 'files');

	const backLabel = $derived.by(() => {
		if (!cwd) return '';
		const i = cwd.lastIndexOf('/');
		if (i < 0) return 'Files';
		const parent = cwd.slice(0, i);
		const seg = parent.includes('/') ? parent.slice(parent.lastIndexOf('/') + 1) : parent;
		return seg || 'Files';
	});

	const pathIndex = $derived.by(() => {
		/** @type {Map<string, { path: string, kind: string }>} */
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
			const isFolder =
				entry.kind === 'folder' ||
				entries.some((e) => e.path !== path && e.path.startsWith(`${path}/`));
			out.push({
				name,
				path,
				kind: isFolder ? 'folder' : entry.kind,
				isFolder
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
		touchRecent(item.path);
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
				const path = await uploadFile(session, uploadFolder, file);
				touchRecent(path);
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
		{:else if atRoot}
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
							<button
								type="button"
								class="drive-card"
								class:selected={selected === item.path}
								onclick={() => onItem(item)}
							>
								{#if item.isFolder}
									<img class="folder-ico" src={folderUrl} alt="" width="28" height="28" />
								{/if}
								<span class="title">{labelOf(item.name)}</span>
								<span class="meta">{item.isFolder ? 'Folder' : item.kind}</span>
							</button>
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
					<p class="section-empty">Star items from Files to pin them here</p>
				{:else}
					<div class="card-stack">
						{#each favoriteItems as item (item.path)}
							<button
								type="button"
								class="drive-card"
								class:selected={selected === item.path}
								onclick={() => onItem(item)}
								oncontextmenu={(e) => {
									e.preventDefault();
									toggleFavorite(item.path);
								}}
							>
								{#if item.isFolder}
									<img class="folder-ico" src={folderUrl} alt="" width="28" height="28" />
								{/if}
								<span class="title">{labelOf(item.name)}</span>
								<span class="meta">{item.isFolder ? 'Folder' : item.kind}</span>
							</button>
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
							<button
								type="button"
								class="drive-card"
								class:selected={selected === item.path}
								onclick={() => onItem(item)}
								oncontextmenu={(e) => {
									e.preventDefault();
									toggleFavorite(item.path);
								}}
							>
								{#if item.isFolder}
									<img class="folder-ico" src={folderUrl} alt="" width="28" height="28" />
								{/if}
								<span class="title">{labelOf(item.name)}</span>
								<span class="meta">{item.isFolder ? 'Folder' : item.kind}</span>
							</button>
						{/each}
					</div>
				{/if}
			</section>
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
						oncontextmenu={(e) => {
							e.preventDefault();
							toggleFavorite(item.path);
						}}
					>
						{#if item.isFolder}
							<img class="folder-ico" src={folderUrl} alt="" width="28" height="28" />
						{/if}
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
		gap: 10px;
		padding-bottom: 12px;
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
		min-height: 44px;
		padding: 8px 10px;
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
		width: 28px;
		height: 28px;
		object-fit: contain;
		display: block;
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
