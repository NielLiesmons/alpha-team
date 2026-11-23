<script>
	/**
	 * Glass pill under chat list title — now-playing voice chrome.
	 */
	import Play from '@alpha/ui/icons/Play.svelte';
	import Pause from '@alpha/ui/icons/Pause.svelte';
	import {
		chatVoicePlayer,
		cycleVoiceSpeed,
		pauseVoiceClip,
		resumeVoiceClip,
		stopVoiceClip,
		voicePlayerTimeLabel
	} from '$lib/chat-voice-player.svelte.js';
	import { formatVoiceSpeed } from '$lib/voice-waveform.js';
	import { t } from '$lib/i18n.svelte.js';

	const visible = $derived(
		Boolean(chatVoicePlayer.msgId) && chatVoicePlayer.status !== 'idle'
	);
	const playing = $derived(chatVoicePlayer.status === 'playing');
	const progress = $derived(
		chatVoicePlayer.durationMs > 0
			? Math.min(1, chatVoicePlayer.positionMs / chatVoicePlayer.durationMs)
			: 0
	);

	function toggle() {
		if (playing) pauseVoiceClip();
		else resumeVoiceClip();
	}
</script>

{#if visible}
	<div class="pill" role="group" aria-label={t('chat.nowPlaying')}>
		<button
			type="button"
			class="play"
			aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
			onclick={toggle}
		>
			{#if playing}
				<Pause size={12} />
			{:else}
				<Play size={12} />
			{/if}
		</button>
		<div class="meta">
			<span class="title">{chatVoicePlayer.title || t('chat.voiceMessage')}</span>
			{#if chatVoicePlayer.author}
				<span class="author">{chatVoicePlayer.author}</span>
			{/if}
		</div>
		<div class="track" aria-hidden="true">
			<span class="fill" style:width="{progress * 100}%"></span>
		</div>
		<span class="time">{voicePlayerTimeLabel()}</span>
		<button
			type="button"
			class="speed"
			aria-label={t('chat.playbackSpeed')}
			onclick={() => cycleVoiceSpeed()}
		>
			{formatVoiceSpeed(chatVoicePlayer.speed)}
		</button>
		<button type="button" class="close" aria-label={t('common.close')} onclick={() => stopVoiceClip()}
			>×</button
		>
	</div>
{/if}

<style>
	.pill {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 10px 8px;
		padding: 7px 8px 7px 7px;
		border-radius: 999px;
		border: 1px solid var(--glass-border, var(--fg-8));
		background: linear-gradient(var(--glass, var(--fg-4)), var(--glass, var(--fg-4))) padding-box;
		backdrop-filter: blur(var(--glass-blur, 18px));
		-webkit-backdrop-filter: blur(var(--glass-blur, 18px));
		box-shadow: 0 1px 0 color-mix(in srgb, #fff 8%, transparent) inset;
		min-width: 0;
	}
	.play,
	.close,
	.speed {
		flex: 0 0 auto;
		border: none;
		cursor: pointer;
		color: var(--fg-66);
		background: var(--fg-8);
		border-radius: 999px;
	}
	.play {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		color: var(--fg);
	}
	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
		max-width: 28%;
		gap: 1px;
	}
	.title {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.author {
		font-size: 10px;
		font-weight: 500;
		color: var(--fg-33);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.track {
		flex: 1 1 auto;
		height: 3px;
		min-width: 40px;
		border-radius: 999px;
		background: var(--fg-8);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--accent-1, var(--fg-66));
		border-radius: inherit;
	}
	.time {
		flex: 0 0 auto;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		font-family: inherit;
	}
	.speed {
		padding: 4px 7px;
		font-size: 11px;
		font-weight: 700;
		color: var(--fg-66);
	}
	.close {
		width: 24px;
		height: 24px;
		font-size: 16px;
		line-height: 1;
		color: var(--fg-33);
	}
</style>
