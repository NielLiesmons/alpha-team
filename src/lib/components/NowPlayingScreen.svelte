<script>
	import {
		closeNowPlaying,
		currentTrack,
		playAdjacent,
		playerUi,
		togglePlayPause,
		tracks
	} from '$lib/player.svelte.js';
	import CreateSheet from './CreateSheet.svelte';
	import PlayerScrub from './PlayerScrub.svelte';

	const track = $derived(currentTrack());
	const coverLabel = $derived(
		(track?.album || track?.artists?.[0] || track?.title || '?').slice(0, 1).toUpperCase()
	);
	const hasLibrary = $derived(tracks.length > 0);
	const open = $derived(Boolean(playerUi.nowPlayingOpen && track));

	async function prev() {
		try {
			await playAdjacent(-1);
		} catch {
			/* playerUi.error */
		}
	}

	async function next() {
		try {
			await playAdjacent(1);
		} catch {
			/* playerUi.error */
		}
	}
</script>

<CreateSheet {open} label="Now playing" onclose={closeNowPlaying}>
	<div class="now-playing">
		<div class="handle" aria-hidden="true"></div>
		<div class="art" aria-hidden="true">
			{#if track?.cover_url}
				<img src={track.cover_url} alt="" />
			{:else}
				<span class="art-fallback">{coverLabel}</span>
			{/if}
		</div>

		<div class="meta">
			<p class="title">{track?.title ?? ''}</p>
			<p class="artist">{track?.artists?.join(', ') ?? ''}</p>
		</div>

		<div class="scrub-wrap">
			<PlayerScrub large />
		</div>

		<div class="controls">
			<button type="button" class="ctrl" aria-label="Previous" disabled={!hasLibrary} onclick={prev}>
				<svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path d="M14 4v10L6.5 9 14 4Z" fill="currentColor" />
					<path d="M4.5 4v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				</svg>
			</button>
			<button
				type="button"
				class="ctrl play"
				aria-label={playerUi.playing ? 'Pause' : 'Play'}
				disabled={playerUi.status !== 'ready' && !track}
				onclick={() => togglePlayPause()}
			>
				{#if playerUi.playing}
					<svg width="18" height="20" viewBox="0 0 15 16" fill="none" aria-hidden="true">
						<path
							d="M2.67857 0C3.38897 0 4.07028 0.280952 4.57261 0.781049C5.07494 1.28115 5.35714 1.95942 5.35714 2.66667V13.3333C5.35714 14.0406 5.07494 14.7189 4.57261 15.219C4.07028 15.719 3.38897 16 2.67857 16C1.96817 16 1.28686 15.719 0.784535 15.219C0.282206 14.7189 1.49706e-08 14.0406 0 13.3333V2.66667C0 1.95942 0.282206 1.28115 0.784535 0.781049C1.28686 0.280952 1.96817 0 2.67857 0ZM12.1786 0C12.889 0 13.5703 0.280952 14.0726 0.781049C14.5749 1.28115 14.8571 1.95942 14.8571 2.66667V13.3333C14.8571 14.0406 14.5749 14.7189 14.0726 15.219C13.5703 15.719 12.889 16 12.1786 16C11.4682 16 10.7869 15.719 10.2845 15.219C9.7822 14.7189 9.5 14.0406 9.5 13.3333V2.66667C9.5 1.95942 9.7822 1.28115 10.2845 0.781049C10.7869 0.280952 11.4682 0 12.1786 0Z"
							fill="currentColor"
						/>
					</svg>
				{:else}
					<svg width="18" height="20" viewBox="0 0 15 16" fill="none" aria-hidden="true">
						<path
							d="M13.439 5.88263C13.8097 6.08696 14.1199 6.39198 14.3361 6.76502C14.5524 7.13805 14.6667 7.56504 14.6667 8.00022C14.6667 8.43541 14.5524 8.8624 14.3361 9.23543C14.1199 9.60847 13.8097 9.91349 13.439 10.1178L3.54868 15.6914C1.95613 16.589 0 15.421 0 13.5746V2.42664C0 0.578645 1.95613 -0.588552 3.54868 0.308245L13.439 5.88263Z"
							fill="currentColor"
						/>
					</svg>
				{/if}
			</button>
			<button type="button" class="ctrl" aria-label="Next" disabled={!hasLibrary} onclick={next}>
				<svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path d="M4 4v10l7.5-5L4 4Z" fill="currentColor" />
					<path d="M13.5 4v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				</svg>
			</button>
		</div>
	</div>
</CreateSheet>

<style>
	.now-playing {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 14px;
		padding: 8px 16px 4px;
		box-sizing: border-box;
	}

	.handle {
		width: 36px;
		height: 4px;
		margin: 0 auto 4px;
		border-radius: 999px;
		background: var(--fg-16);
	}

	.art {
		width: min(100%, 280px);
		aspect-ratio: 1;
		margin: 0 auto;
		border-radius: 16px;
		overflow: hidden;
		background: var(--fg-8);
		display: grid;
		place-items: center;
		box-shadow: 0 12px 36px var(--shadow-strong);
	}

	.art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.art-fallback {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 56px;
		font-weight: 650;
		color: var(--fg-16);
		line-height: 1;
	}

	.meta {
		min-width: 0;
		text-align: center;
		padding: 0 4px;
	}

	.title {
		margin: 0 0 4px;
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.artist {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.scrub-wrap {
		padding: 0 2px;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 4px 0 8px;
	}

	.ctrl {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-66);
		padding: 0;
		cursor: pointer;
	}

	.ctrl.play {
		width: 60px;
		height: 60px;
		background: var(--fg);
		color: var(--bg);
	}

	.ctrl:hover:not(:disabled) {
		color: var(--fg);
	}

	.ctrl.play:hover:not(:disabled) {
		color: var(--bg);
		filter: brightness(1.05);
	}

	.ctrl:disabled {
		opacity: 0.35;
		cursor: default;
	}
</style>
