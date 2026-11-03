<script>
	/**
	 * Mail compose preview — matches alpha-api `render_letter_html`:
	 * top bar outside hero (LETTER n · logo+name · Open Online), plain rounded image,
	 * title + description under the image.
	 */
	import Camera from './icons/Camera.svelte';

	/** @type {{
	 *   brand?: string,
	 *   logoUrl?: string,
	 *   eyebrow?: string,
	 *   letterNumber?: number | null,
	 *   readCta?: string,
	 *   readUrl?: string,
	 *   accent?: string,
	 *   pageBg?: string,
	 *   ink?: string,
	 *   title?: string,
	 *   description?: string,
	 *   imageUrl?: string | null,
	 *   onTitle?: (v: string) => void,
	 *   onDescription?: (v: string) => void,
	 *   onImage?: (dataUrl: string) => void
	 * }} */
	let {
		brand = 'Space',
		logoUrl = '',
		eyebrow = 'Letter',
		letterNumber = null,
		readCta = 'Open Online',
		readUrl = '',
		accent = '#dd8f87',
		pageBg = '#f7f3f1',
		ink = '#160b0f',
		title = '',
		description = '',
		imageUrl = null,
		onTitle,
		onDescription,
		onImage
	} = $props();

	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	const letterPill = $derived.by(() => {
		const n = Number(letterNumber);
		if (!Number.isFinite(n) || n < 1) return '';
		return `${String(eyebrow || 'Letter').toUpperCase()} ${Math.floor(n)}`;
	});

	/**
	 * Resize/compress before upload — raw phone photos blow Axum's body limit
	 * and are useless as email data: URLs anyway.
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
		<span class="bar-slot start">
			{#if letterPill}
				<span class="stroke-pill letter-pill">{letterPill}</span>
			{/if}
		</span>
		<span class="bar-slot brand-slot">
			{#if logoUrl}
				<img class="brand-mark" src={logoUrl} alt="" width="16" height="18" />
			{/if}
			<span class="brand-name">{brand}</span>
		</span>
		<span class="bar-slot end">
			{#if readUrl}
				<a class="stroke-pill read-cta" href={readUrl} target="_blank" rel="noopener noreferrer">
					{readCta}
					<svg class="cta-arrow" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
						<path
							d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
			{:else}
				<span class="stroke-pill read-cta static">
					{readCta}
					<svg class="cta-arrow" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
						<path
							d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
			{/if}
		</span>
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
			<Camera size={32} />
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
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
	}

	.bar-slot {
		min-width: 0;
	}

	.bar-slot.start {
		justify-self: start;
	}

	.brand-slot {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		justify-self: center;
	}

	.bar-slot.end {
		display: flex;
		justify-content: flex-end;
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
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--mail-ink);
		white-space: nowrap;
	}

	.stroke-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 11px;
		border-radius: 999px;
		background: transparent;
		color: var(--mail-ink);
		font-family: Inter, Helvetica, Arial, sans-serif;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.2;
		text-decoration: none;
		white-space: nowrap;
		border: 1px solid color-mix(in srgb, var(--mail-ink) 22%, transparent);
		box-sizing: border-box;
	}

	.letter-pill {
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.read-cta.static {
		opacity: 0.92;
		pointer-events: none;
	}

	.cta-arrow {
		display: block;
		flex-shrink: 0;
	}

	.hero-frame {
		--hero-photo: none;
		position: relative;
		isolation: isolate;
		aspect-ratio: 1.618 / 1;
		width: 100%;
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
		color: color-mix(in srgb, var(--mail-ink) 38%, transparent);
		pointer-events: none;
	}

	.hero-frame.has-image .camera-affordance {
		color: color-mix(in srgb, #fff 55%, transparent);
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
