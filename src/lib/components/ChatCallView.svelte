<script>
	/**
	 * Full-page call setup + in-call UI — replaces chat feed in the same panel slot.
	 * Owns SheetTopbar (list-top is hidden while open) so X is never under shell chrome.
	 */
	import Camera from '$lib/components/icons/Camera.svelte';
	import ChatCallPeerTile from '$lib/components/ChatCallPeerTile.svelte';
	import Phone from '@alpha/ui/icons/Phone.svelte';
	import SheetTopbar from '@alpha/ui/SheetTopbar.svelte';
	import Voice from '$lib/components/icons/Voice.svelte';
	import {
		bindLocalPreview,
		callUi,
		closeCallSetup,
		launchCall,
		leaveCall,
		setCamOn,
		setMicOn
	} from '$lib/calls.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {HTMLVideoElement | undefined} */
	let previewEl = $state();

	$effect(() => {
		if (callUi.phase === 'setup' && callUi.camOn && previewEl) {
			bindLocalPreview(previewEl);
		}
	});

	const title = $derived(
		callUi.phase === 'in_call' || callUi.phase === 'connecting'
			? callUi.kind === 'video'
				? t('chat.videoCall')
				: t('chat.audioCall')
			: t('chat.callSetup')
	);

	async function onLaunch() {
		await launchCall();
	}

	async function onHangup() {
		await leaveCall();
	}

	function onClose() {
		if (callUi.phase === 'connecting') return;
		if (callUi.phase === 'in_call') void onHangup();
		else closeCallSetup();
	}
</script>

<div class="call-view" class:in-call={callUi.phase === 'in_call' || callUi.phase === 'connecting'}>
	<SheetTopbar
		{title}
		trailing="none"
		closeLabel={t('common.close')}
		onclose={onClose}
	/>

	{#if callUi.error}
		<p class="call-err" role="alert">{callUi.error}</p>
	{/if}

	{#if callUi.phase === 'setup'}
		<div class="setup">
			<div class="preview-wrap" class:off={!callUi.camOn}>
				{#if callUi.camOn}
					<video class="preview" bind:this={previewEl} playsinline muted autoplay></video>
				{:else}
					<div class="preview-placeholder">
						<span class="preview-ico" aria-hidden="true"><Phone size={28} /></span>
						<p>{t('chat.callAudioOnly')}</p>
					</div>
				{/if}
			</div>

			<div class="toggles" role="group" aria-label={t('chat.callMedia')}>
				<button
					type="button"
					class="chrome-btn toggle"
					class:off={!callUi.micOn}
					aria-pressed={callUi.micOn}
					aria-label={callUi.micOn ? t('chat.muteMic') : t('chat.unmuteMic')}
					onclick={() => setMicOn(!callUi.micOn)}
				>
					<Voice size={18} />
				</button>
				<button
					type="button"
					class="chrome-btn toggle"
					class:off={!callUi.camOn}
					aria-pressed={callUi.camOn}
					aria-label={callUi.camOn ? t('chat.stopCamera') : t('chat.startCamera')}
					onclick={() => setCamOn(!callUi.camOn)}
				>
					<Camera size={18} />
				</button>
			</div>

			<p class="settings-later">{t('chat.callSettingsLater')}</p>

			<button type="button" class="launch" onclick={onLaunch}>
				{t('chat.launchCall')}
			</button>
		</div>
	{:else}
		<div class="stage">
			{#if callUi.phase === 'connecting'}
				<p class="connecting">{t('chat.callConnecting')}</p>
			{/if}
			<div class="tiles" class:solo={callUi.peers.length <= 1}>
				{#each callUi.peers as peer (peer.identity + (peer.isLocal ? '-local' : ''))}
					<ChatCallPeerTile
						identity={peer.identity}
						name={peer.name}
						audioEnabled={peer.audioEnabled}
						videoEnabled={peer.videoEnabled}
						isLocal={peer.isLocal}
					/>
				{/each}
			</div>

			<div class="controls" role="toolbar" aria-label={t('chat.callControls')}>
				<button
					type="button"
					class="chrome-btn toggle"
					class:off={!callUi.micOn}
					aria-pressed={callUi.micOn}
					aria-label={callUi.micOn ? t('chat.muteMic') : t('chat.unmuteMic')}
					onclick={() => setMicOn(!callUi.micOn)}
				>
					<Voice size={18} />
				</button>
				<button
					type="button"
					class="chrome-btn toggle"
					class:off={!callUi.camOn}
					aria-pressed={callUi.camOn}
					aria-label={callUi.camOn ? t('chat.stopCamera') : t('chat.startCamera')}
					onclick={() => setCamOn(!callUi.camOn)}
				>
					<Camera size={18} />
				</button>
				<button type="button" class="hangup" aria-label={t('chat.hangUp')} onclick={onHangup}>
					<Phone size={18} />
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	/*
	 * Clear floating list-top while this view is mounted (X must not sit under Chat chrome).
	 * :has is the reliable path — AppShell listTopHidden is a belt-and-suspenders.
	 */
	:global(.list-col:has(.call-view) > .list-top) {
		display: none !important;
	}

	.call-view {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding: 0 16px calc(20px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		background: var(--bg);
		/* Above any residual list fade; list-top is hidden while open. */
		position: relative;
		z-index: 8;
	}

	.call-view :global(.sheet-top) {
		margin: 0 -6px 8px;
	}

	.chrome-btn {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 9999px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66);
		cursor: pointer;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition: transform 0.15s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.chrome-btn:hover:not(:disabled) {
		transform: scale(1.06);
	}

	.chrome-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.call-err {
		margin: 0 0 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--fg-4);
		color: var(--fg-66);
		font-size: 13px;
		font-weight: 500;
	}

	.setup {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding-top: 8px;
	}

	.preview-wrap {
		width: min(100%, 360px);
		aspect-ratio: 3 / 4;
		border-radius: calc(var(--radius-hero, 34px) - 2px);
		overflow: hidden;
		background: var(--fg-4);
		border: 1px solid var(--fg-8);
	}

	.preview {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform: scaleX(-1);
	}

	.preview-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: var(--fg-33);
	}

	.preview-placeholder p {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
	}

	.preview-ico {
		color: var(--fg-66);
		opacity: 0.85;
	}

	.toggles,
	.controls {
		display: inline-flex;
		align-items: center;
		gap: 12px;
	}

	.toggle {
		width: 44px;
		height: 44px;
	}

	.toggle.off {
		color: var(--accent-3, var(--destructive, #c44));
	}

	.settings-later {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
		text-align: center;
	}

	.launch {
		margin-top: auto;
		width: min(100%, 320px);
		height: 48px;
		border: none;
		border-radius: 9999px;
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.launch:hover {
		transform: scale(1.02);
	}

	.launch:active {
		transform: scale(0.98);
	}

	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.connecting {
		margin: 0;
		text-align: center;
		font-size: 14px;
		font-weight: 500;
		color: var(--accent-2, var(--fg-66));
	}

	.tiles {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 10px;
		align-content: start;
	}

	.tiles.solo {
		grid-template-columns: 1fr;
		max-width: 420px;
		margin: 0 auto;
		width: 100%;
	}

	.controls {
		justify-content: center;
		padding-bottom: 4px;
		flex-shrink: 0;
	}

	.hangup {
		width: 52px;
		height: 52px;
		display: grid;
		place-items: center;
		border: none;
		border-radius: 9999px;
		background: var(--accent-3, var(--destructive, #c44));
		color: #fff;
		cursor: pointer;
		transform: rotate(135deg);
		transition: transform 0.15s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.hangup:hover {
		transform: rotate(135deg) scale(1.06);
	}
</style>
