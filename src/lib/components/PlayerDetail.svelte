<script>
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import {
		artistNames,
		playTrack,
		playerBrowse,
		playerUi,
		playlists,
		setPlayerBrowse,
		tracks,
		uploadAudioFiles,
		visibleTracks
	} from '$lib/player.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';
	import PlayerNowPlaying from './PlayerNowPlaying.svelte';

	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	const connected = $derived(Boolean(activeSession()) && ui.source === 'drive');
	const list = $derived(visibleTracks());
	const artists = $derived(artistNames());
	const activePlaylist = $derived(
		playerBrowse.mode === 'playlist'
			? playlists.find((p) => p.id === playerBrowse.playlistId) ?? null
			: null
	);

	const heading = $derived.by(() => {
		if (playerBrowse.mode === 'songs') return 'Songs';
		if (playerBrowse.mode === 'artists' && playerBrowse.artist) return playerBrowse.artist;
		if (playerBrowse.mode === 'artists') return 'Artists';
		if (activePlaylist) return activePlaylist.title;
		return 'Playlist';
	});

	async function onFiles(/** @type {Event} */ e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = input.files;
		if (!files?.length) return;
		try {
			await uploadAudioFiles(files);
		} catch (err) {
			playerUi.error = err instanceof Error ? err.message : String(err);
		}
		input.value = '';
	}

	/** @param {any} track */
	async function onPlay(track) {
		try {
			await playTrack(track);
		} catch {
			/* error on playerUi */
		}
	}
</script>

<div class="player-detail">
	<header class="head">
		<div class="head-main">
			{#if playerBrowse.mode === 'artists' && playerBrowse.artist}
				<button
					type="button"
					class="back"
					onclick={() => setPlayerBrowse('artists')}
				>
					Artists
				</button>
			{/if}
			<h2 class="title">{heading}</h2>
		</div>
		<div class="head-actions">
			{#if connected}
				<button
					type="button"
					class="ghost"
					disabled={playerUi.uploading}
					onclick={() => fileInput?.click()}
				>
					{playerUi.uploading ? 'Uploading…' : 'Upload'}
				</button>
				<input
					bind:this={fileInput}
					class="sr-only"
					type="file"
					accept="audio/*,.mp3,.m4a,.flac,.ogg,.wav"
					multiple
					onchange={onFiles}
				/>
			{/if}
		</div>
	</header>

	{#if playerUi.uploadLabel}
		<p class="banner">{playerUi.uploadLabel}</p>
	{/if}
	{#if playerUi.error}
		<p class="banner err">{playerUi.error}</p>
	{/if}

	<div class="body">
		{#if !connected}
			<p class="empty">Connect Drive in Settings to use the Player.</p>
		{:else if driveSession.loading && tracks.length === 0}
			<p class="empty">Loading library…</p>
		{:else if playerBrowse.mode === 'artists' && !playerBrowse.artist}
			{#if artists.length === 0}
				<p class="empty">No artists yet. Upload audio to build your library.</p>
			{:else}
				<ul class="list">
					{#each artists as name (name)}
						<li>
							<button
								type="button"
								class="row"
								onclick={() => setPlayerBrowse('artists', { artist: name })}
							>
								<span class="row-title">{name}</span>
								<span class="row-meta"
									>{tracks.filter((t) => (t.artists?.[0] || 'Unknown') === name).length} songs</span
								>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if list.length === 0}
			<p class="empty">
				{#if playerBrowse.mode === 'playlist'}
					This playlist is empty.
				{:else}
					No tracks yet. Upload audio to build your library.
				{/if}
			</p>
		{:else}
			<ul class="list">
				{#each list as track (track.id)}
					<li>
						<button
							type="button"
							class="row"
							class:on={playerUi.currentId === track.id}
							onclick={() => onPlay(track)}
						>
							<span class="row-title">{track.title}</span>
							<span class="row-meta"
								>{track.artists?.join(', ')}{track.album ? ` · ${track.album}` : ''}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<PlayerNowPlaying />
</div>

<style>
	.player-detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px 12px;
		border-bottom: 1px solid var(--hairline);
		flex-shrink: 0;
	}

	.head-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.back {
		align-self: flex-start;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: var(--white33);
		cursor: pointer;
	}

	.back:hover {
		color: var(--white66);
	}

	.title {
		margin: 0;
		font-family: var(--font);
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--white);
	}

	.head-actions {
		flex-shrink: 0;
	}

	.ghost {
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--white66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.ghost:hover:not(:disabled) {
		color: var(--white);
		background: var(--white4);
	}

	.ghost:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.banner {
		margin: 0;
		padding: 8px 16px;
		font-size: 13px;
		color: var(--white66);
		border-bottom: 1px solid var(--hairline);
		flex-shrink: 0;
	}

	.banner.err {
		color: var(--white);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.empty {
		padding: 48px 16px;
		color: var(--white66);
		font-size: 14px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		padding: 10px 16px;
		border: 0;
		border-bottom: 1px solid var(--white11);
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.row:hover {
		background: var(--white4);
	}

	.row.on {
		background: var(--white8);
	}

	.row-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--white);
	}

	.row-meta {
		font-size: 12px;
		color: var(--white33);
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
</style>
