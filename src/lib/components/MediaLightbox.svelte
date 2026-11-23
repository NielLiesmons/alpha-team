<script>
	/**
	 * Fullscreen media viewer — modal scrim, centered media, desktop chevrons,
	 * mobile swipe, X | name | ⋯ chrome.
	 */
	import { fade } from 'svelte/transition';
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

	/** @type {number | null} */
	let touchStartX = null;
	/** @type {number | null} */
	let touchStartY = null;

	const open = $derived(mediaLightbox.open);
	const items = $derived(mediaLightbox.items);
	const index = $derived(mediaLightbox.index);
	const current = $derived(items[index] || null);
	const hasMany = $derived(items.length > 1);

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
		const t = e.changedTouches[0];
		if (!t) return;
		touchStartX = t.clientX;
		touchStartY = t.clientY;
	}

	/** @param {TouchEvent} e */
	function onTouchEnd(e) {
		if (touchStartX == null || touchStartY == null) return;
		const t = e.changedTouches[0];
		if (!t) return;
		const dx = t.clientX - touchStartX;
		const dy = t.clientY - touchStartY;
		touchStartX = null;
		touchStartY = null;
		if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
		stepMediaLightbox(dx < 0 ? 1 : -1);
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open && current}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="lightbox"
		role="dialog"
		aria-modal="true"
		aria-label={current.name || t('photos.title')}
		transition:fade={{ duration: 160 }}
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		<button type="button" class="scrim" aria-label={t('common.close')} onclick={closeMediaLightbox}
		></button>

		<div class="chrome">
			<ChromeActionButton
				variant="icon"
				label={t('common.close')}
				onclick={closeMediaLightbox}
			>
				<Close size={18} />
			</ChromeActionButton>
			<p class="name">{current.name || t('photos.untitled')}</p>
			<ChromeActionButton variant="more" label={t('common.more')} />
		</div>

		{#if hasMany}
			<button
				type="button"
				class="nav prev desktop-only"
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
				class="nav next desktop-only"
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
		{/if}

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
{/if}

<style>
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
		cursor: pointer;
		pointer-events: auto;
	}

	.chrome {
		position: relative;
		z-index: 2;
		flex-shrink: 0;
		display: grid;
		grid-template-columns: 28px 1fr 28px;
		align-items: center;
		gap: 8px;
		height: 48px;
		padding: 10px;
		box-sizing: border-box;
		pointer-events: auto;
	}

	.name {
		margin: 0;
		min-width: 0;
		text-align: center;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.2;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	.stage {
		position: relative;
		z-index: 1;
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		padding: 12px 56px 28px;
		box-sizing: border-box;
		pointer-events: none;
	}

	.media {
		pointer-events: auto;
		max-width: min(100%, 1100px);
		max-height: min(82vh, 900px);
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: 4px;
	}

	.loading {
		margin: 0;
		pointer-events: none;
		font-size: 14px;
		font-weight: 500;
		color: var(--fg-66);
	}

	.nav {
		position: absolute;
		top: 50%;
		z-index: 2;
		transform: translateY(-50%);
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
		color: var(--fg-66);
		cursor: pointer;
		pointer-events: auto;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		-webkit-tap-highlight-color: transparent;
	}

	.nav.prev {
		left: max(12px, env(safe-area-inset-left, 0px));
	}

	.nav.next {
		right: max(12px, env(safe-area-inset-right, 0px));
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

	.desktop-only {
		display: none;
	}

	@media (min-width: 768px) {
		.desktop-only {
			display: grid;
		}

		.stage {
			padding: 16px 72px 36px;
		}
	}

	@media (max-width: 767px) {
		.chrome {
			height: 68px;
			grid-template-columns: 44px 1fr 44px;
			padding: 12px;
		}

		.name {
			font-size: 17px;
			line-height: 1.15;
		}

		.stage {
			padding: 8px 12px calc(20px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
