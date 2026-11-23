<script>
	import { onMount, tick, untrack } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import PhotoTile from '$lib/components/PhotoTile.svelte';
	import { listEntries, uploadLibraryMedia } from '$lib/drive/entities.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { getAttachmentObjectUrl } from '$lib/drive/media-cache.js';
	import { listPhotoItems } from '$lib/photos.js';
	import { photosUploadUi } from '$lib/photos-upload.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const ENTRIES_CACHE_KEY = 'alpha.photos.entries.v1';

	/** @type {{ path: string, kind: string, display_name?: string | null }[]} */
	let entries = $state([]);
	let loading = $state(true);
	let err = $state('');
	let uploading = $state(false);
	/** @type {import('$lib/photos.js').PhotoItem | null} */
	let selected = $state(null);
	let viewerUrl = $state('');
	let viewerKind = $state(/** @type {'image' | 'video'} */ ('image'));
	/** @type {HTMLInputElement | undefined} */
	let fileInput;
	let reloadGen = 0;
	let reloadInFlight = false;

	const items = $derived(listPhotoItems(entries));

	function hydrateFromCache() {
		if (typeof localStorage === 'undefined') return;
		if (entries.length > 0) return;
		try {
			const raw = JSON.parse(localStorage.getItem(ENTRIES_CACHE_KEY) || 'null');
			if (Array.isArray(raw?.entries) && raw.entries.length) {
				entries = raw.entries;
			}
		} catch {
			/* ignore */
		}
	}

	/** @param {typeof entries} list */
	function persistEntries(list) {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify({ at: Date.now(), entries: list }));
		} catch {
			/* ignore */
		}
	}

	async function reload() {
		const session = activeSession();
		if (!session) {
			entries = [];
			loading = false;
			return;
		}
		const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
		if (offline && entries.length > 0) {
			loading = false;
			return;
		}
		if (reloadInFlight) return;
		reloadInFlight = true;
		const gen = ++reloadGen;
		loading = entries.length === 0;
		err = '';
		try {
			const list = await listEntries(session);
			if (gen !== reloadGen) return;
			entries = list;
			persistEntries(list);
		} catch (e) {
			if (gen !== reloadGen) return;
			err = e instanceof Error ? e.message : String(e);
		} finally {
			if (gen === reloadGen) {
				loading = false;
				reloadInFlight = false;
			}
		}
	}

	$effect(() => {
		const connected = driveSession.connected;
		const source = ui.source;
		if (!(source === 'drive' || connected)) return;
		untrack(() => {
			hydrateFromCache();
			void reload();
		});
	});

	$effect(() => {
		photosUploadUi.requestId;
		if (!photosUploadUi.pending) return;
		if (ui.source !== 'drive') {
			photosUploadUi.pending = false;
			return;
		}
		photosUploadUi.pending = false;
		tick().then(() => fileInput?.click());
	});

	$effect(() => {
		const item = selected;
		viewerUrl = '';
		if (!item) return;
		const session = activeSession();
		if (!session) return;
		const ac = new AbortController();
		viewerKind = item.kind;
		void getAttachmentObjectUrl(
			session,
			{ path: item.path, kind: item.kind, name: item.name },
			{ signal: ac.signal }
		).then((res) => {
			if (ac.signal.aborted) return;
			if (res?.url) {
				viewerUrl = res.url;
				if (res.kind === 'image' || res.kind === 'video') viewerKind = res.kind;
			}
		});
		return () => ac.abort();
	});

	onMount(() => {
		untrack(() => hydrateFromCache());
	});

	/** @param {import('$lib/photos.js').PhotoItem} item */
	function onItem(item) {
		selected = selected?.key === item.key ? null : item;
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
				await uploadLibraryMedia(session, file);
			}
			await reload();
		} catch (ex) {
			const msg = ex instanceof Error ? ex.message : String(ex);
			err = msg === 'photos.imageOrVideoOnly' ? t('photos.imageOrVideoOnly') : msg;
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<svelte:head><title>{t('photos.title')}</title></svelte:head>

<input
	bind:this={fileInput}
	type="file"
	accept="image/*,video/*"
	multiple
	hidden
	onchange={onFiles}
/>

<div class="photos">
	{#if loading && items.length === 0}
		<FeedSkeleton rows={6} />
	{:else if err && items.length === 0}
		<p class="empty-body err">{err}</p>
	{:else if items.length === 0}
		<div class="empty">
			<p class="empty-title">{t('photos.emptyTitle')}</p>
			<p class="empty-body">{t('photos.emptyBody')}</p>
		</div>
	{:else}
		{#if uploading}
			<p class="status">{t('photos.uploading')}</p>
		{/if}
		{#if err}
			<p class="status err">{err}</p>
		{/if}
		<div class="grid">
			{#each items as item (item.key)}
				<PhotoTile
					{item}
					selected={selected?.key === item.key}
					onclick={() => onItem(item)}
				/>
			{/each}
		</div>
	{/if}
</div>

{#if selected}
	<div class="viewer" role="dialog" aria-modal="true" aria-label={selected.name}>
		<button type="button" class="scrim" onclick={() => (selected = null)} aria-label={t('common.close')}
		></button>
		<div class="viewer-card">
			<header class="viewer-head">
				<span class="viewer-name">{selected.name}</span>
				<button type="button" class="viewer-close" onclick={() => (selected = null)}>
					{t('common.close')}
				</button>
			</header>
			<div class="viewer-body">
				{#if viewerUrl && viewerKind === 'video'}
					<video class="viewer-media" src={viewerUrl} controls playsinline></video>
				{:else if viewerUrl}
					<img class="viewer-media" src={viewerUrl} alt={selected.name} />
				{:else}
					<div class="viewer-loading" aria-busy="true">{t('chat.loadingMedia')}</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.photos {
		padding: 8px 12px 28px;
		min-height: 40vh;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
		gap: 6px;
	}
	@media (min-width: 768px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
			gap: 8px;
		}
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: 42vh;
		padding: 24px 20px;
		gap: 8px;
	}
	.empty-title {
		margin: 0;
		font-size: 1.65rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--fg-33);
	}
	.empty-body {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--fg-16);
		max-width: 28ch;
	}
	.empty-body.err,
	.status.err {
		color: var(--fg-66);
	}
	.status {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
	}
	.viewer {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.scrim {
		position: absolute;
		inset: 0;
		border: none;
		background: color-mix(in srgb, var(--bg) 35%, #000 65%);
		cursor: pointer;
	}
	.viewer-card {
		position: relative;
		z-index: 1;
		width: min(920px, 100%);
		max-height: min(88vh, 900px);
		display: flex;
		flex-direction: column;
		border-radius: 18px;
		overflow: hidden;
		background: var(--modal-bg, var(--bg));
		box-shadow: 0 18px 48px color-mix(in srgb, #000 28%, transparent);
	}
	.viewer-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--fg-8);
	}
	.viewer-name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.viewer-close {
		border: none;
		border-radius: 999px;
		padding: 8px 12px;
		background: var(--fg-8);
		color: var(--fg-66);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.viewer-body {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		background: #000;
		padding: 8px;
	}
	.viewer-media {
		max-width: 100%;
		max-height: min(72vh, 780px);
		object-fit: contain;
	}
	.viewer-loading {
		padding: 48px 24px;
		color: var(--fg-33);
		font-size: 14px;
		font-weight: 500;
	}
</style>
