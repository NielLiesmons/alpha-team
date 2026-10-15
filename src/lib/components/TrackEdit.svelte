<script>
	import { tick } from 'svelte';
	import {
		closeTrackEdit,
		editingTracks,
		ensureTrackCover,
		playerUi,
		saveTrackEdit
	} from '$lib/player.svelte.js';
	import CreateSheet from './CreateSheet.svelte';

	let title = $state('');
	let artists = $state('');
	let album = $state('');
	let albumArtist = $state('');
	let year = $state('');
	let genres = $state('');
	let saving = $state(false);
	let saveStatus = $state('');
	let saveError = $state('');
	/** Snapshot of bulk form when sheet opened — only send changed fields */
	let initialBulk = $state(
		/** @type {{ artists: string, album: string, albumArtist: string, year: string, genres: string }} */ ({
			artists: '',
			album: '',
			albumArtist: '',
			year: '',
			genres: ''
		})
	);
	/** @type {File | null} */
	let coverFile = $state(null);
	let clearCover = $state(false);
	/** Preview URL (local file or existing cover) */
	let coverPreview = $state(/** @type {string | null} */ (null));
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let artistsInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let coverInput = $state();

	const list = $derived(editingTracks());
	const bulk = $derived(list.length > 1);
	const open = $derived(playerUi.editingIds.length > 0 && list.length > 0);

	/**
	 * @template T
	 * @param {T[]} values
	 * @param {(a: T, b: T) => boolean} [eq]
	 */
	function commonValue(values, eq = (a, b) => a === b) {
		if (!values.length) return { mixed: false, value: /** @type {T | ''} */ ('') };
		const first = values[0];
		for (let i = 1; i < values.length; i++) {
			if (!eq(values[i], first)) return { mixed: true, value: /** @type {T | ''} */ ('') };
		}
		return { mixed: false, value: first };
	}

	$effect(() => {
		if (!open || !list.length) return;
		coverFile = null;
		clearCover = false;
		if (coverPreview?.startsWith('blob:') && !list.some((t) => t.cover_url === coverPreview)) {
			URL.revokeObjectURL(coverPreview);
		}
		coverPreview = null;

		if (!bulk) {
			const track = list[0];
			title = track.title ?? '';
			artists = Array.isArray(track.artists) ? track.artists.join(', ') : '';
			album = track.album ?? '';
			albumArtist = track.album_artist ?? '';
			year = track.year != null && track.year !== '' ? String(track.year) : '';
			genres = Array.isArray(track.genres) ? track.genres.join(', ') : '';
			coverPreview = track.cover_url ?? null;
			if (track.cover_path && !coverPreview) {
				ensureTrackCover(track).then((url) => {
					if (open && !coverFile && !clearCover) coverPreview = url;
				});
			}
		} else {
			title = '';
			const a = commonValue(
				list.map((t) => (Array.isArray(t.artists) ? t.artists.join(', ') : ''))
			);
			artists = a.mixed ? '' : a.value;
			const al = commonValue(list.map((t) => t.album ?? ''));
			album = al.mixed ? '' : al.value;
			const aa = commonValue(list.map((t) => t.album_artist ?? ''));
			albumArtist = aa.mixed ? '' : aa.value;
			const y = commonValue(
				list.map((t) => (t.year != null && t.year !== '' ? String(t.year) : ''))
			);
			year = y.mixed ? '' : y.value;
			const g = commonValue(
				list.map((t) => (Array.isArray(t.genres) ? t.genres.join(', ') : ''))
			);
			genres = g.mixed ? '' : g.value;
			initialBulk = {
				artists,
				album,
				albumArtist,
				year,
				genres
			};
			const covers = commonValue(list.map((t) => t.cover_path ?? ''));
			if (!covers.mixed && covers.value) {
				const sample = list.find((t) => t.cover_path === covers.value);
				coverPreview = sample?.cover_url ?? null;
				if (sample && !coverPreview) {
					ensureTrackCover(sample).then((url) => {
						if (open && !coverFile && !clearCover) coverPreview = url;
					});
				}
			}
		}
		saving = false;
		saveStatus = '';
		saveError = '';
		tick().then(() => (bulk ? artistsInput : titleInput)?.focus());
	});

	/** @param {string} raw */
	function splitList(raw) {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	/** @param {Event} e */
	function onCoverPick(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0] ?? null;
		input.value = '';
		if (!file) return;
		if (coverPreview?.startsWith('blob:') && coverFile) URL.revokeObjectURL(coverPreview);
		coverFile = file;
		clearCover = false;
		coverPreview = URL.createObjectURL(file);
	}

	function onClearCover() {
		if (coverPreview?.startsWith('blob:') && coverFile) URL.revokeObjectURL(coverPreview);
		coverFile = null;
		clearCover = true;
		coverPreview = null;
	}

	async function save() {
		if (saving) return;
		saving = true;
		saveError = '';
		saveStatus = coverFile ? 'Preparing artwork…' : 'Saving…';
		try {
			if (!bulk) {
				const nextTitle = title.trim();
				const nextArtists = splitList(artists);
				if (!nextTitle || !nextArtists.length) {
					saveError = 'Title and artist are required';
					return;
				}
				const yearRaw = year.trim();
				await saveTrackEdit({
					title: nextTitle,
					artists: nextArtists,
					album: album.trim(),
					album_artist: albumArtist.trim(),
					year: yearRaw ? Number(yearRaw) : null,
					genres: splitList(genres),
					coverFile: coverFile ?? undefined,
					clearCover: clearCover || undefined,
					onProgress: (label) => {
						saveStatus = label;
					}
				});
			} else {
				/** @type {{ artists?: string[], album?: string, album_artist?: string, year?: number | null, genres?: string[], coverFile?: File, clearCover?: boolean, onProgress?: (label: string) => void }} */
				const patch = {
					onProgress: (label) => {
						saveStatus = label;
					}
				};
				const nextArtists = splitList(artists);
				if (nextArtists.length && artists !== initialBulk.artists) patch.artists = nextArtists;
				if (album !== initialBulk.album) patch.album = album.trim();
				if (albumArtist !== initialBulk.albumArtist) patch.album_artist = albumArtist.trim();
				if (year !== initialBulk.year) {
					const yearRaw = year.trim();
					patch.year = yearRaw ? Number(yearRaw) : null;
				}
				if (genres !== initialBulk.genres) patch.genres = splitList(genres);
				if (coverFile) patch.coverFile = coverFile;
				if (clearCover) patch.clearCover = true;
				if (
					!patch.artists &&
					patch.album === undefined &&
					patch.album_artist === undefined &&
					patch.year === undefined &&
					patch.genres === undefined &&
					!patch.coverFile &&
					!patch.clearCover
				) {
					closeTrackEdit();
					return;
				}
				await saveTrackEdit(patch);
			}
			saveStatus = coverFile || clearCover ? 'Artwork saved' : 'Saved';
			// Let the status paint before closing the sheet
			await new Promise((r) => setTimeout(r, 700));
			playerUi.selectedIds = [];
			closeTrackEdit();
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
			saveStatus = '';
		} finally {
			saving = false;
		}
	}
</script>

<CreateSheet
	{open}
	label={bulk ? `Edit ${list.length} tracks` : 'Edit track'}
	onclose={closeTrackEdit}
>
	{#if !bulk}
		<div class="sheet-title-row">
			<input
				bind:this={titleInput}
				class="sheet-input"
				placeholder="Song title"
				bind:value={title}
				aria-label="Song title"
			/>
		</div>
		<div class="form-divider"></div>
	{:else}
		<p class="bulk-hint">Shared fields only — song titles stay as they are. Leave a field blank to keep mixed values unchanged for artists; album/year/genres/artwork apply to all.</p>
		<div class="form-divider"></div>
	{/if}

	<div class="art-row">
		<button
			type="button"
			class="art-btn"
			aria-label="Choose album artwork"
			onclick={() => coverInput?.click()}
		>
			{#if coverPreview}
				<img src={coverPreview} alt="" />
			{:else}
				<span class="art-placeholder">{clearCover ? 'No art' : 'Add art'}</span>
			{/if}
		</button>
		<div class="art-actions">
			<button type="button" class="art-link" onclick={() => coverInput?.click()}>
				{coverPreview ? 'Change artwork' : 'Upload artwork'}
			</button>
			{#if coverPreview || (!clearCover && list.some((t) => t.cover_path))}
				<button type="button" class="art-link muted" onclick={onClearCover}>Remove</button>
			{/if}
		</div>
		<input
			bind:this={coverInput}
			class="sr-only"
			type="file"
			accept="image/jpeg,image/png,image/webp,image/*"
			onchange={onCoverPick}
		/>
	</div>
	<div class="form-divider"></div>

	<label class="field">
		<span class="field-label">Artist</span>
		<input
			bind:this={artistsInput}
			class="field-input"
			placeholder={bulk ? 'Set artist for all…' : 'Artist name'}
			bind:value={artists}
			aria-label="Artist"
		/>
	</label>
	<div class="form-divider"></div>
	<label class="field">
		<span class="field-label">Album</span>
		<input class="field-input" placeholder="Album" bind:value={album} aria-label="Album" />
	</label>
	<div class="form-divider"></div>
	<label class="field">
		<span class="field-label">Album artist</span>
		<input
			class="field-input"
			placeholder="Album artist"
			bind:value={albumArtist}
			aria-label="Album artist"
		/>
	</label>
	<div class="form-divider"></div>
	<div class="field-row">
		<label class="field half">
			<span class="field-label">Year</span>
			<input
				class="field-input"
				placeholder="Year"
				inputmode="numeric"
				bind:value={year}
				aria-label="Year"
			/>
		</label>
		<label class="field half">
			<span class="field-label">Genres</span>
			<input
				class="field-input"
				placeholder="Genre, …"
				bind:value={genres}
				aria-label="Genres"
			/>
		</label>
	</div>
	<div class="form-divider"></div>
	{#if saveError}
		<p class="save-msg err">{saveError}</p>
	{:else if saveStatus}
		<p class="save-msg">{saveStatus}</p>
	{/if}
	<div class="sheet-bottom">
		<button
			type="button"
			class="publish-btn"
			disabled={saving || (!bulk && (!title.trim() || !artists.trim()))}
			onclick={save}
		>
			{saving ? saveStatus || 'Saving…' : bulk ? `Save ${list.length}` : 'Save'}
		</button>
	</div>
</CreateSheet>

<style>
	.bulk-hint {
		margin: 0;
		padding: 12px 16px;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.4;
		color: var(--fg-33);
	}

	.art-row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 16px;
	}

	.art-btn {
		flex-shrink: 0;
		width: 72px;
		height: 72px;
		padding: 0;
		border: 1px solid var(--hairline);
		border-radius: 12px;
		background: var(--fg-4);
		overflow: hidden;
		cursor: pointer;
	}

	.art-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.art-placeholder {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.art-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		min-width: 0;
	}

	.art-link {
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		color: var(--fg);
		cursor: pointer;
	}

	.art-link.muted {
		font-weight: 500;
		color: var(--fg-33);
	}

	.art-link:hover {
		color: var(--fg);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 16px;
		min-width: 0;
	}

	.field-row {
		display: flex;
		gap: 0;
		min-width: 0;
	}

	.field.half {
		flex: 1;
		min-width: 0;
	}

	.field-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.field-input {
		width: 100%;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 15px;
		font-weight: 500;
		box-sizing: border-box;
	}

	.field-input::placeholder {
		color: var(--fg-33);
		font-weight: 500;
	}

	.save-msg {
		margin: 0;
		padding: 0 16px 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.save-msg.err {
		color: #e85d5d;
	}
</style>
