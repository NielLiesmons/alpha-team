<script>
	/**
	 * Telegram/WhatsApp-style voice row — play + waveform + speed/time.
	 * Play/pause via the play control. Waveform scrub only while actually playing;
	 * when idle/paused, tap/long-press (except play) opens message actions.
	 * Controls use data-voice-control so ChatFeedCard can still long-press → actions.
	 */
	import Play from '@alpha/ui/icons/Play.svelte';
	import Pause from '@alpha/ui/icons/Pause.svelte';
	import {
		chatVoicePlayer,
		cycleVoiceSpeed,
		isVoiceClipActive,
		playVoiceClip,
		seekVoiceClip
	} from '$lib/chat-voice-player.svelte.js';
	import {
		formatAudioDurationMs,
		formatVoiceSpeed,
		generateWaveformBars
	} from '$lib/voice-waveform.js';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   msgId: string,
	 *   src: string,
	 *   isMine?: boolean,
	 *   durationMs?: number,
	 *   author?: string,
	 *   speakerName?: string,
	 *   name?: string,
	 *   onRequestActions?: (clientX: number, clientY: number) => void
	 * }}
	 */
	let {
		msgId,
		src,
		isMine = false,
		durationMs = 0,
		author = '',
		speakerName = '',
		name = '',
		onRequestActions
	} = $props();

	const bars = $derived(generateWaveformBars(msgId || name || 'voice', 40));
	const active = $derived(isVoiceClipActive(msgId));
	const playing = $derived(active && chatVoicePlayer.status === 'playing');
	const positionMs = $derived(active ? chatVoicePlayer.positionMs : 0);
	const dur = $derived(
		active && chatVoicePlayer.durationMs > 0 ? chatVoicePlayer.durationMs : durationMs
	);
	const progress = $derived(dur > 0 ? Math.min(1, positionMs / dur) : 0);
	const timeLabel = $derived.by(() => {
		if (!src) return '…';
		const cur = formatAudioDurationMs(active ? positionMs : 0);
		const tot = dur > 0 ? formatAudioDurationMs(dur) : '0:00';
		return `${cur} / ${tot}`;
	});
	const speedLabel = $derived(formatVoiceSpeed(active ? chatVoicePlayer.speed : 1));
	const playTitle = $derived(
		speakerName
			? t('chat.speakersVoiceMessage', { name: speakerName })
			: name || t('chat.voiceMessage')
	);

	/** Ignore click after a long-press (ChatFeedCard opens the actions overlay). */
	const LONG_PRESS_MS = 400;
	let ptrDownAt = 0;
	/** Waveform scrubbing */
	let waveDragging = false;
	/** @type {number | null} */
	let wavePointerId = null;

	/** @param {PointerEvent} e */
	function onCtrlPointerDown(e) {
		ptrDownAt = Date.now();
		/* Do not stopPropagation — bubble long-press arms on the card. */
	}

	function wasLongPress() {
		return Date.now() - ptrDownAt >= LONG_PRESS_MS;
	}

	function clipOpts() {
		return {
			msgId,
			url: src,
			title: playTitle,
			author,
			speakerName,
			durationMs: dur
		};
	}

	function onPlayPause() {
		if (!src) return;
		void playVoiceClip(clipOpts());
	}

	/** @param {MouseEvent} e */
	function onPlayClick(e) {
		if (wasLongPress()) {
			e.preventDefault();
			return;
		}
		e.stopPropagation();
		onPlayPause();
	}

	/**
	 * @param {HTMLElement} el
	 * @param {number} clientX
	 */
	function fractionFromX(el, clientX) {
		const rect = el.getBoundingClientRect();
		if (!rect.width) return 0;
		return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
	}

	/**
	 * Seek while this clip is actively playing (scrub only — never while idle/paused).
	 * @param {number} fraction
	 */
	function seekToFraction(fraction) {
		if (!src || !playing) return;
		const f = Math.max(0, Math.min(1, fraction));
		const total =
			(active && chatVoicePlayer.durationMs > 0 ? chatVoicePlayer.durationMs : 0) ||
			durationMs ||
			chatVoicePlayer.durationMs ||
			0;
		if (!total) return;
		seekVoiceClip(total * f);
	}

	/** @param {PointerEvent} e */
	function onWavePointerDown(e) {
		onCtrlPointerDown(e);
		if (!src || (e.button != null && e.button !== 0)) return;
		/* Scrub only while playing — idle/paused taps open message actions instead. */
		if (!playing) return;
		waveDragging = true;
		wavePointerId = e.pointerId;
		try {
			e.currentTarget?.setPointerCapture?.(e.pointerId);
		} catch {
			/* ignore */
		}
		const el = e.currentTarget;
		if (el instanceof HTMLElement) {
			seekToFraction(fractionFromX(el, e.clientX));
		}
	}

	/** @param {PointerEvent} e */
	function onWavePointerMove(e) {
		if (!waveDragging || wavePointerId !== e.pointerId) return;
		const el = e.currentTarget;
		if (el instanceof HTMLElement) {
			seekToFraction(fractionFromX(el, e.clientX));
		}
	}

	/** @param {PointerEvent} e */
	function onWavePointerUp(e) {
		if (wavePointerId != null && e.pointerId !== wavePointerId) return;
		waveDragging = false;
		wavePointerId = null;
		try {
			e.currentTarget?.releasePointerCapture?.(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	/** @param {MouseEvent} e */
	function onWaveClick(e) {
		e.preventDefault();
		e.stopPropagation();
		if (wasLongPress()) return;
		/* Playing: seek already handled on pointerdown/drag. Idle: open actions. */
		if (playing) return;
		onRequestActions?.(e.clientX, e.clientY);
	}

	/** @param {MouseEvent} e */
	function onSpeedClick(e) {
		if (wasLongPress()) {
			e.preventDefault();
			return;
		}
		e.stopPropagation();
		/* Idle/paused: treat like the rest of the bubble — open actions. */
		if (!playing) {
			onRequestActions?.(e.clientX, e.clientY);
			return;
		}
		cycleVoiceSpeed();
	}
</script>

<div class="voice" class:mine={isMine}>
	<button
		type="button"
		class="play"
		data-voice-control
		aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
		disabled={!src}
		onpointerdown={onCtrlPointerDown}
		onclick={onPlayClick}
	>
		{#if playing}
			<Pause size={18} />
		{:else}
			<Play size={18} />
		{/if}
	</button>

	<div class="cols">
		<button
			type="button"
			class="wave"
			class:scrubbing={playing}
			data-voice-control
			aria-label={playing ? t('chat.seekVoice') : t('chat.voiceMessage')}
			disabled={!src}
			onpointerdown={onWavePointerDown}
			onpointermove={onWavePointerMove}
			onpointerup={onWavePointerUp}
			onpointercancel={onWavePointerUp}
			onclick={onWaveClick}
		>
			{#each bars as h, i (i)}
				{@const half = Math.max(1, Math.round((4 + h * 10) * (2 / 3)))}
				<span class="bar-col" class:on={i / bars.length <= progress}>
					<span class="bar top" style:height="{half}px"></span>
					<span class="bar bot" style:height="{half}px"></span>
				</span>
			{/each}
		</button>

		<div class="meta">
			<button
				type="button"
				class="speed"
				data-voice-control
				aria-label={t('chat.playbackSpeed')}
				disabled={!src}
				onpointerdown={onCtrlPointerDown}
				onclick={onSpeedClick}
			>
				{speedLabel}
			</button>
			<span class="time">{timeLabel}</span>
		</div>
	</div>
</div>

<style>
	.voice {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-width: 0;
		max-width: 400px;
		padding: 6px 8px;
		box-sizing: border-box;
	}
	.play {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 20%, transparent);
		color: #fff;
		cursor: pointer;
		position: relative;
		z-index: 1;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}
	.voice.mine .play {
		background: rgba(255, 255, 255, 0.22);
	}
	.play:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.cols {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 5px;
	}
	.wave {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5px;
		height: 19px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		min-width: 0;
		width: 100%;
		/* Default: allow bubble long-press / tap → actions. Scrub locks pan while playing. */
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		position: relative;
		z-index: 1;
	}
	.wave.scrubbing {
		touch-action: none;
	}
	.wave:disabled {
		cursor: default;
	}
	.bar-col {
		flex: 1 1 0;
		min-width: 2px;
		max-width: 3px;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: center;
		gap: 0;
		pointer-events: none;
	}
	.bar {
		display: block;
		width: 100%;
		min-height: 1px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 28%, transparent);
	}
	.bar.top {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}
	.bar.bot {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	.voice.mine .bar {
		background: rgba(255, 255, 255, 0.28);
	}
	/* Played = fuller ink only — never accent (whisper is for checks, not wave chrome). */
	.bar-col.on .bar {
		background: color-mix(in srgb, var(--fg) 66%, transparent);
	}
	.voice.mine .bar-col.on .bar {
		background: rgba(255, 255, 255, 0.66);
	}
	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
	}
	.time {
		flex: 0 0 auto;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-33);
		text-align: end;
		font-family: inherit;
		white-space: nowrap;
	}
	.voice.mine .time {
		color: color-mix(in srgb, #fff 66%, transparent);
	}
	.speed {
		flex: 0 0 auto;
		border: none;
		border-radius: 999px;
		padding: 3px 8px;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
		color: var(--fg-66);
		font-size: 0.6875rem;
		font-weight: 700;
		cursor: pointer;
		font-family: inherit;
		position: relative;
		z-index: 1;
		-webkit-tap-highlight-color: transparent;
	}
	.voice.mine .speed {
		background: rgba(255, 255, 255, 0.16);
		color: rgba(255, 255, 255, 0.85);
	}
</style>
