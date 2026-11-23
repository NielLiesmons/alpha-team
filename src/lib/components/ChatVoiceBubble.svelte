<script>
	/**
	 * Telegram/WhatsApp-style voice row — play + waveform + speed/time.
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
	 *   name?: string
	 * }}
	 */
	let {
		msgId,
		src,
		isMine = false,
		durationMs = 0,
		author = '',
		speakerName = '',
		name = ''
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

	function onPlayPause() {
		if (!src) return;
		void playVoiceClip({
			msgId,
			url: src,
			title: playTitle,
			author,
			speakerName,
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
				title: playTitle,
				author,
				speakerName,
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
			<Pause size={18} />
		{:else}
			<Play size={18} />
		{/if}
	</button>

	<div class="cols">
		<button
			type="button"
			class="wave"
			aria-label={t('chat.seekVoice')}
			disabled={!src || !dur}
			onpointerdown={onSeek}
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
				aria-label={t('chat.playbackSpeed')}
				disabled={!src}
				onclick={(e) => {
					e.stopPropagation();
					if (!active && src) {
						void playVoiceClip({
							msgId,
							url: src,
							title: playTitle,
							author,
							speakerName,
							durationMs: dur
						}).then(() => cycleVoiceSpeed());
						return;
					}
					cycleVoiceSpeed();
				}}
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
		max-width: 500px;
		padding: 10px 12px;
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
	.bar-col.on .bar {
		background: color-mix(in srgb, var(--accent-1, #6c5ce7) 90%, transparent);
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
		font-size: 12px;
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
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
		font-family: inherit;
	}
	.voice.mine .speed {
		background: rgba(255, 255, 255, 0.16);
		color: rgba(255, 255, 255, 0.85);
	}
</style>
