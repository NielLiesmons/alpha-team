<script>
	/**
	 * Chat list chrome: call affordance + chevron mode menu (Coming soon).
	 * Default selected mode = audio. Glass rounds match AppShell chrome-btn.
	 */
	import Phone from '@alpha/ui/icons/Phone.svelte';
	import VideoCall from '@alpha/ui/icons/VideoCall.svelte';
	import DropdownMenu from './DropdownMenu.svelte';
	import { t } from '$lib/i18n.svelte.js';

	/** @typedef {'audio' | 'video' | 'meeting'} CallMode */

	/** @type {CallMode} */
	let mode = $state('audio');
	let menuOpen = $state(false);
	/** @type {HTMLElement | null} */
	let chevronEl = $state(null);
	let soonToast = $state(false);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let soonTimer = null;

	const callLabel = $derived(
		mode === 'video'
			? t('chat.videoCall')
			: mode === 'meeting'
				? t('chat.meeting')
				: t('chat.audioCall')
	);

	function showComingSoon() {
		soonToast = true;
		if (soonTimer) clearTimeout(soonTimer);
		soonTimer = setTimeout(() => {
			soonToast = false;
			soonTimer = null;
		}, 1800);
	}

	function onCallClick() {
		showComingSoon();
	}

	/** @param {CallMode} next */
	function chooseMode(next) {
		mode = next;
		menuOpen = false;
		showComingSoon();
	}

	function toggleMenu() {
		menuOpen = !menuOpen;
	}
</script>

<div class="chat-call" role="group" aria-label={t('chat.call')}>
	<button
		type="button"
		class="chrome-btn call-main"
		aria-label={callLabel}
		onclick={onCallClick}
	>
		{#if mode === 'video'}
			<VideoCall size={16} />
		{:else}
			<!-- audio + meeting share the phone glyph until meeting has its own mark -->
			<Phone size={14} />
		{/if}
	</button>
	<span class="call-divider" aria-hidden="true"></span>
	<button
		type="button"
		class="chrome-btn call-chevron"
		bind:this={chevronEl}
		aria-label={t('chat.callOptions')}
		aria-expanded={menuOpen}
		aria-haspopup="menu"
		onclick={toggleMenu}
	>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path
				d="M3 4.5 6 7.5 9 4.5"
				stroke="currentColor"
				stroke-width="1.2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	{#if soonToast}
		<p class="soon-toast" role="status">{t('chat.callSoon')}</p>
	{/if}
</div>

<DropdownMenu
	open={menuOpen}
	anchor={chevronEl}
	placement="below"
	align="end"
	width={220}
	maxHeight={280}
	onclose={() => (menuOpen = false)}
>
	<div class="dropdown-list" role="menu">
		<button
			type="button"
			class="dropdown-item"
			class:on={mode === 'audio'}
			role="menuitem"
			onclick={() => chooseMode('audio')}
		>
			<Phone size={14} />
			<span>{t('chat.audioCall')}</span>
			<span class="hint">{t('chat.callSoon')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item"
			class:on={mode === 'video'}
			role="menuitem"
			onclick={() => chooseMode('video')}
		>
			<VideoCall size={15} />
			<span>{t('chat.videoCall')}</span>
			<span class="hint">{t('chat.callSoon')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item"
			class:on={mode === 'meeting'}
			role="menuitem"
			onclick={() => chooseMode('meeting')}
		>
			<Phone size={14} />
			<span>{t('chat.meeting')}</span>
			<span class="hint">{t('chat.callSoon')}</span>
		</button>
	</div>
</DropdownMenu>

<style>
	.chat-call {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.chrome-btn {
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
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.15s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
		flex-shrink: 0;
	}

	.chrome-btn:hover,
	.chrome-btn[aria-expanded='true'] {
		transform: scale(1.06);
	}

	.chrome-btn:active {
		transform: scale(0.96);
	}

	.chrome-btn :global(svg) {
		display: block;
	}

	.call-chevron {
		/* Slightly narrower optical hit — chevron only */
		width: 28px;
	}

	.call-divider {
		width: 1px;
		height: 16px;
		background: var(--fg-16, var(--fg-8));
		flex-shrink: 0;
		border-radius: 1px;
	}

	.soon-toast {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 20;
		margin: 0;
		padding: 8px 12px;
		border-radius: 10px;
		border: 1px solid transparent;
		background:
			linear-gradient(var(--glass-panel, var(--glass)), var(--glass-panel, var(--glass))) padding-box,
			var(--glass-shine) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		color: var(--fg-66);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.dropdown-list {
		display: flex;
		flex-direction: column;
		padding: 4px 0;
	}

	.dropdown-item {
		display: grid;
		grid-template-columns: 18px 1fr auto;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 14px;
		border: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.dropdown-item:hover,
	.dropdown-item.on {
		background: var(--fg-4);
		color: var(--fg);
	}

	.dropdown-item .hint {
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}

	@media (max-width: 767px) {
		.chat-call {
			gap: 6px;
		}

		.chrome-btn {
			width: 44px;
			height: 44px;
			border-radius: 9999px;
		}

		.chrome-btn:hover,
		.chrome-btn[aria-expanded='true'] {
			transform: scale(1.04);
		}

		.call-divider {
			height: 22px;
		}

		.call-main :global(.icon) {
			width: 18px !important;
			height: 18px !important;
		}

		.call-chevron :global(svg) {
			width: 16px;
			height: 16px;
		}
	}
</style>
