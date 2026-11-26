<script>
	/**
	 * Composer attach expand — content-type selector + tab body.
	 * Lives inside the shared composer expand slot (not a floating glass card).
	 */
	import Camera from '$lib/components/icons/Camera.svelte';
	import PhotoTile from '$lib/components/PhotoTile.svelte';
	import { listEntries } from '$lib/drive/entities.js';
	import { getAttachmentObjectUrl } from '$lib/drive/media-cache.js';
	import { mimeFromNameAndType } from '$lib/drive/media-kind.js';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { listPhotoItems } from '$lib/photos.js';
	import { t } from '$lib/i18n.svelte.js';
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';

	/**
	 * @typedef {{ kind: string, label: string, icon: string }} AttachItem
	 */

	/**
	 * @type {{
	 *   open?: boolean,
	 *   items?: AttachItem[],
	 *   tab?: string,
	 *   hd?: boolean,
	 *   onHdChange?: (hd: boolean) => void,
	 *   onPickFiles?: (files: File[]) => void,
	 *   onPickLibrary?: (item: import('$lib/photos.js').PhotoItem, previewUrl: string | null) => void,
	 *   onClose?: () => void
	 * }}
	 */
	let {
		open = false,
		items = [],
		tab = $bindable('photo'),
		hd = $bindable(false),
		onHdChange,
		onPickFiles,
		onPickLibrary,
		onClose
	} = $props();

	/** @type {import('$lib/photos.js').PhotoItem[]} */
	let library = $state([]);
	let libraryLoading = $state(false);
	/** @type {HTMLInputElement | undefined} */
	let cameraInput;
	/** @type {HTMLInputElement | undefined} */
	let galleryInput;
	/** @type {HTMLInputElement | undefined} */
	let fileInput;
	/** @type {number | null} */
	let touchStartY = null;

	const defaultTab = $derived(items[0]?.kind || 'photo');

	$effect(() => {
		if (open) {
			const allowed = new Set(items.map((i) => i.kind));
			if (!allowed.has(tab)) tab = defaultTab;
			void loadLibrary();
		}
	});

	async function loadLibrary() {
		const session = activeSession();
		if (!session) {
			library = [];
			return;
		}
		libraryLoading = true;
		try {
			const entries = await listEntries(session);
			library = listPhotoItems(entries).slice(0, 48);
		} catch {
			library = [];
		} finally {
			libraryLoading = false;
		}
	}

	/** @param {string} kind */
	function selectTab(kind) {
		tab = kind;
	}

	/** @param {Event} e */
	function onDeviceFiles(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = [...(input.files || [])];
		input.value = '';
		if (!files.length) return;
		onPickFiles?.(files);
	}

	function openCamera() {
		cameraInput?.click();
	}

	function openGallery() {
		galleryInput?.click();
	}

	function openFiles() {
		fileInput?.click();
	}

	/** @param {import('$lib/photos.js').PhotoItem} item */
	async function pickLibrary(item) {
		const session = activeSession();
		let previewUrl = /** @type {string | null} */ (null);
		if (session) {
			try {
				const res = await getAttachmentObjectUrl(
					session,
					{
						path: item.thumbPath || item.path,
						kind: item.kind,
						name: item.name,
						content_type: mimeFromNameAndType(item.name, '')
					},
					{}
				);
				previewUrl = res?.url || null;
			} catch {
				previewUrl = null;
			}
		}
		onPickLibrary?.(item, previewUrl);
	}

	/** @param {TouchEvent} e */
	function onTouchStart(e) {
		const touch = e.changedTouches[0];
		if (!touch) return;
		/* Only claim dismiss from the pill track / top chrome — not the scrollable grid. */
		const target = /** @type {HTMLElement | null} */ (e.target);
		if (target?.closest?.('.attach-body')) {
			touchStartY = null;
			return;
		}
		touchStartY = touch.clientY;
	}

	/** @param {TouchEvent} e */
	function onTouchEnd(e) {
		if (touchStartY == null) return;
		const touch = e.changedTouches[0];
		if (!touch) return;
		const dy = touch.clientY - touchStartY;
		touchStartY = null;
		if (dy > 72) onClose?.();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="attach-panel"
		role="region"
		aria-label={t('chat.attachTitle')}
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		<input
			bind:this={cameraInput}
			type="file"
			class="file-input"
			accept="image/*,video/*"
			capture="environment"
			onchange={onDeviceFiles}
		/>
		<input
			bind:this={galleryInput}
			type="file"
			class="file-input"
			accept="image/*,video/*"
			multiple
			onchange={onDeviceFiles}
		/>
		<input
			bind:this={fileInput}
			type="file"
			class="file-input"
			multiple
			accept=".pdf,.doc,.docx,.txt,.zip,application/pdf"
			onchange={onDeviceFiles}
		/>

		<div class="pill-shell">
			<!-- Outer recessed track — same family as Mail inbox SegmentedControl -->
			<div class="pill-track" role="tablist" aria-label={t('chat.attach')} data-h-scroll>
				{#each items as item (item.kind)}
					{@const on = tab === item.kind}
					{@const png = on ? navPngUrl(item.icon) : null}
					<button
						type="button"
						class="pill"
						class:on
						role="tab"
						aria-selected={on}
						onclick={() => selectTab(item.kind)}
					>
						<span class="pill-ico" aria-hidden="true">
							{#if png}
								<img class="pill-png" src={png} alt="" width="18" height="18" />
							{:else}
								<span class="pill-stroke"><NavIcon name={item.icon} size={18} /></span>
							{/if}
						</span>
						<span class="pill-label">{item.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="attach-body">
			{#if tab === 'photo'}
				<div class="photo-toolbar">
					<label class="hd-toggle">
						<input
							type="checkbox"
							checked={hd}
							onchange={(e) => {
								const next = /** @type {HTMLInputElement} */ (e.currentTarget).checked;
								hd = next;
								onHdChange?.(next);
							}}
						/>
						<span>{t('photos.uploadHd')}</span>
					</label>
					<button type="button" class="quiet-btn" onclick={openGallery}>{t('photos.fromDevice')}</button>
				</div>
				<div class="photo-grid">
					<button
						type="button"
						class="camera-cell"
						aria-label={t('photos.takePhoto')}
						onclick={openCamera}
					>
						<span class="camera-ico"><Camera size={28} /></span>
					</button>
					{#each library as item (item.key)}
						<PhotoTile {item} onclick={() => void pickLibrary(item)} />
					{/each}
				</div>
				{#if !libraryLoading && library.length === 0}
					<p class="hint">{t('photos.libraryEmpty')}</p>
				{/if}
			{:else if tab === 'file'}
				<div class="tab-cta">
					<button type="button" class="primary-pill" onclick={openFiles}>{t('chat.chooseFiles')}</button>
				</div>
			{:else if tab === 'poll'}
				<div class="tab-cta">
					<p class="hint">{t('chat.pollSoon')}</p>
				</div>
			{:else if tab === 'location'}
				<div class="tab-cta">
					<p class="hint">{t('chat.locationSoon')}</p>
				</div>
			{:else if tab === 'contact'}
				<div class="tab-cta">
					<p class="hint">{t('chat.contactSoon')}</p>
				</div>
			{:else if tab === 'event'}
				<div class="tab-cta">
					<p class="hint">{t('chat.eventSoon')}</p>
				</div>
			{:else}
				<div class="tab-cta">
					<p class="hint">{t('chat.attachSoon')}</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.attach-panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* ~61% of available page / chat column height */
		height: min(61dvh, calc(var(--app-height, 100dvh) * 0.61));
		max-height: min(61dvh, calc(var(--app-height, 100dvh) * 0.61));
		margin: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		overflow: hidden;
		box-sizing: border-box;
	}

	.file-input {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	.pill-shell {
		flex-shrink: 0;
		padding: 10px 10px 8px;
		box-sizing: border-box;
	}

	/* Outer pill container — Mail SegmentedControl / inbox category track */
	.pill-track {
		display: flex;
		align-items: stretch;
		gap: 2px;
		min-height: 40px;
		padding: 4px;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		box-sizing: border-box;
	}

	.pill-track::-webkit-scrollbar {
		display: none;
	}

	.pill {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 34px;
		height: 100%;
		padding: 6px 12px 6px 10px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		cursor: pointer;
		box-sizing: border-box;
		-webkit-tap-highlight-color: transparent;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}

	.pill:hover {
		color: var(--fg-66);
	}

	.pill.on {
		color: var(--fg);
		background:
			linear-gradient(var(--glass, var(--fg-4)), var(--glass, var(--fg-4))) padding-box,
			var(--glass-shine, var(--fg-8)) border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.pill.on .pill-label {
		color: var(--fg);
	}

	.pill-ico {
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		color: inherit;
	}

	.pill-png {
		display: block;
		width: 18px;
		height: 18px;
		object-fit: contain;
		border-radius: 4px;
	}

	.pill-stroke {
		display: grid;
		place-items: center;
		color: var(--fg-66);
	}

	.pill.on .pill-stroke {
		color: var(--fg);
	}

	.pill-label {
		color: inherit;
		white-space: nowrap;
	}

	.attach-body {
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		padding: 4px 0 12px;
		box-sizing: border-box;
	}

	.photo-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 2px 14px 10px;
		box-sizing: border-box;
	}

	.hd-toggle {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-66);
		cursor: pointer;
		user-select: none;
	}

	.hd-toggle input {
		width: 14px;
		height: 14px;
		margin: 0;
		accent-color: var(--fg);
		cursor: pointer;
	}

	.quiet-btn {
		border: 0;
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.quiet-btn:hover {
		color: var(--fg);
	}

	.photo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 1px;
		background: var(--fg-8);
		border-top: 1px solid var(--fg-8);
		border-bottom: 1px solid var(--fg-8);
	}

	.camera-cell {
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 0;
		border: 0;
		background: var(--fg-4);
		color: var(--fg-66);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.camera-cell:hover {
		color: var(--fg);
		background: var(--fg-8);
	}

	.camera-ico {
		display: grid;
		place-items: center;
		line-height: 0;
	}

	.tab-cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-height: 40%;
		padding: 28px 20px;
		box-sizing: border-box;
	}

	.primary-pill {
		border: 0;
		padding: 10px 18px;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.primary-pill:hover {
		background: color-mix(in srgb, var(--fg) 14%, transparent);
	}

	.hint {
		margin: 12px 16px 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg-33);
		text-align: center;
	}

	.tab-cta .hint {
		margin: 0;
	}
</style>
