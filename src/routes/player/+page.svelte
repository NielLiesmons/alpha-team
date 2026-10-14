<script>
	import { onDestroy } from 'svelte';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import {
		playTrack,
		playerUi,
		refreshTracks,
		stopPlayback,
		tracks,
		tracksByArtist,
		uploadAudioFiles
	} from '$lib/player.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';

	/** @type {HTMLAudioElement | undefined} */
	let audioEl = $state();
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	const library = $derived(tracksByArtist());
	const current = $derived(tracks.find((t) => t.id === playerUi.currentId) ?? null);
	const connected = $derived(Boolean(activeSession()) && ui.source === 'drive');

	$effect(() => {
		if (ui.source === 'drive' || driveSession.connected) {
			refreshTracks();
		}
	});

	$effect(() => {
		const url = playerUi.objectUrl;
		if (!audioEl || !url || playerUi.status !== 'ready') return;
		audioEl.src = url;
		audioEl.play().catch(() => {
			/* autoplay may be blocked — user can press play */
		});
	});

	onDestroy(() => {
		stopPlayback();
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

<svelte:head><title>Player</title></svelte:head>

<div class="player-page">
	<header class="toolbar">
		<div class="toolbar-copy">
			<p class="eyebrow">Library</p>
			<p class="hint">Music now — video & podcasts use the same Player later.</p>
		</div>
		<div class="toolbar-actions">
			{#if !connected}
				<a class="ghost-link" href="/settings">Connect Drive</a>
			{:else}
				<button
					type="button"
					class="upload-btn"
					disabled={playerUi.uploading}
					onclick={() => fileInput?.click()}
				>
					{playerUi.uploading ? 'Uploading…' : 'Upload audio'}
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
	{#if !connected}
		<p class="empty">Connect Drive in Settings to upload and stream your library.</p>
	{:else if driveSession.loading && tracks.length === 0}
		<p class="empty">Loading library…</p>
	{:else if tracks.length === 0}
		<p class="empty">No tracks yet. Upload audio to encrypt it into Drive as chunked media.</p>
	{:else}
		<div class="library">
			{#each library as group (group.artist)}
				<section class="artist-block">
					<h2 class="artist">{group.artist}</h2>
					{#each group.albums as album (album.album)}
						<div class="album-block">
							<h3 class="album">{album.album}</h3>
							<ul class="track-list">
								{#each album.tracks as track (track.id)}
									<li>
										<button
											type="button"
											class="track-row"
											class:on={playerUi.currentId === track.id}
											onclick={() => onPlay(track)}
										>
											<span class="track-title">{track.title}</span>
											<span class="track-meta">{track.artists?.join(', ')}</span>
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</section>
			{/each}
		</div>
	{/if}

	{#if current || playerUi.status === 'loading'}
		<footer class="now-playing">
			<div class="np-text">
				{#if playerUi.status === 'loading'}
					<p class="np-title">{playerUi.progress || 'Buffering…'}</p>
					<p class="np-sub">{current?.title ?? 'Preparing stream'}</p>
				{:else if current}
					<p class="np-title">{current.title}</p>
					<p class="np-sub">{current.artists?.join(', ')}</p>
				{/if}
			</div>
			<audio bind:this={audioEl} class="audio" controls preload="auto"></audio>
		</footer>
	{/if}
</div>

<style>
	.player-page {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	.toolbar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px 12px;
		border-bottom: 1px solid var(--hairline);
		flex-shrink: 0;
	}

	.eyebrow {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.hint {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--white66);
	}

	.toolbar-actions {
		flex-shrink: 0;
	}

	.upload-btn {
		height: 32px;
		padding: 0 14px;
		border: 0;
		border-radius: 10px;
		background: var(--white8);
		color: var(--white);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.upload-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.ghost-link {
		font-size: 13px;
		font-weight: 600;
		color: var(--white66);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.banner {
		margin: 0;
		padding: 8px 16px;
		font-size: 13px;
		color: var(--white66);
		border-bottom: 1px solid var(--hairline);
	}

	.banner.err {
		color: var(--white);
	}

	.empty {
		padding: 48px 16px;
		color: var(--white66);
		font-size: 14px;
	}

	.library {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 8px 0 100px;
	}

	.artist-block {
		padding: 10px 0 4px;
	}

	.artist {
		margin: 0;
		padding: 8px 16px 4px;
		font-size: 15px;
		font-weight: 700;
		color: var(--white);
	}

	.album {
		margin: 0;
		padding: 6px 16px 2px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.track-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.track-row {
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

	.track-row:hover {
		background: var(--white4);
	}

	.track-row.on {
		background: var(--white8);
	}

	.track-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--white);
	}

	.track-meta {
		font-size: 12px;
		color: var(--white33);
	}

	.now-playing {
		position: sticky;
		bottom: 0;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--hairline);
		background: var(--popover);
	}

	.np-title {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: var(--white);
	}

	.np-sub {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--white66);
	}

	.audio {
		width: 100%;
		height: 36px;
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
