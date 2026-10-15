<script>
	import {
		bindPlayerAudio,
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
		// Do not call load() — it resets MediaSource progressive streams.
		// Compare pathname-style: audioEl.src is absolute, object URLs may differ by resolution.
		const current = audioEl.getAttribute('src') || '';
		if (current !== url && audioEl.src !== url) {
			audioEl.src = url;
		}
		if (playerUi.status === 'ready' && audioEl.paused) {
			audioEl.play().catch(() => {});
		}
	});

	function syncClock() {
		if (!audioEl) return;
		playerUi.currentTime = audioEl.currentTime;
		playerUi.playing = !audioEl.paused;
		playerUi.duration = reliableDuration(audioEl, playerUi.bufferRatio);
	}

	// When byte buffer fills, re-evaluate duration (first-chunk trick duration → real).
	$effect(() => {
		playerUi.bufferRatio;
		if (audioEl) {
			playerUi.duration = reliableDuration(audioEl, playerUi.bufferRatio);
		}
	});

	function onEnded() {
		syncClock();
		playEndedAdvance().catch(() => {});
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
