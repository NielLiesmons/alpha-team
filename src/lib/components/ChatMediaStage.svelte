<script>
	/**
	 * WhatsApp-style media staging: big WYSIWYG preview, thumb strip, per-item caption
	 * lives in the parent composer textarea (bound via active caption).
	 */
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @typedef {{
	 *   id: string,
	 *   file: File | null,
	 *   previewUrl: string | null,
	 *   kind: string,
	 *   caption: string,
	 *   library?: { name?: string }
	 * }} PendingMedia
	 */

	/**
	 * @type {{
	 *   items: PendingMedia[],
	 *   activeIndex: number,
	 *   onActiveIndex: (i: number) => void,
	 *   onRemove: (i: number) => void,
	 *   onAddMore: () => void
	 * }}
	 */
	let { items, activeIndex = 0, onActiveIndex, onRemove, onAddMore } = $props();

	const active = $derived(items[activeIndex] || items[0] || null);
</script>

{#if items.length && active}
	<div class="stage" role="group" aria-label={t('chat.mediaStage')}>
		<div class="hero">
			{#if active.kind === 'video' && active.previewUrl}
				<video class="hero-media" src={active.previewUrl} controls playsinline></video>
			{:else if active.previewUrl}
				<img
					class="hero-media"
					src={active.previewUrl}
					alt={active.file?.name || active.library?.name || ''}
				/>
			{:else}
				<div class="hero-fallback">{active.file?.name || active.library?.name || t('chat.attachment')}</div>
			{/if}
			<button
				type="button"
				class="hero-remove"
				aria-label={t('chat.remove')}
				onclick={() => onRemove(activeIndex)}
			>
				×
			</button>
			{#if items.length > 1}
				<span class="hero-count">{activeIndex + 1}/{items.length}</span>
			{/if}
		</div>

		<div class="strip" role="list">
			{#each items as item, i (item.id)}
				<button
					type="button"
					class="thumb"
					class:on={i === activeIndex}
					role="listitem"
					aria-label={item.file?.name || item.library?.name || t('chat.attachment')}
					aria-current={i === activeIndex ? 'true' : undefined}
					onclick={() => onActiveIndex(i)}
				>
					{#if item.previewUrl && item.kind === 'video'}
						<video src={item.previewUrl} muted playsinline preload="metadata"></video>
						<span class="thumb-play" aria-hidden="true">▶</span>
					{:else if item.previewUrl}
						<img src={item.previewUrl} alt="" />
					{:else}
						<span class="thumb-file">{item.kind === 'image' ? t('chat.image') : t('chat.video')}</span>
					{/if}
				</button>
			{/each}
			<button type="button" class="thumb add" aria-label={t('chat.addMedia')} onclick={onAddMore}>
				<span aria-hidden="true">+</span>
			</button>
		</div>
	</div>
{/if}

<style>
	.stage {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 10px 4px;
	}
	.hero {
		position: relative;
		border-radius: 14px;
		overflow: hidden;
		background: #0a0a0a;
		aspect-ratio: 4 / 3;
		max-height: min(42vh, 360px);
	}
	.hero-media {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		background: #0a0a0a;
	}
	.hero-fallback {
		display: grid;
		place-items: center;
		height: 100%;
		padding: 16px;
		color: var(--fg-66);
		font-size: 0.8125rem;
		font-weight: 500;
		text-align: center;
	}
	.hero-remove {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 78%, transparent);
		color: var(--fg);
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
	}
	.hero-count {
		position: absolute;
		top: 10px;
		left: 10px;
		padding: 4px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		color: var(--fg);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.strip {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 2px 2px 6px;
		scrollbar-width: none;
	}
	.strip::-webkit-scrollbar {
		display: none;
	}
	.thumb {
		position: relative;
		flex: 0 0 auto;
		width: 56px;
		height: 56px;
		padding: 0;
		border: none;
		border-radius: 10px;
		overflow: hidden;
		background: var(--fg-8);
		cursor: pointer;
		outline: 2px solid transparent;
		outline-offset: 1px;
	}
	.thumb.on {
		outline-color: var(--fg);
	}
	.thumb img,
	.thumb video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		pointer-events: none;
	}
	.thumb-play {
		position: absolute;
		inset: auto 4px 4px auto;
		font-size: 0.5625rem;
		color: #fff;
		text-shadow: 0 1px 2px #000;
	}
	.thumb-file {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		font-size: 0.625rem;
		font-weight: 600;
		color: var(--fg-66);
	}
	.thumb.add {
		display: grid;
		place-items: center;
		border: 1.5px dashed color-mix(in srgb, var(--fg) 22%, transparent);
		background: transparent;
		color: var(--fg-66);
		font-size: 1.375rem;
		font-weight: 400;
	}
</style>
