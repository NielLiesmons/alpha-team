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

	$effect(() => {
		bindPlayerAudio(audioEl ?? null);
		return () => bindPlayerAudio(null);
	});

	$effect(() => {
		const url = playerUi.objectUrl;
		if (!audioEl || !url) return;
		if (audioEl.src !== url) {
			audioEl.src = url;
			audioEl.load();
		}
		if (playerUi.status === 'ready') {
			audioEl.play().catch(() => {});
		}
	});

	$effect(() => {
		if (!audioEl) return;
		if (playerUi.status === 'loading' && !playerUi.objectUrl) {
			audioEl.pause();
			audioEl.removeAttribute('src');
			audioEl.load();
			currentTime = 0;
			duration = 0;
			playing = false;
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
	const hasLibrary = $derived(tracks.length > 0);
</script>

<div class="sidebar-player">
	<div class="cover" aria-hidden="true">
		{#if track?.cover_url}
			<img src={track.cover_url} alt="" />
		{:else}
			<span class="cover-fallback">{coverLabel}</span>
		{/if}
	</div>

	<p class="track-title">{track?.title ?? (hasLibrary ? 'Nothing playing' : 'No music yet')}</p>
	<p class="track-artist">{track?.artists?.join(', ') ?? ''}</p>

	<div class="controls">
		<button type="button" class="ctrl" aria-label="Previous" disabled={!hasLibrary} onclick={prev}>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
				<path d="M14 4v10L6.5 9 14 4Z" stroke="currentColor" stroke-linejoin="round" />
				<path d="M4.5 4v10" stroke="currentColor" stroke-linecap="round" />
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
				<svg width="15" height="16" viewBox="0 0 15 16" fill="none" aria-hidden="true">
					<path
						d="M3.5 2v12M11.5 2v12"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
			{:else}
				<svg width="15" height="16" viewBox="0 0 15 16" fill="none" aria-hidden="true">
					<path
						d="M13.439 5.88263C13.8097 6.08696 14.1199 6.39198 14.3361 6.76502C14.5524 7.13805 14.6667 7.56504 14.6667 8.00022C14.6667 8.43541 14.5524 8.8624 14.3361 9.23543C14.1199 9.60847 13.8097 9.91349 13.439 10.1178L3.54868 15.6914C1.95613 16.589 0 15.421 0 13.5746V2.42664C0 0.578645 1.95613 -0.588552 3.54868 0.308245L13.439 5.88263Z"
						stroke="currentColor"
						stroke-linejoin="round"
					/>
				</svg>
			{/if}
		</button>
		<button type="button" class="ctrl" aria-label="Next" disabled={!hasLibrary} onclick={next}>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
				<path d="M4 4v10l7.5-5L4 4Z" stroke="currentColor" stroke-linejoin="round" />
				<path d="M13.5 4v10" stroke="currentColor" stroke-linecap="round" />
			</svg>
		</button>
	</div>

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
	.sidebar-player {
		flex-shrink: 0;
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0 0;
		min-width: 0;
	}

	.cover {
		width: 100%;
		max-height: 200px;
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
		background: var(--white8);
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
		font-family: var(--font-display);
		font-size: 48px;
		font-weight: 700;
		color: var(--white33);
		line-height: 1;
	}

	.track-title {
		margin: 4px 0 0;
		font-size: 13px;
		font-weight: 650;
		color: var(--white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track-artist {
		margin: 0;
		font-size: 12px;
		color: var(--white33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-height: 1.2em;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 2px 0;
	}

	.ctrl {
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--white66);
		padding: 0;
		cursor: pointer;
	}

	.ctrl.play {
		width: 42px;
		height: 42px;
		background: var(--white8);
		color: var(--white);
	}

	.ctrl:hover:not(:disabled) {
		color: var(--white);
		background: var(--white8);
	}

	.ctrl:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.scrub {
		width: 100%;
		height: 24px;
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
		background: var(--white16);
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
		background: var(--white33);
	}

	.scrub-played {
		background: var(--white);
	}

	.times {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--white33);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
	}

	.sr-audio {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
