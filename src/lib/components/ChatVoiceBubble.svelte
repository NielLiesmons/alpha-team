<script>
	/**
	 * Telegram/WhatsApp-style voice row — play + waveform + time + speed.
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
	 *   name?: string
	 * }}
	 */
	let {
		msgId,
		src,
		isMine = false,
		durationMs = 0,
		author = '',
		name = ''
	} = $props();

	const bars = $derived(generateWaveformBars(msgId || name || 'voice', 48));
	const active = $derived(isVoiceClipActive(msgId));
	const playing = $derived(active && chatVoicePlayer.status === 'playing');
	const positionMs = $derived(active ? chatVoicePlayer.positionMs : 0);
	const dur = $derived(
		active && chatVoicePlayer.durationMs > 0 ? chatVoicePlayer.durationMs : durationMs
	);
	const progress = $derived(dur > 0 ? Math.min(1, positionMs / dur) : 0);
	const timeLabel = $derived.by(() => {
		if (!src) return '…';
		if (dur > 0 && playing) return formatAudioDurationMs(Math.max(0, dur - positionMs));
		if (dur > 0) return formatAudioDurationMs(dur);
		return '0:00';
	});
	const speedLabel = $derived(formatVoiceSpeed(active ? chatVoicePlayer.speed : 1));

	function onPlayPause() {
		if (!src) return;
		void playVoiceClip({
			msgId,
			url: src,
			title: name || t('chat.voiceMessage'),
			author,
			durationMs: dur
		});
	}

	/** @param {PointerEvent} e */
	function onSeek(e) {
		if (!dur || !(e.currentTarget instanceof HTMLElement)) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		if (!active) {
			void playVoiceClip({
				msgId,
				url: src,
				title: name || t('chat.voiceMessage'),
				author,
				durationMs: dur
			}).then(() => seekVoiceClip(dur * fraction));
			return;
		}
		seekVoiceClip(dur * fraction);
	}
</script>

<div class="voice" class:mine={isMine}>
	<button
		type="button"
		class="play"
		aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
		disabled={!src}
		onclick={onPlayPause}
	>
		{#if playing}
			<Pause size={14} />
		{:else}
			<Play size={14} />
		{/if}
	</button>

	<button
		type="button"
		class="wave"
		aria-label={t('chat.seekVoice')}
		disabled={!src || !dur}
		onpointerdown={onSeek}
	>
		{#each bars as h, i (i)}
			<span
				class="bar"
				class:on={i / bars.length <= progress}
				style:height="{Math.round(8 + h * 20)}px"
			></span>
		{/each}
	</button>

	<span class="time">{timeLabel}</span>

	<button
		type="button"
		class="speed"
		aria-label={t('chat.playbackSpeed')}
		disabled={!src}
		onclick={(e) => {
			e.stopPropagation();
			if (!active && src) {
				void playVoiceClip({
					msgId,
					url: src,
					title: name || t('chat.voiceMessage'),
					author,
					durationMs: dur
				}).then(() => cycleVoiceSpeed());
				return;
			}
			cycleVoiceSpeed();
		}}
	>
		{speedLabel}
	</button>
</div>

<style>
	.voice {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: min(220px, 72vw);
		max-width: min(280px, 78vw);
		padding: 2px 0;
	}
	.play {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 20%, transparent);
		color: #fff;
		cursor: pointer;
	}
	.voice.mine .play {
		background: rgba(255, 255, 255, 0.22);
	}
	.play:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.wave {
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2px;
		height: 32px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		min-width: 0;
	}
	.wave:disabled {
		cursor: default;
	}
	.bar {
		flex: 1 1 0;
		min-width: 2px;
		max-width: 3px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 28%, transparent);
		align-self: center;
	}
	.voice.mine .bar {
		background: rgba(255, 255, 255, 0.28);
	}
	.bar.on {
		background: color-mix(in srgb, var(--accent-1, #6c5ce7) 90%, transparent);
	}
	.voice.mine .bar.on {
		background: rgba(255, 255, 255, 0.66);
	}
	.time {
		flex: 0 0 36px;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
		text-align: end;
		font-variant-numeric: tabular-nums;
	}
	.voice.mine .time {
		color: color-mix(in srgb, #fff 66%, transparent);
	}
	.speed {
		flex: 0 0 auto;
		border: none;
		border-radius: 999px;
		padding: 4px 7px;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
		color: var(--fg-66);
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
		font-variant-numeric: tabular-nums;
	}
	.voice.mine .speed {
		background: rgba(255, 255, 255, 0.16);
		color: rgba(255, 255, 255, 0.85);
	}
</style>
