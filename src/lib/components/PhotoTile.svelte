<script>
	/**
	 * Lazy Photos grid tile: blurhash → thumb → (full only in viewer).
	 */
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { getPath } from '$lib/drive/client.js';
	import { getAttachmentObjectUrl } from '$lib/drive/media-cache.js';
	import { paintBlurhash } from '$lib/drive/media-preview.js';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   item: import('$lib/photos.js').PhotoItem,
	 *   onclick?: () => void
	 * }}
	 */
	let { item, onclick } = $props();

	let rootEl = $state(/** @type {HTMLElement | undefined} */ (undefined));
	let canvasEl = $state(/** @type {HTMLCanvasElement | undefined} */ (undefined));
	let visible = $state(false);
	let url = $state('');
	let kind = $state(/** @type {'image' | 'video'} */ (item.kind));
	let failed = $state(false);
	let hasBlur = $state(false);

	$effect(() => {
		const el = rootEl;
		if (!el || typeof IntersectionObserver === 'undefined') {
			visible = true;
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					visible = true;
					io.disconnect();
				}
			},
			{ rootMargin: '240px 0px', threshold: 0.01 }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	$effect(() => {
		if (!visible) return;
		const session = activeSession();
		const previewPath = item.previewPath;
		const thumbPath = item.thumbPath;
		const mediaPath = item.path;
		const attKind = item.kind;
		/* Hold previous thumb across effect re-runs (session churn / entry refresh)
		 * so tiles never flash empty → thumb → empty. */
		failed = false;
		kind = attKind;
		if (!session) return;
		const ac = new AbortController();
		const hadUrl = Boolean(url);

		void (async () => {
			if (previewPath && !hadUrl) {
				try {
					const bytes = await getPath(session, previewPath);
					if (ac.signal.aborted) return;
					const doc = JSON.parse(new TextDecoder().decode(bytes));
					const hash = typeof doc?.blurhash === 'string' ? doc.blurhash : '';
					if (hash && canvasEl) {
						await paintBlurhash(canvasEl, hash);
						if (!ac.signal.aborted && !url) hasBlur = true;
					}
				} catch {
					/* no preview yet */
				}
			}

			const loadPath = thumbPath || mediaPath;
			if (!loadPath || ac.signal.aborted) return;
			const res = await getAttachmentObjectUrl(
				session,
				{
					path: loadPath,
					kind: thumbPath ? 'image' : attKind,
					name: thumbPath ? 'thumb.jpg' : item.name,
					content_type: thumbPath ? 'image/jpeg' : undefined
				},
				{ signal: ac.signal }
			);
			if (ac.signal.aborted) return;
			if (res?.url) {
				url = res.url;
				if (!thumbPath && (res.kind === 'image' || res.kind === 'video')) kind = res.kind;
				else if (thumbPath) kind = attKind;
			} else if (!url) {
				failed = true;
			}
		})();

		return () => ac.abort();
	});
</script>

<button
	type="button"
	class="tile"
	class:video={kind === 'video'}
	bind:this={rootEl}
	onclick={() => onclick?.()}
	aria-label={item.name || t('photos.untitled')}
>
	<canvas class="blur" class:on={hasBlur && !url} bind:this={canvasEl} aria-hidden="true"></canvas>
	{#if url && kind === 'video' && !item.thumbPath}
		<video class="media" src={url} muted playsinline preload="metadata"></video>
		<span class="play" aria-hidden="true">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
				<path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
			</svg>
		</span>
	{:else if url}
		<img class="media" src={url} alt="" loading="lazy" decoding="async" />
		{#if kind === 'video'}
			<span class="play" aria-hidden="true">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
					<path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
				</svg>
			</span>
		{/if}
	{:else if failed}
		<span class="fallback">{item.name || t('photos.untitled')}</span>
	{:else if !hasBlur}
		<span class="loading" aria-busy="true" aria-label={t('chat.loadingMedia')}></span>
	{/if}
</button>

<style>
	.tile {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1;
		padding: 0;
		margin: 0;
		border: none;
		border-radius: 0;
		overflow: hidden;
		background: var(--bg, var(--shell));
		cursor: pointer;
		color: var(--fg-66);
		content-visibility: auto;
		contain-intrinsic-size: 120px 120px;
	}
	.blur {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		pointer-events: none;
		transform: scale(1.08);
		filter: blur(12px);
	}
	.blur.on {
		opacity: 1;
	}
	.media {
		position: relative;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		pointer-events: none;
	}
	.play {
		position: absolute;
		inset: auto 8px 8px auto;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		color: var(--fg);
		pointer-events: none;
	}
	.loading {
		display: block;
		width: 100%;
		height: 100%;
		background: linear-gradient(110deg, var(--fg-4) 20%, var(--fg-8) 40%, var(--fg-4) 60%);
		background-size: 200% 100%;
		animation: shimmer 1.2s ease-in-out infinite;
	}
	.fallback {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		padding: 10px;
		font-size: 11px;
		font-weight: 500;
		text-align: center;
		color: var(--fg-33);
		word-break: break-word;
	}
	@keyframes shimmer {
		0% {
			background-position: 100% 0;
		}
		100% {
			background-position: -100% 0;
		}
	}
</style>
