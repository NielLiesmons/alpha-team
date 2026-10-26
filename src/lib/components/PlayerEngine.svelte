<script>
	import {
		bindPlayerAudio,
		currentTrack,
		handleProgressiveStall,
		playEndedAdvance,
		playerUi,
		reliableDuration
	} from '$lib/player.svelte.js';

	/** @type {HTMLAudioElement | undefined} */
	let audioEl = $state();

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
				playerUi.currentTime = 0;
				playerUi.duration = 0;
				playerUi.playing = false;
			}
			return;
		}
		const current = audioEl.getAttribute('src') || '';
		if (current !== url && audioEl.src !== url) {
			audioEl.src = url;
		}
		if (playerUi.status === 'ready' && playerUi.wantsPlay && audioEl.paused) {
			audioEl.play().catch(() => {});
		}
	});

	function taggedDurationSec() {
		const ms = currentTrack()?.duration_ms;
		return typeof ms === 'number' && ms > 0 ? ms / 1000 : 0;
	}

	function syncClock() {
		if (!audioEl) return;
		playerUi.currentTime = audioEl.currentTime;
		playerUi.playing = !audioEl.paused;
		playerUi.duration = reliableDuration(audioEl, playerUi.bufferRatio, taggedDurationSec());

		// Grow truncated progressive blobs well before they end (phones need swap headroom).
		if (
			playerUi.wantsPlay &&
			playerUi.bufferRatio < 0.999 &&
			audioEl.buffered.length > 0
		) {
			const end = audioEl.buffered.end(audioEl.buffered.length - 1);
			if (end - audioEl.currentTime < 20) {
				handleProgressiveStall();
			}
		}
	}

	$effect(() => {
		playerUi.bufferRatio;
		playerUi.currentId;
		if (audioEl) {
			playerUi.duration = reliableDuration(audioEl, playerUi.bufferRatio, taggedDurationSec());
		}
	});

	function onEnded() {
		syncClock();
		// Early progressive blob / incomplete MSE — grow or wait; don't skip mid-song.
		if (handleProgressiveStall()) return;
		playEndedAdvance().catch(() => {});
	}

	function onWaiting() {
		if (playerUi.wantsPlay) handleProgressiveStall();
	}

	function onError() {
		// Decode glitch after a blob swap — try grow/resume once; otherwise advance.
		if (playerUi.wantsPlay && handleProgressiveStall()) return;
		if (playerUi.bufferRatio >= 0.999) {
			playEndedAdvance().catch(() => {});
		}
	}
</script>

<audio
	bind:this={audioEl}
	class="sr-audio"
	preload="auto"
	playsinline
	ontimeupdate={syncClock}
	onloadedmetadata={syncClock}
	ondurationchange={syncClock}
	onplay={syncClock}
	onpause={syncClock}
	onended={onEnded}
	onwaiting={onWaiting}
	onerror={onError}
	oncanplay={syncClock}
></audio>

<style>
	.sr-audio {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
