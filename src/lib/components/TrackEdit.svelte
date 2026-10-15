<script>
	import { tick } from 'svelte';
	import {
		closeTrackEdit,
		editingTrack,
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

	const track = $derived(editingTrack());
	const open = $derived(Boolean(playerUi.editingId && track));

	$effect(() => {
		if (!open || !track) return;
		title = track.title ?? '';
		artists = Array.isArray(track.artists) ? track.artists.join(', ') : '';
		album = track.album ?? '';
		albumArtist = track.album_artist ?? '';
		year = track.year != null && track.year !== '' ? String(track.year) : '';
		genres = Array.isArray(track.genres) ? track.genres.join(', ') : '';
		saving = false;
		tick().then(() => titleInput?.focus());
	});

	/** @param {string} raw */
	function splitList(raw) {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	async function save() {
		const nextTitle = title.trim();
		const nextArtists = splitList(artists);
		if (!nextTitle || !nextArtists.length || saving) return;
		saving = true;
		try {
			const yearRaw = year.trim();
			await saveTrackEdit({
				title: nextTitle,
				artists: nextArtists,
				album: album.trim(),
				album_artist: albumArtist.trim(),
				year: yearRaw ? Number(yearRaw) : null,
				genres: splitList(genres)
			});
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			saving = false;
		}
	}
</script>

<CreateSheet {open} label="Edit track" onclose={closeTrackEdit}>
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
	<label class="field">
		<span class="field-label">Artist</span>
		<input
			class="field-input"
			placeholder="Artist name"
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
			disabled={!title.trim() || !artists.trim() || saving}
			onclick={save}
		>
			{saving ? 'Saving…' : 'Save'}
		</button>
	</div>
</CreateSheet>

<style>
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
