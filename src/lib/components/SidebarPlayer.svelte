<script>
	import {
		bindPlayerAudio,
		currentTrack,
		playAdjacent,
		playerUi,
		togglePlayPause,
		tracks
	} from '$lib/player.svelte.js';

	/** @type {HTMLAudioElement | undefined} */
	let audioEl = $state();

	let currentTime = $state(0);
	let duration = $state(0);
	let bufferRatio = $state(0);
	let playing = $state(false);

	const track = $derived(currentTrack());
	const coverLabel = $derived(
		(track?.album || track?.artists?.[0] || track?.title || '?').slice(0, 1).toUpperCase()
	);
	const hasLibrary = $derived(tracks.length > 0);
	const showPanel = $derived(Boolean(track));

	$effect(() => {
		bindPlayerAudio(audioEl ?? null);
		return () => bindPlayerAudio(null);
	});

	$effect(() => {
		const url = playerUi.objectUrl;
		if (!audioEl) return;
		if (!url) {
			if (playerUi.status === 'idle') {
				audioEl.pause();
				if (audioEl.src) {
					audioEl.removeAttribute('src');
					audioEl.load();
				}
				currentTime = 0;
				duration = 0;
				playing = false;
			}
			return;
		}
		// Do not call load() here — it resets MediaSource progressive streams.
		if (audioEl.src !== url) {
			audioEl.src = url;
		}
		if (playerUi.status === 'ready') {
			audioEl.play().catch(() => {});
		}
	});

	$effect(() => {
		playerUi.currentId;
		bufferRatio = playerUi.bufferRatio;
	});

	function syncBuffer() {
		if (!audioEl) {
			bufferRatio = playerUi.bufferRatio;
			return;
		}
		const d = audioEl.duration;
		if (Number.isFinite(d) && d > 0 && audioEl.buffered.length > 0) {
			bufferRatio = Math.max(
				playerUi.bufferRatio,
				Math.min(1, audioEl.buffered.end(audioEl.buffered.length - 1) / d)
			);
		} else {
			bufferRatio = playerUi.bufferRatio;
		}
	}

	function onTime() {
		if (!audioEl) return;
		currentTime = audioEl.currentTime;
		duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
		playing = !audioEl.paused;
		syncBuffer();
	}

	/** @param {MouseEvent} e */
	function seek(e) {
		if (!audioEl || !duration) return;
		const rect = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		audioEl.currentTime = ratio * duration;
	}

	/** @param {number} s */
	function fmt(s) {
		if (!Number.isFinite(s) || s < 0) return '0:00';
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${sec.toString().padStart(2, '0')}`;
	}

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

	const playedPct = $derived(duration > 0 ? Math.round((currentTime / duration) * 100) : 0);
	const bufferPct = $derived(Math.round(Math.min(1, bufferRatio) * 100));
</script>

<div class="sidebar-player-slot">
	{#if showPanel}
		<div class="sidebar-player">
			<div class="meta-row">
				<div class="cover" aria-hidden="true">
					{#if track?.cover_url}
						<img src={track.cover_url} alt="" />
					{:else}
						<span class="cover-fallback">{coverLabel}</span>
					{/if}
				</div>
				<div class="meta-text">
					<p class="track-title">{track?.title ?? ''}</p>
					<p class="track-artist">{track?.artists?.join(', ') ?? ''}</p>
				</div>
			</div>

			<div class="controls">
				<button type="button" class="ctrl" aria-label="Previous" disabled={!hasLibrary} onclick={prev}>
					<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<path d="M14 4v10L6.5 9 14 4Z" fill="currentColor" />
						<path d="M4.5 4v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
					</svg>
				</button>
				<button
					type="button"
					class="ctrl play"
					aria-label={playing ? 'Pause' : 'Play'}
					disabled={playerUi.status !== 'ready' && !track}
					onclick={() => togglePlayPause()}
				>
					{#if playing}
						<!-- Bley filled pause -->
						<svg width="15" height="16" viewBox="0 0 15 16" fill="none" aria-hidden="true">
							<path
								d="M2.67857 0C3.38897 0 4.07028 0.280952 4.57261 0.781049C5.07494 1.28115 5.35714 1.95942 5.35714 2.66667V13.3333C5.35714 14.0406 5.07494 14.7189 4.57261 15.219C4.07028 15.719 3.38897 16 2.67857 16C1.96817 16 1.28686 15.719 0.784535 15.219C0.282206 14.7189 1.49706e-08 14.0406 0 13.3333V2.66667C0 1.95942 0.282206 1.28115 0.784535 0.781049C1.28686 0.280952 1.96817 0 2.67857 0ZM12.1786 0C12.889 0 13.5703 0.280952 14.0726 0.781049C14.5749 1.28115 14.8571 1.95942 14.8571 2.66667V13.3333C14.8571 14.0406 14.5749 14.7189 14.0726 15.219C13.5703 15.719 12.889 16 12.1786 16C11.4682 16 10.7869 15.719 10.2845 15.219C9.7822 14.7189 9.5 14.0406 9.5 13.3333V2.66667C9.5 1.95942 9.7822 1.28115 10.2845 0.781049C10.7869 0.280952 11.4682 0 12.1786 0Z"
								fill="currentColor"
							/>
						</svg>
					{:else}
						<!-- Bley filled play -->
						<svg width="15" height="16" viewBox="0 0 15 16" fill="none" aria-hidden="true">
							<path
								d="M13.439 5.88263C13.8097 6.08696 14.1199 6.39198 14.3361 6.76502C14.5524 7.13805 14.6667 7.56504 14.6667 8.00022C14.6667 8.43541 14.5524 8.8624 14.3361 9.23543C14.1199 9.60847 13.8097 9.91349 13.439 10.1178L3.54868 15.6914C1.95613 16.589 0 15.421 0 13.5746V2.42664C0 0.578645 1.95613 -0.588552 3.54868 0.308245L13.439 5.88263Z"
								fill="currentColor"
							/>
						</svg>
					{/if}
				</button>
				<button type="button" class="ctrl" aria-label="Next" disabled={!hasLibrary} onclick={next}>
					<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<path d="M4 4v10l7.5-5L4 4Z" fill="currentColor" />
						<path d="M13.5 4v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
					</svg>
				</button>
			</div>

			<div class="scrub-block">
				<button
					type="button"
					class="scrub"
					aria-label="Seek"
					disabled={!duration}
					onclick={seek}
				>
					<span class="scrub-track">
						<span class="scrub-buffer" style={`width: ${bufferPct}%`}></span>
						<span class="scrub-played" style={`width: ${playedPct}%`}></span>
					</span>
				</button>
				<div class="times">
					<span>{fmt(currentTime)}</span>
					<span>{fmt(duration)}</span>
				</div>
			</div>
		</div>
	{/if}

	<audio
		bind:this={audioEl}
		class="sr-audio"
		preload="auto"
		ontimeupdate={onTime}
		onprogress={syncBuffer}
		onloadedmetadata={onTime}
		onplay={onTime}
		onpause={onTime}
		onended={onTime}
	></audio>
</div>

<style>
	.sidebar-player-slot {
		flex-shrink: 0;
		margin-top: auto;
		min-width: 0;
	}

	.sidebar-player {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px;
		min-width: 0;
		border-radius: 14px;
		background: var(--fg-8);
		box-sizing: border-box;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.cover {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: 8px;
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
		font-size: 14px;
		font-weight: 650;
		color: var(--fg-33);
		line-height: 1;
	}

	.meta-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.track-title {
		margin: 0;
		font-size: 13px;
		font-weight: 650;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.25;
	}

	.track-artist {
		margin: 0;
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.25;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
	}

	.ctrl {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		padding: 0;
		cursor: pointer;
	}

	.ctrl.play {
		width: 34px;
		height: 34px;
		color: var(--fg);
	}

	.ctrl:hover:not(:disabled) {
		color: var(--fg);
	}

	.ctrl:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.scrub-block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.scrub {
		width: 100%;
		height: 16px;
		display: flex;
		align-items: center;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
	}

	.scrub:disabled {
		cursor: default;
	}

	.scrub-track {
		position: relative;
		display: block;
		width: 100%;
		height: 3px;
		border-radius: 2px;
		background: var(--fg-16);
		overflow: hidden;
	}

	.scrub-buffer,
	.scrub-played {
		position: absolute;
		inset: 0 auto 0 0;
		height: 100%;
		pointer-events: none;
	}

	.scrub-buffer {
		background: color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.scrub-played {
		background: var(--accent);
	}

	.times {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		color: var(--fg-33);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		line-height: 1.2;
	}

	.sr-audio {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
