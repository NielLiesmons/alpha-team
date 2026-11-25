<script>
	import { onMount, tick, untrack } from 'svelte';
	import FeedEmpty from '$lib/components/FeedEmpty.svelte';
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import PhotoTile from '$lib/components/PhotoTile.svelte';
	import { listEntries, uploadLibraryMedia } from '$lib/drive/entities.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { groupPhotosByTime, listPhotoItems } from '$lib/photos.js';
	import { photosUploadUi } from '$lib/photos-upload.svelte.js';
	import { openMediaLightbox } from '$lib/media-lightbox.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const ENTRIES_CACHE_KEY = 'alpha.photos.entries.v1';

	/** @type {{ path: string, kind: string, display_name?: string | null, created_at?: string | null }[]} */
	let entries = $state([]);
	let loading = $state(true);
	let err = $state('');
	let uploading = $state(false);
	/** Upload quality from shell filter — `hd` vs default compressed (`all`). */
	const uploadHd = $derived(ui.listFilter === 'hd');
	/** @type {HTMLInputElement | undefined} */
	let fileInput;
	let reloadGen = 0;
	let reloadInFlight = false;

	const items = $derived(listPhotoItems(entries));
	const groups = $derived(groupPhotosByTime(items));

	/** @param {'today' | 'week' | 'month' | 'earlier'} key */
	function groupLabel(key) {
		if (key === 'today') return t('chat.activityGroupToday');
		if (key === 'week') return t('chat.activityGroupThisWeek');
		if (key === 'month') return t('chat.activityGroupThisMonth');
		return t('chat.activityGroupEarlier');
	}

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
				await uploadLibraryMedia(session, file, { hd: uploadHd });
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
		<FeedEmpty title={t('photos.emptyTitle')} body={t('photos.emptyBody')} />
	{:else}
		{#if uploading}
			<p class="status">{t('photos.uploading')}</p>
		{/if}
		{#if err}
			<p class="status err">{err}</p>
		{/if}
		{#each groups as group (group.key)}
			<section class="photo-group">
				<div class="photo-eyebrow">
					<span class="eyebrow-label-xs">{groupLabel(group.key)}</span>
				</div>
				<div class="grid">
					{#each group.items as item (item.key)}
						<PhotoTile {item} onclick={() => onItem(item)} />
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.photos {
		/* Horizontal inset only — vertical pad comes from .feed / feed-pad chrome. */
		padding-left: 0;
		padding-right: 0;
		min-height: 40vh;
	}

	.photo-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-bottom: 18px;
	}

	/* Flat section labels — no rounded boxed header chrome. */
	.photo-eyebrow {
		display: flex;
		align-items: center;
		margin: 0;
		padding: 4px 16px 0;
		box-sizing: border-box;
	}

	@media (max-width: 767px) {
		.photo-eyebrow {
			padding-left: 14px;
			padding-right: 14px;
		}
	}

	.eyebrow-label-xs {
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
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
	.empty-body.err,
	.status.err {
		color: var(--fg-66);
	}
	.status {
		margin: 0;
		padding: 10px 16px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg-33);
	}
</style>
