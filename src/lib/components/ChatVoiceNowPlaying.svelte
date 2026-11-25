<script>
	/**
	 * Nav-menu / sidebar voice player panel.
	 * Top: chrome X + “{Name}'s Audio” + sender ProfilePic.
	 * Lower: same controls as chat-feed ChatVoiceBubble (1:1).
	 */
	import Close from '@alpha/ui/icons/Close.svelte';
	import ChatVoiceBubble from '$lib/components/ChatVoiceBubble.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		chatVoicePlayer,
		stopVoiceClip,
		voicePlayerVisible
	} from '$lib/chat-voice-player.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const visible = $derived(voicePlayerVisible());
	const title = $derived.by(() => {
		const name = chatVoicePlayer.speakerName || chatVoicePlayer.title;
		if (chatVoicePlayer.speakerName) {
			return t('chat.speakersVoiceMessage', { name: chatVoicePlayer.speakerName });
		}
		return name || t('chat.voiceMessage');
	});
	const speakerName = $derived(chatVoicePlayer.speakerName || chatVoicePlayer.title || '');
	const author = $derived(chatVoicePlayer.author || '');

	function dismiss() {
		stopVoiceClip();
	}
</script>

{#if visible && chatVoicePlayer.msgId && chatVoicePlayer.url}
	<div class="sidebar-slot">
		<div class="panel" role="group" aria-label={t('chat.nowPlaying')}>
			<div class="panel-top">
				<button type="button" class="chrome-btn" aria-label={t('common.close')} onclick={dismiss}>
					<Close size={16} />
				</button>
				<span class="panel-title">{title}</span>
				<span class="panel-pic">
					<ProfilePic
						name={speakerName}
						email={author}
						pictureUrl={pictureUrlFor(author)}
						size={28}
					/>
				</span>
			</div>

			<div class="panel-player">
				<ChatVoiceBubble
					msgId={chatVoicePlayer.msgId}
					src={chatVoicePlayer.url}
					durationMs={chatVoicePlayer.durationMs}
					{author}
					{speakerName}
					name={title}
				/>
			</div>
		</div>
	</div>
{/if}

<style>
	.sidebar-slot {
		flex-shrink: 0;
		min-width: 0;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: 10px;
		border-radius: 14px;
		background: var(--fg-8);
		box-sizing: border-box;
	}

	.panel-top {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	/* Match AppShell / UiShell list-top chrome X (desktop 28 glass, mobile 44 round). */
	.chrome-btn {
		flex: 0 0 auto;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 10px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66);
		cursor: pointer;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition: transform 0.18s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.chrome-btn:hover {
		color: var(--fg);
		/* Scale only — no color wash (design system). */
		transform: scale(1.06);
	}

	.chrome-btn :global(svg) {
		display: block;
	}

	.panel-title {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8125rem;
		font-weight: 650;
		color: var(--fg);
		line-height: 1.25;
	}

	.panel-pic {
		flex: 0 0 auto;
		display: inline-flex;
		line-height: 0;
	}

	.panel-player {
		min-width: 0;
		/* Bubble already pads; tighten so the panel doesn’t double-pad. */
		margin: 0 -4px -2px;
	}

	.panel-player :global(.voice) {
		max-width: none;
		width: 100%;
	}

	@media (max-width: 767px) {
		.chrome-btn {
			width: 44px;
			height: 44px;
			border-radius: 9999px;
		}

		/* Close.svelte owns mobile X size (--close-icon-size-mobile). */
		.chrome-btn :global(.close-icon),
		.chrome-btn :global(.close-icon svg) {
			width: var(--close-icon-size-mobile, 27px);
			height: var(--close-icon-size-mobile, 27px);
		}

		.panel-pic :global(.profile-pic) {
			width: 34px !important;
			height: 34px !important;
		}
	}
</style>
