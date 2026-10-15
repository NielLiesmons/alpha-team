<script>
	import {
		currentTrack,
		openNowPlaying,
		playerUi,
		togglePlayPause
	} from '$lib/player.svelte.js';

	const track = $derived(currentTrack());
	const coverLabel = $derived(
		(track?.album || track?.artists?.[0] || track?.title || '?').slice(0, 1).toUpperCase()
	);
	const show = $derived(Boolean(track) && !playerUi.nowPlayingOpen);
</script>

{#if show}
	<div class="mobile-player-slot">
		<div class="mobile-player-pill">
			<button type="button" class="open" aria-label="Open now playing" onclick={openNowPlaying}>
				<div class="cover" aria-hidden="true">
					{#if track?.cover_url}
						<img src={track.cover_url} alt="" />
					{:else}
						<span class="cover-fallback">{coverLabel}</span>
					{/if}
				</div>
				<div class="meta">
					<p class="title">{track?.title ?? ''}</p>
					<p class="artist">{track?.artists?.join(', ') ?? ''}</p>
				</div>
			</button>
			<button
				type="button"
				class="play"
				aria-label={playerUi.playing ? 'Pause' : 'Play'}
				disabled={playerUi.status !== 'ready' && !track}
				onclick={() => togglePlayPause()}
			>
				{#if playerUi.playing}
					<svg width="14" height="15" viewBox="0 0 15 16" fill="none" aria-hidden="true">
						<path
							d="M2.67857 0C3.38897 0 4.07028 0.280952 4.57261 0.781049C5.07494 1.28115 5.35714 1.95942 5.35714 2.66667V13.3333C5.35714 14.0406 5.07494 14.7189 4.57261 15.219C4.07028 15.719 3.38897 16 2.67857 16C1.96817 16 1.28686 15.719 0.784535 15.219C0.282206 14.7189 1.49706e-08 14.0406 0 13.3333V2.66667C0 1.95942 0.282206 1.28115 0.784535 0.781049C1.28686 0.280952 1.96817 0 2.67857 0ZM12.1786 0C12.889 0 13.5703 0.280952 14.0726 0.781049C14.5749 1.28115 14.8571 1.95942 14.8571 2.66667V13.3333C14.8571 14.0406 14.5749 14.7189 14.0726 15.219C13.5703 15.719 12.889 16 12.1786 16C11.4682 16 10.7869 15.719 10.2845 15.219C9.7822 14.7189 9.5 14.0406 9.5 13.3333V2.66667C9.5 1.95942 9.7822 1.28115 10.2845 0.781049C10.7869 0.280952 11.4682 0 12.1786 0Z"
							fill="currentColor"
						/>
					</svg>
				{:else}
					<svg width="14" height="15" viewBox="0 0 15 16" fill="none" aria-hidden="true">
						<path
							d="M13.439 5.88263C13.8097 6.08696 14.1199 6.39198 14.3361 6.76502C14.5524 7.13805 14.6667 7.56504 14.6667 8.00022C14.6667 8.43541 14.5524 8.8624 14.3361 9.23543C14.1199 9.60847 13.8097 9.91349 13.439 10.1178L3.54868 15.6914C1.95613 16.589 0 15.421 0 13.5746V2.42664C0 0.578645 1.95613 -0.588552 3.54868 0.308245L13.439 5.88263Z"
							fill="currentColor"
						/>
					</svg>
				{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.mobile-player-slot {
		display: none;
	}

	@media (max-width: 767px) {
		.mobile-player-slot {
			display: block;
			position: fixed;
			z-index: 41;
			left: 0;
			right: 0;
			bottom: calc(62px + env(safe-area-inset-bottom, 0px));
			padding: 0 12px 8px;
			pointer-events: none;
		}

		.mobile-player-pill {
			pointer-events: auto;
			width: 100%;
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 6px 8px 6px 6px;
			border: 1px solid var(--hairline);
			border-radius: 999px;
			background: var(--modal-bg);
			box-shadow: 0 8px 28px var(--shadow-strong);
			box-sizing: border-box;
		}

		.open {
			flex: 1;
			min-width: 0;
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 2px 4px 2px 2px;
			border: 0;
			background: transparent;
			color: var(--fg);
			cursor: pointer;
			text-align: left;
			font: inherit;
		}

		.cover {
			width: 36px;
			height: 36px;
			flex-shrink: 0;
			border-radius: 999px;
			overflow: hidden;
			background: var(--fg-11);
			display: grid;
			place-items: center;
		}

		.cover img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}

		.cover-fallback {
			font-family: 'Inter', var(--font), system-ui, sans-serif;
			font-size: 13px;
			font-weight: 650;
			color: var(--fg-33);
			line-height: 1;
		}

		.meta {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			gap: 1px;
		}

		.title {
			margin: 0;
			font-size: 13px;
			font-weight: 650;
			color: var(--fg);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			line-height: 1.25;
		}

		.artist {
			margin: 0;
			font-size: 11px;
			font-weight: 500;
			color: var(--fg-33);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			line-height: 1.25;
		}

		.play {
			width: 36px;
			height: 36px;
			flex-shrink: 0;
			display: grid;
			place-items: center;
			border: 0;
			border-radius: 999px;
			background: var(--fg-8);
			color: var(--fg);
			padding: 0;
			cursor: pointer;
		}

		.play:disabled {
			opacity: 0.35;
			cursor: default;
		}
	}
</style>
