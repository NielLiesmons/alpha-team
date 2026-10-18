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

		// iOS: truncated blob is about to end — grow before we hit `ended`.
		if (
			playerUi.wantsPlay &&
			playerUi.bufferRatio < 0.999 &&
			audioEl.buffered.length > 0
		) {
			const end = audioEl.buffered.end(audioEl.buffered.length - 1);
			if (end - audioEl.currentTime < 1.25) {
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
		// Early progressive blob finished — extend with more chunks, don't skip track.
		if (handleProgressiveStall()) return;
		playEndedAdvance().catch(() => {});
	}

	function onWaiting() {
		if (playerUi.wantsPlay) handleProgressiveStall();
	}
</script>

<audio
	bind:this={audioEl}
	class="sr-audio"
	preload="auto"
	ontimeupdate={syncClock}
	onloadedmetadata={syncClock}
	ondurationchange={syncClock}
	onplay={syncClock}
	onpause={syncClock}
	onended={onEnded}
	onwaiting={onWaiting}
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
