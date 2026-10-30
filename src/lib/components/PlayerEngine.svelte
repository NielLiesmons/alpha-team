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
		/*
		 * Do NOT assign audio.src here. Progressive blob grows + MSE attach own the src;
		 * re-assigning the same/new blob URL mid-play was causing the ~1s restart glitch.
		 */
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
		/* While switching tracks, keep scrubber at 0 — ignore stale timeupdates from the old src. */
		if (playerUi.status === 'loading' || playerUi.status === 'idle') {
			playerUi.playing = false;
			if (playerUi.status === 'loading') {
				playerUi.currentTime = 0;
				playerUi.duration = taggedDurationSec() || playerUi.duration;
			}
			return;
		}
		playerUi.currentTime = audioEl.currentTime;
		playerUi.playing = !audioEl.paused;
		playerUi.duration = reliableDuration(audioEl, playerUi.bufferRatio, taggedDurationSec());

		/* Grow only when critically near the end of the current truncated blob (~3s). */
		if (
			playerUi.wantsPlay &&
			playerUi.bufferRatio < 0.999 &&
			audioEl.buffered.length > 0
		) {
			const end = audioEl.buffered.end(audioEl.buffered.length - 1);
			if (end - audioEl.currentTime < 3) {
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
