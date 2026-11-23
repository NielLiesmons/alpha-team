<script>
	/**
	 * Media viewer — desktop: Modal (~70vw×90vh) + SheetTopbar + external chevrons
	 * (Bley publication pattern). Mobile: fullscreen lightbox with blurred scrim.
	 */
	import { fade } from 'svelte/transition';
	import Modal from '@alpha/ui/Modal.svelte';
	import SheetTopbar from '@alpha/ui/SheetTopbar.svelte';
	import ChromeActionButton from '@alpha/ui/ChromeActionButton.svelte';
	import Close from '@alpha/ui/icons/Close.svelte';
	import {
		closeMediaLightbox,
		mediaLightbox,
		stepMediaLightbox
	} from '$lib/media-lightbox.svelte.js';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { getAttachmentObjectUrl } from '$lib/drive/media-cache.js';
	import { t } from '$lib/i18n.svelte.js';

	let displayUrl = $state('');
	let displayKind = $state(/** @type {'image' | 'video'} */ ('image'));
	let loading = $state(false);
	/** null until first matchMedia — avoids mobile↔desktop flash on open. */
	let isDesktop = $state(/** @type {boolean | null} */ (null));
	/** Synced with Modal bind:open so overlay/X dismiss closes the store. */
	let modalOpen = $state(false);
	let prevModalOpen = false;

	/** @type {number | null} */
	let touchStartX = null;
	/** @type {number | null} */
	let touchStartY = null;

	const open = $derived(mediaLightbox.open);
	const items = $derived(mediaLightbox.items);
	const index = $derived(mediaLightbox.index);
	const current = $derived(items[index] || null);
	const hasMany = $derived(items.length > 1);
	const title = $derived(current?.name || t('photos.untitled'));

	function checkDesktop() {
		if (typeof window === 'undefined') return;
		isDesktop = window.matchMedia('(min-width: 768px)').matches;
	}

	$effect(() => {
		checkDesktop();
	});

	$effect(() => {
		if (open && isDesktop === true) modalOpen = true;
		else if (!open) modalOpen = false;
	});

	$effect(() => {
		if (prevModalOpen && !modalOpen && open) {
			closeMediaLightbox();
		}
		prevModalOpen = modalOpen;
	});

	$effect(() => {
		const item = current;
		displayUrl = '';
		displayKind = item?.kind === 'video' ? 'video' : 'image';
		if (!item || !open) return;

		const ready = String(item.url || item.previewUrl || '').trim();
		if (ready && !ready.startsWith('local:')) {
			displayUrl = ready;
			return;
		}

		const path = String(item.path || '').trim();
		if (!path || path.startsWith('local:') || path.startsWith('blob:')) {
			if (item.previewUrl) displayUrl = item.previewUrl;
			return;
		}

		const session = activeSession();
		if (!session) return;
		const ac = new AbortController();
		loading = true;
		void getAttachmentObjectUrl(
			session,
			{ path, kind: item.kind, name: item.name },
			{ signal: ac.signal }
		)
			.then((res) => {
				if (ac.signal.aborted) return;
				if (res?.url) {
					displayUrl = res.url;
					if (res.kind === 'image' || res.kind === 'video') displayKind = res.kind;
				}
			})
			.finally(() => {
				if (!ac.signal.aborted) loading = false;
			});
		return () => ac.abort();
	});

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			closeMediaLightbox();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			stepMediaLightbox(-1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			stepMediaLightbox(1);
		}
	}

	/** @param {TouchEvent} e */
	function onTouchStart(e) {
		const touch = e.changedTouches[0];
		if (!touch) return;
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
	}

	/** @param {TouchEvent} e */
	function onTouchEnd(e) {
		if (touchStartX == null || touchStartY == null) return;
		const touch = e.changedTouches[0];
		if (!touch) return;
		const dx = touch.clientX - touchStartX;
		const dy = touch.clientY - touchStartY;
		touchStartX = null;
		touchStartY = null;
		if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
		stepMediaLightbox(dx < 0 ? 1 : -1);
	}
</script>

<svelte:window onkeydown={onKey} onresize={checkDesktop} />

{#if open && current && isDesktop === true}
	<Modal bind:open={modalOpen} label={title} size="media" dragDismiss={false}>
		<div class="viewer">
			<SheetTopbar
				title={title}
				trailing="more"
				closeLabel={t('common.close')}
				moreLabel={t('common.more')}
				onclose={closeMediaLightbox}
			/>
			<div class="stage">
				{#if displayUrl && displayKind === 'video'}
					<video class="media" src={displayUrl} controls playsinline autoplay></video>
				{:else if displayUrl}
					<img class="media" src={displayUrl} alt={current.name || ''} />
				{:else}
					<p class="loading" aria-busy="true">
						{loading ? t('chat.loadingMedia') : t('photos.untitled')}
					</p>
				{/if}
			</div>
		</div>
	</Modal>

	{#if hasMany}
		<div class="edges" aria-hidden="false">
			<button
				type="button"
				class="nav prev"
				aria-label={t('common.back')}
				onclick={() => stepMediaLightbox(-1)}
			>
				<svg width="22" height="22" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path
						d="M11.5 3.5 6 9l5.5 5.5"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<button
				type="button"
				class="nav next"
				aria-label={t('common.continue')}
				onclick={() => stepMediaLightbox(1)}
			>
				<svg width="22" height="22" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<path
						d="M6.5 3.5 12 9l-5.5 5.5"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
	{/if}
{:else if open && current && isDesktop === false}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="lightbox"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		transition:fade={{ duration: 160 }}
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		<button type="button" class="scrim" aria-label={t('common.close')} onclick={closeMediaLightbox}
		></button>

		<div class="chrome">
			<ChromeActionButton variant="icon" label={t('common.close')} onclick={closeMediaLightbox}>
				<Close size={18} />
			</ChromeActionButton>
			<p class="name">{title}</p>
			<ChromeActionButton variant="more" label={t('common.more')} />
		</div>

		<div class="stage mobile-stage">
			{#if displayUrl && displayKind === 'video'}
				<video class="media" src={displayUrl} controls playsinline autoplay></video>
			{:else if displayUrl}
				<img class="media" src={displayUrl} alt={current.name || ''} />
			{:else}
				<p class="loading" aria-busy="true">
					{loading ? t('chat.loadingMedia') : t('photos.untitled')}
				</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		height: 100%;
		max-height: 100%;
		overflow: hidden;
	}

	.stage {
		position: relative;
		z-index: 1;
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px 16px 20px;
		box-sizing: border-box;
		overflow: hidden;
	}

	.media {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
		object-position: center;
		border-radius: 4px;
	}

	.loading {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--fg-66);
	}

	/* External chevrons — Bley PubModal edge pattern beside the ~70vw card. */
	.edges {
		pointer-events: none;
	}

	.nav {
		position: fixed;
		top: 50%;
		z-index: 110;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 9999px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: color-mix(in srgb, var(--fg) 55%, transparent);
		cursor: pointer;
		pointer-events: auto;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.15s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)), color 0.15s ease;
	}

	.nav:hover {
		color: var(--fg);
		transform: translateY(-50%) scale(1.04);
	}

	.nav:active {
		transform: translateY(-50%) scale(0.96);
	}

	.nav.prev {
		left: calc(50% - (min(70vw, calc(100vw - 7.5rem)) / 2) - 14px);
		transform: translate(-100%, -50%);
	}

	.nav.prev:hover {
		transform: translate(-100%, -50%) scale(1.04);
	}

	.nav.prev:active {
		transform: translate(-100%, -50%) scale(0.96);
	}

	.nav.next {
		right: calc(50% - (min(70vw, calc(100vw - 7.5rem)) / 2) - 14px);
		left: auto;
		transform: translate(100%, -50%);
	}

	.nav.next:hover {
		transform: translate(100%, -50%) scale(1.04);
	}

	.nav.next:active {
		transform: translate(100%, -50%) scale(0.96);
	}

	/* Optical center for left/right chevrons in round glass hits. */
	.nav.prev svg {
		padding-right: 2px;
		box-sizing: content-box;
	}

	.nav.next svg {
		padding-left: 2px;
		box-sizing: content-box;
	}

	/* —— Mobile fullscreen —— */
	.lightbox {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: flex;
		flex-direction: column;
		pointer-events: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		margin: 0;
		background: var(--scrim);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		cursor: pointer;
		pointer-events: auto;
	}

	.chrome {
		position: relative;
		z-index: 2;
		flex-shrink: 0;
		display: grid;
		grid-template-columns: 44px 1fr 44px;
		align-items: center;
		gap: 8px;
		height: 68px;
		padding: 12px;
		box-sizing: border-box;
		pointer-events: auto;
	}

	.name {
		margin: 0;
		min-width: 0;
		text-align: center;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.15;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	.mobile-stage {
		pointer-events: none;
		padding: 8px 12px calc(20px + env(safe-area-inset-bottom, 0px));
	}

	.mobile-stage .media {
		pointer-events: auto;
		max-width: 100%;
		max-height: min(82vh, 900px);
	}
</style>
