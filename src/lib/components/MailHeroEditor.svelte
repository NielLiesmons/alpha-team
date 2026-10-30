<script>
	/**
	 * Mail hero compose preview — φ landscape frame, glass top bar
	 * (logo+name · LETTER · outline Open Online), Ovo title.
	 * Matches alpha-api `render_letter_html` branding defaults (Bley).
	 */
	import Camera from './icons/Camera.svelte';

	/** @type {{
	 *   brand?: string,
	 *   logoUrl?: string,
	 *   eyebrow?: string,
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
		brand = 'Bley',
		logoUrl = 'https://bley.farm/icons/bley-logo-ink.svg',
		eyebrow = 'Lettre',
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
	<div
		class="frame"
		class:has-image={Boolean(imageUrl)}
		style:--hero-photo={imageUrl ? `url(${imageUrl})` : 'none'}
	>
		<div class="scrim" aria-hidden="true"></div>

		<div class="top-bar" role="presentation">
			<span class="bar-slot brand-slot">
				{#if logoUrl}
					<img class="brand-mark" src={logoUrl} alt="" width="16" height="18" />
				{/if}
				<span class="brand-name">{brand}</span>
			</span>
			<span class="eyebrow">{eyebrow}</span>
			<span class="bar-slot end">
				{#if readUrl}
					<a class="read-cta" href={readUrl} target="_blank" rel="noopener noreferrer">
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
					<span class="read-cta static">
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

		<button type="button" class="image-hit" onclick={pickImage} aria-label={imageUrl ? 'Change image' : 'Add image'}>
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
	</div>
</section>

<style>
	.mail-hero {
		padding: 0;
		/* Bley defaults when props omit branding */
		--mail-accent: #dd8f87;
		--mail-page-bg: #f7f3f1;
		--mail-ink: #160b0f;
		/* Concentric: outer 24 − bar inset 12 → inner 12 */
		--hero-r: 24px;
		--bar-inset: 12px;
		--bar-r: calc(var(--hero-r) - var(--bar-inset));
	}

	.frame {
		--hero-photo: none;
		position: relative;
		isolation: isolate;
		/* φ landscape: width / height ≈ 1.618 → aspect-ratio 1.618 / 1 */
		aspect-ratio: 1.618 / 1;
		width: 100%;
		border-radius: var(--hero-r);
		overflow: hidden;
		background: color-mix(in srgb, var(--mail-ink) 88%, transparent);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		box-sizing: border-box;
	}

	.frame::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 0;
		background-image: var(--hero-photo);
		background-size: cover;
		background-position: center;
		/* Slightly dimmed while editing so the camera reads as an affordance */
		opacity: 0.78;
		pointer-events: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.72) 0%,
			rgba(0, 0, 0, 0.28) 45%,
			rgba(0, 0, 0, 0.18) 100%
		);
	}

	.top-bar {
		position: relative;
		z-index: 2;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
		margin: var(--bar-inset) var(--bar-inset) 0;
		padding: 5px 8px;
		border-radius: var(--bar-r);
		/* Fake glass — email can't use backdrop-filter; match with rgba + border */
		background: color-mix(in srgb, var(--mail-page-bg) 78%, transparent);
		border: 1px solid color-mix(in srgb, var(--mail-ink) 12%, transparent);
		box-sizing: border-box;
	}

	.bar-slot {
		min-width: 0;
	}

	.brand-slot {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		justify-self: start;
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

	.bar-slot.end {
		display: flex;
		justify-content: flex-end;
	}

	.eyebrow {
		justify-self: center;
		font-family: Inter, Helvetica, Arial, sans-serif;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--mail-ink);
		white-space: nowrap;
	}

	.read-cta {
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
	}

	.read-cta.static {
		opacity: 0.92;
		pointer-events: none;
	}

	.cta-arrow {
		display: block;
		flex-shrink: 0;
	}

	.image-hit {
		/* Photo band only — leave glass bar + title/desc interactive above */
		position: absolute;
		left: 0;
		right: 0;
		top: calc(var(--bar-inset) + 44px);
		bottom: 68px;
		z-index: 1;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
		display: grid;
		place-items: center;
		-webkit-tap-highlight-color: transparent;
	}

	.camera-affordance {
		display: grid;
		place-items: center;
		color: color-mix(in srgb, var(--mail-ink) 38%, transparent);
		pointer-events: none;
		filter: drop-shadow(0 1px 6px rgba(0, 0, 0, 0.25));
	}

	.frame.has-image .camera-affordance {
		color: color-mix(in srgb, #fff 42%, transparent);
	}

	.copy {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 4px;
		/* Match bar inset — no extra dead space under title+desc */
		padding: 16px var(--bar-inset) var(--bar-inset);
		margin-top: auto;
	}

	.hero-title,
	.hero-desc {
		width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: #fff;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
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
		color: rgba(255, 255, 255, 0.55);
	}

	.hero-desc {
		resize: none;
		min-height: 1.4em;
		field-sizing: content;
		font-family: Inter, Helvetica, Arial, sans-serif;
		font-size: 14px;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.88);
	}
</style>
