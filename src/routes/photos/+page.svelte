<script>
	import { onMount, tick, untrack } from 'svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import PhotoTile from '$lib/components/PhotoTile.svelte';
	import { listEntries, uploadLibraryMedia } from '$lib/drive/entities.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { listPhotoItems } from '$lib/photos.js';
	import { photosUploadUi } from '$lib/photos-upload.svelte.js';
	import { openMediaLightbox } from '$lib/media-lightbox.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const ENTRIES_CACHE_KEY = 'alpha.photos.entries.v1';

	/** @type {{ path: string, kind: string, display_name?: string | null }[]} */
	let entries = $state([]);
	let loading = $state(true);
	let err = $state('');
	let uploading = $state(false);
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

	onMount(() => {
		untrack(() => hydrateFromCache());
	});

	/** @param {import('$lib/photos.js').PhotoItem} item */
	function onItem(item) {
		const list = items
			.filter((it) => it.kind === 'image' || it.kind === 'video')
			.map((it) => ({
				id: it.key,
				kind: it.kind,
				name: it.name || t('photos.untitled'),
				path: it.path
			}));
		const index = list.findIndex((it) => it.id === item.key);
		openMediaLightbox(list, index >= 0 ? index : 0);
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

<div class="feed photos">
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
				<PhotoTile {item} onclick={() => onItem(item)} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.photos {
		/* Horizontal inset only — vertical pad comes from .feed / feed-pad chrome. */
		padding-left: 0;
		padding-right: 0;
		min-height: 40vh;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
		gap: 1px;
		background: var(--fg-8);
		border-top: 1px solid var(--fg-8);
		border-bottom: 1px solid var(--fg-8);
	}
	@media (min-width: 768px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
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
		margin: 0;
		padding: 10px 16px;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
	}
</style>
