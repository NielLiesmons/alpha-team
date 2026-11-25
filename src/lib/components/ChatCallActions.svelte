<script>
	/**
	 * Chat list chrome: round phone pill → opens full-page call setup (replaces feed).
	 */
	import Phone from '@alpha/ui/icons/Phone.svelte';
	import { acceptIncoming, callUi, dismissIncoming, openCallSetup } from '$lib/calls.svelte.js';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const active = $derived(
		callUi.phase === 'setup' || callUi.phase === 'connecting' || callUi.phase === 'in_call'
	);

	function onClick() {
		if (active) return;
		openCallSetup('audio');
	}
</script>

<div class="chat-call" role="group" aria-label={t('chat.call')}>
	<button
		type="button"
		class="chrome-btn call-btn"
		class:on={active}
		aria-label={t('chat.audioCall')}
		aria-pressed={active}
		onclick={onClick}
	>
		<span class="call-ico" aria-hidden="true">
			<Phone size={14} />
		</span>
	</button>

	{#if callUi.incoming && !active}
		<div class="incoming" role="status">
			<p class="incoming-text">
				{t('chat.incomingCall', { name: displayNameFromEmail(callUi.incoming.from) })}
			</p>
			<div class="incoming-actions">
				<button type="button" class="incoming-join" onclick={() => acceptIncoming()}>
					{t('chat.joinCall')}
				</button>
				<button type="button" class="incoming-decline" onclick={() => dismissIncoming()}>
					{t('chat.declineCall')}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.chat-call {
		position: relative;
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
	}

	.chrome-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		min-width: 28px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 9999px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66);
		cursor: pointer;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.15s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
		flex-shrink: 0;
	}

	.chrome-btn:hover,
	.chrome-btn.on {
		transform: scale(1.06);
	}

	.chrome-btn:active {
		transform: scale(0.96);
	}

	.call-ico {
		display: grid;
		place-items: center;
		line-height: 0;
	}

	.call-ico :global(svg) {
		display: block;
	}

	.incoming {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 30;
		min-width: 220px;
		padding: 12px;
		border-radius: 14px;
		border: 1px solid transparent;
		background:
			linear-gradient(var(--glass-panel, var(--glass)), var(--glass-panel, var(--glass))) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		box-shadow: 0 8px 24px color-mix(in srgb, var(--fg) 8%, transparent);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.incoming-text {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--fg-66);
	}

	.incoming-actions {
		display: flex;
		gap: 8px;
	}

	.incoming-join,
	.incoming-decline {
		flex: 1;
		height: 34px;
		border: none;
		border-radius: 9999px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.incoming-join {
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
	}

	.incoming-decline {
		background: var(--fg-8);
		color: var(--fg-66);
	}

	@media (max-width: 767px) {
		.chrome-btn {
			width: 44px;
			min-width: 44px;
			height: 44px;
			border-radius: 9999px;
		}

		.chrome-btn:hover,
		.chrome-btn.on {
			transform: scale(1.04);
		}

		.call-ico :global(.icon) {
			width: 18px !important;
			height: 18px !important;
		}
	}
</style>
