<script>
	import { tick } from 'svelte';
	import {
		closeTrackEdit,
		editingTracks,
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
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let artistsInput = $state();

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
		if (!bulk) {
			const track = list[0];
			title = track.title ?? '';
			artists = Array.isArray(track.artists) ? track.artists.join(', ') : '';
			album = track.album ?? '';
			albumArtist = track.album_artist ?? '';
			year = track.year != null && track.year !== '' ? String(track.year) : '';
			genres = Array.isArray(track.genres) ? track.genres.join(', ') : '';
		} else {
			title = '';
			const a = commonValue(
				list.map((t) => (Array.isArray(t.artists) ? t.artists.join(', ') : '')),
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
		}
		saving = false;
		tick().then(() => (bulk ? artistsInput : titleInput)?.focus());
	});

	/** @param {string} raw */
	function splitList(raw) {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	async function save() {
		if (saving) return;
		saving = true;
		try {
			if (!bulk) {
				const nextTitle = title.trim();
				const nextArtists = splitList(artists);
				if (!nextTitle || !nextArtists.length) return;
				const yearRaw = year.trim();
				await saveTrackEdit({
					title: nextTitle,
					artists: nextArtists,
					album: album.trim(),
					album_artist: albumArtist.trim(),
					year: yearRaw ? Number(yearRaw) : null,
					genres: splitList(genres)
				});
			} else {
				/** @type {{ artists?: string[], album?: string, album_artist?: string, year?: number | null, genres?: string[] }} */
				const patch = {};
				const nextArtists = splitList(artists);
				if (nextArtists.length) patch.artists = nextArtists;
				// Always apply album / album artist / year / genres from fields (empty clears)
				patch.album = album.trim();
				patch.album_artist = albumArtist.trim();
				const yearRaw = year.trim();
				patch.year = yearRaw ? Number(yearRaw) : null;
				patch.genres = splitList(genres);
				if (
					!patch.artists &&
					patch.album === '' &&
					patch.album_artist === '' &&
					patch.year === null &&
					!(patch.genres?.length)
				) {
					// Allow clearing album fields; still need at least one intentional field.
					// Empty form = no-op close.
					closeTrackEdit();
					return;
				}
				await saveTrackEdit(patch);
			}
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
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
		<p class="bulk-hint">Shared fields only — song titles stay as they are. Leave a field blank to keep mixed values unchanged for artists; album/year/genres apply to all.</p>
		<div class="form-divider"></div>
	{/if}
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
	<div class="sheet-bottom">
		<button
			type="button"
			class="publish-btn"
			disabled={saving || (!bulk && (!title.trim() || !artists.trim()))}
			onclick={save}
		>
			{saving ? 'Saving…' : bulk ? `Save ${list.length}` : 'Save'}
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
</style>
