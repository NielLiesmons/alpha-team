<script>
	import { onMount } from 'svelte';
	import { attachPeerMedia } from '$lib/calls.svelte.js';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   identity: string,
	 *   name: string,
	 *   audioEnabled: boolean,
	 *   videoEnabled: boolean,
	 *   isLocal: boolean
	 * }}
	 */
	let { identity, name, audioEnabled, videoEnabled, isLocal } = $props();

	/** @type {HTMLVideoElement | undefined} */
	let videoEl = $state();
	/** @type {HTMLAudioElement | undefined} */
	let audioEl = $state();

	const label = $derived(name || displayNameFromEmail(identity));

	function sync() {
		attachPeerMedia(identity, videoEl || null, audioEl || null);
	}

	onMount(() => {
		sync();
	});

	$effect(() => {
		void videoEnabled;
		void audioEnabled;
		void videoEl;
		void audioEl;
		sync();
	});
</script>

<div class="tile" class:local={isLocal} class:video-on={videoEnabled}>
	{#if videoEnabled}
		<video class="tile-video" bind:this={videoEl} playsinline muted={isLocal} autoplay></video>
	{:else}
		<div class="tile-avatar" aria-hidden="true">
			<span>{label.slice(0, 1).toUpperCase()}</span>
		</div>
	{/if}
	{#if !isLocal}
		<audio bind:this={audioEl} autoplay></audio>
	{/if}
	<div class="tile-meta">
		<span class="tile-name">{isLocal ? t('chat.callYou') : label}</span>
		{#if !audioEnabled}
			<span class="tile-muted">{t('chat.micOff')}</span>
		{/if}
	</div>
</div>

<style>
	.tile {
		position: relative;
		aspect-ratio: 3 / 4;
		border-radius: calc(var(--radius-hero, 34px) - 4px);
		overflow: hidden;
		background: var(--fg-4);
		display: grid;
		place-items: center;
	}

	.tile-video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tile.local .tile-video {
		transform: scaleX(-1);
	}

	.tile-avatar {
		width: 72px;
		height: 72px;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg-66);
		display: grid;
		place-items: center;
		font-size: 1.65rem;
		font-weight: 600;
	}

	.tile-meta {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: 10px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		pointer-events: none;
	}

	.tile-name {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg);
		padding: 4px 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		backdrop-filter: blur(8px);
	}

	.tile-muted {
		font-size: 11px;
		font-weight: 600;
		color: var(--accent-3, var(--destructive, #c44));
		padding: 4px 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
	}
</style>
