<script>
	/**
	 * Chat list chrome: one glass pill — audio/video icon + chevron options.
	 * Default selected mode = audio. Coming soon until media is wired.
	 * Menu uses shared DropdownMenu `items` (FloatPanel + popover.css rows).
	 */
	import Phone from '@alpha/ui/icons/Phone.svelte';
	import VideoCall from '@alpha/ui/icons/VideoCall.svelte';
	import DropdownMenu from './DropdownMenu.svelte';
	import { t } from '$lib/i18n.svelte.js';

	/** @typedef {'audio' | 'video'} CallMode */

	/** @type {CallMode} */
	let mode = $state('audio');
	let menuOpen = $state(false);
	/** @type {HTMLElement | null} */
	let pillEl = $state(null);
	let soonToast = $state(false);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let soonTimer = null;

	const callLabel = $derived(mode === 'video' ? t('chat.videoCall') : t('chat.audioCall'));

	const menuItems = $derived([
		{
			id: 'audio',
			label: t('chat.audioCall'),
			icon: Phone,
			active: mode === 'audio',
			hint: t('chat.callSoon'),
			onclick: () => chooseMode('audio')
		},
		{
			id: 'video',
			label: t('chat.videoCall'),
			icon: VideoCall,
			active: mode === 'video',
			hint: t('chat.callSoon'),
			onclick: () => chooseMode('video')
		}
	]);

	function showComingSoon() {
		soonToast = true;
		if (soonTimer) clearTimeout(soonTimer);
		soonTimer = setTimeout(() => {
			soonToast = false;
			soonTimer = null;
		}, 1800);
	}

	/** @param {CallMode} next */
	function chooseMode(next) {
		mode = next;
		showComingSoon();
	}

	function onPillClick() {
		menuOpen = !menuOpen;
	}
</script>

<div class="chat-call" role="group" aria-label={t('chat.call')}>
	<button
		type="button"
		class="chrome-btn call-pill"
		bind:this={pillEl}
		aria-label={callLabel}
		aria-expanded={menuOpen}
		aria-haspopup="menu"
		onclick={onPillClick}
	>
		<span class="call-ico" aria-hidden="true">
			{#if mode === 'video'}
				<VideoCall size={16} />
			{:else}
				<Phone size={14} />
			{/if}
		</span>
		<svg class="chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
	anchor={pillEl}
	placement="below"
	align="end"
	width={220}
	maxHeight={280}
	items={menuItems}
	onclose={() => (menuOpen = false)}
/>

<style>
	.chat-call {
		position: relative;
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
	}

	.chrome-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: 28px;
		width: auto;
		min-width: 28px;
		padding: 0 8px;
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
	.chrome-btn[aria-expanded='true'] {
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

	.call-ico :global(svg),
	.chevron {
		display: block;
	}

	.chevron {
		opacity: 0.85;
		flex-shrink: 0;
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
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--fg) 8%, transparent);
	}

	@media (max-width: 767px) {
		.chrome-btn {
			height: 44px;
			min-width: 44px;
			padding: 0 12px;
			gap: 4px;
			border-radius: 9999px;
		}

		.chrome-btn:hover,
		.chrome-btn[aria-expanded='true'] {
			transform: scale(1.04);
		}

		.call-ico :global(.icon) {
			width: 18px !important;
			height: 18px !important;
		}

		.chevron {
			width: 16px;
			height: 16px;
		}
	}
</style>
