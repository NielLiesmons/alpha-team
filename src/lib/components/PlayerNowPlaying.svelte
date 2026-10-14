<script>
	import { onDestroy } from 'svelte';
	import {
		bindPlayerAudio,
		playerUi,
		stopPlayback,
		tracks
	} from '$lib/player.svelte.js';

	/** @type {HTMLAudioElement | undefined} */
	let audioEl = $state();

	let currentTime = $state(0);
	let duration = $state(0);
	/** buffered end / duration from element, else download ratio */
	let bufferRatio = $state(0);
	let playing = $state(false);

	const current = $derived(tracks.find((t) => t.id === playerUi.currentId) ?? null);
	const show = $derived(Boolean(current) || playerUi.status === 'loading' || playerUi.status === 'ready');

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
		}
	});

	// Keep scrubber buffer lane live while chunks download (before metadata exists).
	$effect(() => {
		playerUi.currentId;
		bufferRatio = playerUi.bufferRatio;
	});

	onDestroy(() => {
		stopPlayback();
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

	function togglePlay() {
		if (!audioEl || playerUi.status !== 'ready') return;
		if (audioEl.paused) audioEl.play().catch(() => {});
		else audioEl.pause();
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

	const playedRatio = $derived(duration > 0 ? currentTime / duration : 0);
	const bufferPct = $derived(Math.round(Math.min(1, bufferRatio) * 100));
	const playedPct = $derived(Math.round(Math.min(1, playedRatio) * 100));
</script>

{#if show}
	<footer class="now-playing">
		<div class="np-text">
			<p class="np-title">{current?.title ?? '—'}</p>
			<p class="np-sub">{current?.artists?.join(', ') ?? ''}</p>
		</div>

		<div class="transport">
			<button
				type="button"
				class="play-btn"
				aria-label={playing ? 'Pause' : 'Play'}
				disabled={playerUi.status !== 'ready'}
				onclick={togglePlay}
			>
				{#if playing}
					<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
						<rect x="2" y="2" width="3.5" height="10" rx="0.5" />
						<rect x="8.5" y="2" width="3.5" height="10" rx="0.5" />
					</svg>
				{:else}
					<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
						<path d="M3.5 2.2v9.6L12 7 3.5 2.2Z" />
					</svg>
				{/if}
			</button>

			<span class="time">{fmt(currentTime)}</span>

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

			<span class="time">{fmt(duration)}</span>
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
	</footer>
{/if}

<style>
	.now-playing {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--hairline);
		background: var(--popover);
		min-width: 0;
	}

	.np-title {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: var(--white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.np-sub {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-height: 1.2em;
	}

	.transport {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		width: 100%;
	}

	.play-btn {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: var(--white8);
		color: var(--white);
		cursor: pointer;
		padding: 0;
	}

	.play-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.play-btn:not(:disabled):hover {
		background: var(--white11);
	}

	.time {
		flex-shrink: 0;
		width: 2.4rem;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--white33);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
	}

	.time:last-of-type {
		text-align: right;
	}

	.scrub {
		flex: 1 1 auto;
		min-width: 48px;
		height: 28px;
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
		height: 4px;
		border-radius: 2px;
		background: var(--white16, rgba(255, 255, 255, 0.16));
		overflow: hidden;
	}

	.scrub-buffer,
	.scrub-played {
		position: absolute;
		inset: 0 auto 0 0;
		height: 100%;
		border-radius: 2px;
		pointer-events: none;
	}

	.scrub-buffer {
		background: var(--white33);
	}

	.scrub-played {
		background: var(--white);
	}

	.sr-audio {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
