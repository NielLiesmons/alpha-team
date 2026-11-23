<script>
	/**
	 * Voice now-playing chrome:
	 * - placement=bar → compact mobile top-bar pill (opens modal)
	 * - placement=sidebar → desktop nav-menu player panel
	 */
	import Modal from '@alpha/ui/Modal.svelte';
	import Close from '@alpha/ui/icons/Close.svelte';
	import Play from '@alpha/ui/icons/Play.svelte';
	import Pause from '@alpha/ui/icons/Pause.svelte';
	import {
		chatVoicePlayer,
		closeVoicePlayerPanel,
		cycleVoiceSpeed,
		openVoicePlayerPanel,
		seekVoiceClipFraction,
		stopVoiceClip,
		toggleVoicePlayPause,
		voicePlayerProgress,
		voicePlayerTimeLabel,
		voicePlayerVisible
	} from '$lib/chat-voice-player.svelte.js';
	import { formatAudioDurationMs, formatVoiceSpeed } from '$lib/voice-waveform.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {{ placement?: 'bar' | 'sidebar' }} */
	let { placement = 'bar' } = $props();

	const visible = $derived(voicePlayerVisible());
	const playing = $derived(chatVoicePlayer.status === 'playing');
	const progress = $derived(voicePlayerProgress());
	const speedLabel = $derived(formatVoiceSpeed(chatVoicePlayer.speed));
	const timeLabel = $derived(voicePlayerTimeLabel());
	const title = $derived.by(() => {
		const name = chatVoicePlayer.speakerName || chatVoicePlayer.title;
		if (chatVoicePlayer.speakerName) {
			return t('chat.speakersVoiceMessage', { name: chatVoicePlayer.speakerName });
		}
		return name || t('chat.voiceMessage');
	});
	const countLabel = $derived.by(() => {
		const n = chatVoicePlayer.queueCount;
		if (n <= 1) return '';
		return `${chatVoicePlayer.queueIndex + 1}/${n}`;
	});

	let modalOpen = $state(false);
	let prevModalOpen = false;

	$effect(() => {
		if (placement !== 'bar') return;
		if (!visible) {
			modalOpen = false;
			if (chatVoicePlayer.panelOpen) closeVoicePlayerPanel();
			return;
		}
		modalOpen = Boolean(chatVoicePlayer.panelOpen);
	});

	$effect(() => {
		if (placement !== 'bar') return;
		if (prevModalOpen && !modalOpen && chatVoicePlayer.panelOpen) {
			closeVoicePlayerPanel();
		}
		prevModalOpen = modalOpen;
	});

	function toggle() {
		toggleVoicePlayPause();
	}

	function openPanel() {
		openVoicePlayerPanel();
	}

	function closePanel() {
		modalOpen = false;
		closeVoicePlayerPanel();
	}

	function dismiss() {
		stopVoiceClip();
	}

	/** @type {HTMLElement | undefined} */
	let scrubEl = $state();
	let scrubbing = $state(false);

	/** @param {number} clientX */
	function seekFromX(clientX) {
		if (!scrubEl || !chatVoicePlayer.durationMs) return;
		const rect = scrubEl.getBoundingClientRect();
		seekVoiceClipFraction((clientX - rect.left) / rect.width);
	}

	/** @param {PointerEvent} e */
	function onScrubDown(e) {
		if (!chatVoicePlayer.durationMs) return;
		scrubbing = true;
		scrubEl?.setPointerCapture(e.pointerId);
		seekFromX(e.clientX);
	}

	/** @param {PointerEvent} e */
	function onScrubMove(e) {
		if (!scrubbing) return;
		seekFromX(e.clientX);
	}

	/** @param {PointerEvent} e */
	function onScrubUp(e) {
		if (!scrubbing) return;
		scrubbing = false;
		try {
			scrubEl?.releasePointerCapture(e.pointerId);
		} catch {
			/* already released */
		}
	}
</script>

{#if placement === 'bar' && visible}
	<div class="bar" role="group" aria-label={t('chat.nowPlaying')}>
		<button
			type="button"
			class="play"
			aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
			onclick={(e) => {
				e.stopPropagation();
				toggle();
			}}
		>
			{#if playing}
				<Pause size={14} />
			{:else}
				<Play size={14} />
			{/if}
		</button>
		<button type="button" class="open" aria-label={t('chat.nowPlaying')} onclick={openPanel}>
			<span class="title">{title}</span>
			{#if countLabel}
				<span class="count">{countLabel}</span>
			{/if}
		</button>
	</div>

	<Modal bind:open={modalOpen} label={t('chat.nowPlaying')}>
		<div class="panel modal-panel">
			<div class="panel-top">
				<button type="button" class="x" aria-label={t('common.close')} onclick={closePanel}>
					<Close size={16} />
				</button>
				<span class="panel-title">{title}</span>
				{#if countLabel}
					<span class="panel-count">{countLabel}</span>
				{/if}
			</div>

			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				bind:this={scrubEl}
				class="scrub"
				role="slider"
				aria-label={t('chat.seekVoice')}
				aria-valuemin={0}
				aria-valuemax={Math.round(chatVoicePlayer.durationMs || 0)}
				aria-valuenow={Math.round(chatVoicePlayer.positionMs || 0)}
				tabindex="0"
				onpointerdown={onScrubDown}
				onpointermove={onScrubMove}
				onpointerup={onScrubUp}
				onpointercancel={onScrubUp}
			>
				<span class="scrub-track">
					<span class="scrub-fill" style:width="{progress * 100}%"></span>
				</span>
			</div>
			<div class="times">
				<span>{formatAudioDurationMs(chatVoicePlayer.positionMs)}</span>
				<span
					>{chatVoicePlayer.durationMs > 0
						? formatAudioDurationMs(chatVoicePlayer.durationMs)
						: '–:––'}</span
				>
			</div>

			<div class="controls">
				<button
					type="button"
					class="speed"
					aria-label={t('chat.playbackSpeed')}
					onclick={() => cycleVoiceSpeed()}
				>
					{speedLabel}
				</button>
				<button
					type="button"
					class="play-lg"
					aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
					onclick={toggle}
				>
					{#if playing}
						<Pause size={22} />
					{:else}
						<Play size={22} />
					{/if}
				</button>
				<span class="time-chip">{timeLabel}</span>
			</div>
		</div>
	</Modal>
{/if}

{#if placement === 'sidebar' && visible}
	<div class="sidebar-slot">
		<div class="panel sidebar-panel" role="group" aria-label={t('chat.nowPlaying')}>
			<div class="panel-top">
				<button type="button" class="x" aria-label={t('common.close')} onclick={dismiss}>
					<Close size={14} />
				</button>
				<span class="panel-title">{title}</span>
				{#if countLabel}
					<span class="panel-count">{countLabel}</span>
				{/if}
			</div>

			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				bind:this={scrubEl}
				class="scrub"
				role="slider"
				aria-label={t('chat.seekVoice')}
				aria-valuemin={0}
				aria-valuemax={Math.round(chatVoicePlayer.durationMs || 0)}
				aria-valuenow={Math.round(chatVoicePlayer.positionMs || 0)}
				tabindex="0"
				onpointerdown={onScrubDown}
				onpointermove={onScrubMove}
				onpointerup={onScrubUp}
				onpointercancel={onScrubUp}
			>
				<span class="scrub-track">
					<span class="scrub-fill" style:width="{progress * 100}%"></span>
				</span>
			</div>
			<div class="times">
				<span>{formatAudioDurationMs(chatVoicePlayer.positionMs)}</span>
				<span
					>{chatVoicePlayer.durationMs > 0
						? formatAudioDurationMs(chatVoicePlayer.durationMs)
						: '–:––'}</span
				>
			</div>

			<div class="controls">
				<button
					type="button"
					class="speed"
					aria-label={t('chat.playbackSpeed')}
					onclick={() => cycleVoiceSpeed()}
				>
					{speedLabel}
				</button>
				<button
					type="button"
					class="play-lg"
					aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
					onclick={toggle}
				>
					{#if playing}
						<Pause size={18} />
					{:else}
						<Play size={18} />
					{/if}
				</button>
				<span class="time-chip">{timeLabel}</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		height: 44px;
		padding: 0 6px 0 4px;
		border: 1px solid transparent;
		border-radius: 9999px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		box-sizing: border-box;
		width: 100%;
	}

	.bar .play {
		flex: 0 0 auto;
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg);
		cursor: pointer;
		padding: 0;
	}

	.bar .open {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 6px 0 2px;
		border: 0;
		background: transparent;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.bar .title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 600;
		color: var(--fg);
		line-height: 1.2;
	}

	.bar .count {
		flex: 0 0 auto;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.sidebar-slot {
		flex-shrink: 0;
		min-width: 0;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		box-sizing: border-box;
	}

	.modal-panel {
		padding: 14px 16px 18px;
	}

	.sidebar-panel {
		padding: 10px;
		border-radius: 14px;
		background: var(--fg-8);
	}

	.panel-top {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.x {
		flex: 0 0 auto;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-66);
		cursor: pointer;
		padding: 0;
	}

	.x:hover {
		color: var(--fg);
	}

	.panel-title {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 650;
		color: var(--fg);
		line-height: 1.25;
	}

	.panel-count {
		flex: 0 0 auto;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.scrub {
		width: 100%;
		height: 22px;
		display: flex;
		align-items: center;
		touch-action: none;
		user-select: none;
		cursor: pointer;
	}

	.scrub-track {
		position: relative;
		display: block;
		width: 100%;
		height: 3px;
		border-radius: 2px;
		background: var(--fg-16);
		overflow: hidden;
		pointer-events: none;
	}

	.scrub-fill {
		display: block;
		height: 100%;
		background: var(--fg-66);
		border-radius: inherit;
	}

	.times {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: var(--fg-33);
		font-family: inherit;
		line-height: 1.2;
		margin-top: -4px;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.speed {
		flex: 0 0 auto;
		min-width: 40px;
		height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.sidebar-panel .speed {
		background: color-mix(in srgb, var(--fg) 10%, transparent);
	}

	.play-lg {
		flex: 0 0 auto;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg);
		cursor: pointer;
		padding: 0;
	}

	.sidebar-panel .play-lg {
		width: 36px;
		height: 36px;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
	}

	.time-chip {
		flex: 0 0 auto;
		min-width: 72px;
		text-align: end;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
		font-family: inherit;
		white-space: nowrap;
	}
</style>
