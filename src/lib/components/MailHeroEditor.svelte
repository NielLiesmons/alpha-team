<script>
	/**
	 * Letter compose chrome: brand bar + hero image + title/description.
	 * Compose mode: top-right is publisher attribution picker (not Open Online).
	 */
	import Camera from './icons/Camera.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';

	/**
	 * @type {{
	 *   brand?: string,
	 *   logoUrl?: string,
	 *   accent?: string,
	 *   pageBg?: string,
	 *   ink?: string,
	 *   title?: string,
	 *   description?: string,
	 *   imageUrl?: string | null,
	 *   publisherName?: string,
	 *   publisherEmail?: string,
	 *   publisherOpen?: boolean,
	 *   onTitle?: (v: string) => void,
	 *   onDescription?: (v: string) => void,
	 *   onImage?: (dataUrl: string) => void,
	 *   onPublisherToggle?: () => void,
	 *   publisherMenu?: import('svelte').Snippet
	 * }}
	 */
	let {
		brand = 'Space',
		logoUrl = '',
		accent = '#dd8f87',
		pageBg = '#f7f3f1',
		ink = '#160b0f',
		title = '',
		description = '',
		imageUrl = null,
		publisherName = '',
		publisherEmail = '',
		publisherOpen = false,
		onTitle,
		onDescription,
		onImage,
		onPublisherToggle,
		publisherMenu
	} = $props();

	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	/**
	 * @param {File} file
	 * @returns {Promise<string>}
	 */
	function compressHero(file) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				const maxW = 1400;
				const scale = img.width > maxW ? maxW / img.width : 1;
				const w = Math.round(img.width * scale);
				const h = Math.round(img.height * scale);
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('canvas'));
					return;
				}
				ctx.drawImage(img, 0, 0, w, h);
				resolve(canvas.toDataURL('image/jpeg', 0.82));
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('image load failed'));
			};
			img.src = url;
		});
	}

	/** @param {Event} e */
	async function onFile(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file || !file.type.startsWith('image/')) return;
		try {
			const dataUrl = await compressHero(file);
			onImage?.(dataUrl);
		} catch {
			const reader = new FileReader();
			reader.onload = () => {
				const url = String(reader.result || '');
				if (url) onImage?.(url);
			};
			reader.readAsDataURL(file);
		}
	}

	function pickImage() {
		fileInput?.click();
	}
</script>

<section class="mail-hero" style:--mail-accent={accent} style:--mail-page-bg={pageBg} style:--mail-ink={ink}>
	<div class="top-bar" role="presentation">
		<span class="brand-slot">
			{#if logoUrl}
				<img class="brand-mark" src={logoUrl} alt="" width="16" height="18" />
			{/if}
			<span class="brand-name">{brand}</span>
		</span>
		<div class="publisher-wrap">
			<button
				type="button"
				class="publisher-btn"
				aria-label="Publishing as"
				aria-expanded={publisherOpen}
				onclick={() => onPublisherToggle?.()}
			>
				<ProfilePic
					name={publisherName || 'Publisher'}
					email={publisherEmail}
					pictureUrl={pictureUrlFor(publisherEmail)}
					size={22}
				/>
				<span class="publisher-name">{publisherName || publisherEmail || '…'}</span>
				<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M4 6.5 8 10.5 12 6.5"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			{#if publisherOpen && publisherMenu}
				{@render publisherMenu()}
			{/if}
		</div>
	</div>

	<button
		type="button"
		class="hero-frame"
		class:has-image={Boolean(imageUrl)}
		style:--hero-photo={imageUrl ? `url(${imageUrl})` : 'none'}
		onclick={pickImage}
		aria-label={imageUrl ? 'Change image' : 'Add image'}
	>
		<span class="camera-affordance">
			<Camera size={imageUrl ? 32 : 26} />
		</span>
	</button>

	<div class="copy">
		<input
			class="hero-title"
			placeholder="Title"
			value={title}
			oninput={(e) => onTitle?.(e.currentTarget.value)}
		/>
		<textarea
			class="hero-desc"
			rows="1"
			placeholder="Short description"
			value={description}
			oninput={(e) => onDescription?.(e.currentTarget.value)}
		></textarea>
	</div>

	<input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</section>

<style>
	.mail-hero {
		padding: 0;
		--mail-accent: #dd8f87;
		--mail-page-bg: #f7f3f1;
		--mail-ink: #160b0f;
		--hero-r: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.brand-slot {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.brand-mark {
		display: block;
		width: 16px;
		height: 18px;
		object-fit: contain;
		flex-shrink: 0;
	}

	.brand-name {
		font-family: 'Ovo', Georgia, 'Times New Roman', serif;
		font-size: 15px;
		font-weight: 400;
		font-synthesis: none;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--mail-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.publisher-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.publisher-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 30px;
		padding: 0 10px 0 4px;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--mail-ink) 6%, transparent);
		color: var(--mail-ink);
		font-family: Inter, Helvetica, Arial, sans-serif;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		max-width: 200px;
	}

	.publisher-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chev {
		flex-shrink: 0;
		opacity: 0.55;
	}

	.hero-frame {
		--hero-photo: none;
		position: relative;
		isolation: isolate;
		aspect-ratio: 1.618 / 1;
		width: 100%;
		min-height: 140px;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--hero-r);
		overflow: hidden;
		background: color-mix(in srgb, var(--mail-ink) 8%, transparent);
		cursor: pointer;
		display: grid;
		place-items: center;
		-webkit-tap-highlight-color: transparent;
	}

	.hero-frame.has-image {
		aspect-ratio: 1.618 / 1;
	}

	.hero-frame::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 0;
		background-image: var(--hero-photo);
		background-size: cover;
		background-position: center;
		pointer-events: none;
	}

	.camera-affordance {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--mail-page-bg) 72%, transparent);
		color: color-mix(in srgb, var(--mail-ink) 55%, transparent);
		pointer-events: none;
		box-sizing: border-box;
	}

	.hero-frame.has-image .camera-affordance {
		background: color-mix(in srgb, #000 28%, transparent);
		color: color-mix(in srgb, #fff 78%, transparent);
		filter: drop-shadow(0 1px 6px rgba(0, 0, 0, 0.28));
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 2px;
	}

	.hero-title,
	.hero-desc {
		width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--mail-ink);
	}

	.hero-title {
		font-family: 'Ovo', Georgia, 'Times New Roman', serif;
		font-size: 1.45rem;
		font-weight: 400;
		font-synthesis: none;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.hero-title::placeholder,
	.hero-desc::placeholder {
		color: color-mix(in srgb, var(--mail-ink) 40%, transparent);
	}

	.hero-desc {
		resize: none;
		min-height: 1.4em;
		field-sizing: content;
		font-family: Inter, Helvetica, Arial, sans-serif;
		font-size: 14px;
		line-height: 1.4;
		color: color-mix(in srgb, var(--mail-ink) 62%, transparent);
	}
</style>
