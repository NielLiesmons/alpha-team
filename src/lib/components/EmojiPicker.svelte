<script>
	/**
	 * Emoji browser — pill search + one scroll of Recent / Custom / categories.
	 * Reused by chat reactions expand + enterprise icon picker.
	 */
	import ChatEmoji from './ChatEmoji.svelte';
	import Search from './icons/Search.svelte';
	import {
		customEmojis,
		refreshCustomEmojis,
		uploadCustomEmoji
	} from '$lib/custom-emoji.svelte.js';
	import { customEmojiShortcode, isCustomEmojiToken } from '$lib/message-emoji.js';
	import { EMOJI_CATEGORIES, recentEmojis, rememberEmoji, searchEmojis } from '$lib/emoji.js';
	import { activeSession } from '$lib/drive/session.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   value?: string | null,
	 *   onselect: (emoji: string) => void,
	 *   onclear?: (() => void) | null,
	 *   allowCustom?: boolean,
	 *   autofocus?: boolean
	 * }}
	 */
	let {
		value = null,
		onselect,
		onclear = null,
		allowCustom = true,
		autofocus = false
	} = $props();

	let query = $state('');
	let uploadError = $state(/** @type {string | null} */ (null));
	let uploading = $state(false);
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let searchInput = $state();

	const searching = $derived(query.trim().length > 0);
	const stockHits = $derived(searching ? searchEmojis(query, 120) : []);
	const customs = $derived.by(() => {
		customEmojis.length;
		const q = query.trim().toLowerCase().replace(/^:/, '').replace(/:$/, '');
		const list = [...customEmojis];
		if (!q) return list;
		return list.filter((e) => e.name.includes(q) || `:${e.name}:`.includes(q));
	});

	/** Recent glyphs/shortcodes — max ~3 rows at 8 cols. */
	const recent = $derived.by(() => {
		recentEmojis();
		return recentEmojis().slice(0, 24);
	});

	const categoryLabel = {
		smileys: 'chat.emojiCatSmileys',
		people: 'chat.emojiCatPeople',
		nature: 'chat.emojiCatNature',
		food: 'chat.emojiCatFood',
		travel: 'chat.emojiCatTravel',
		activity: 'chat.emojiCatActivity',
		objects: 'chat.emojiCatObjects',
		symbols: 'chat.emojiCatSymbols',
		flags: 'chat.emojiCatFlags'
	};

	$effect(() => {
		if (activeSession()) void refreshCustomEmojis().catch(() => {});
	});

	$effect(() => {
		if (!autofocus) return;
		queueMicrotask(() => searchInput?.focus());
	});

	/** @param {string} glyph */
	function pick(glyph) {
		rememberEmoji(glyph);
		onselect(glyph);
	}

	/** @param {string} name */
	function pickCustom(name) {
		const code = customEmojiShortcode(name);
		if (!code) return;
		rememberEmoji(code);
		onselect(code);
	}

	function openUpload() {
		uploadError = null;
		fileInput?.click();
	}

	/** @param {Event} e */
	async function onFile(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const base = file.name.replace(/\.[^.]+$/, '');
		uploading = true;
		uploadError = null;
		try {
			const row = await uploadCustomEmoji(file, base);
			pickCustom(row.name);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : String(err);
		} finally {
			uploading = false;
		}
	}
</script>

<div class="picker">
	<div class="search-pill">
		<span class="search-ico" aria-hidden="true"><Search size={15} /></span>
		<input
			bind:this={searchInput}
			class="search"
			type="search"
			placeholder={t('chat.searchEmoji')}
			bind:value={query}
			aria-label={t('chat.searchEmoji')}
			autocomplete="off"
		/>
		{#if value && onclear}
			<button type="button" class="clear" onclick={onclear}>{t('chat.remove')}</button>
		{/if}
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/webp,image/gif,image/jpeg"
		class="file"
		onchange={onFile}
	/>

	{#if uploadError}
		<p class="err">{uploadError}</p>
	{/if}

	<div class="scroll">
		{#if searching}
			<p class="eyebrow">
				{t(stockHits.length + customs.length === 1 ? 'chat.emojiResult' : 'chat.emojiResults', {
					n: stockHits.length + customs.length
				})}
			</p>
			<div class="grid" role="listbox" aria-label={t('chat.searchEmoji')}>
				{#if allowCustom}
					{#each customs as em (em.id)}
						<button
							type="button"
							class="cell custom"
							class:on={value === `:${em.name}:`}
							role="option"
							aria-selected={value === `:${em.name}:`}
							title={`:${em.name}:`}
							onclick={() => pickCustom(em.name)}
						>
							<ChatEmoji token={`:${em.name}:`} size={28} />
						</button>
					{/each}
				{/if}
				{#each stockHits as item (item.g + (item.n ?? ''))}
					<button
						type="button"
						class="cell"
						class:on={value === item.g}
						role="option"
						aria-selected={value === item.g}
						title={item.n}
						onclick={() => pick(item.g)}
					>
						{item.g}
					</button>
				{/each}
				{#if stockHits.length === 0 && customs.length === 0}
					<p class="empty">{t('chat.noMatches')}</p>
				{/if}
			</div>
		{:else}
			{#if recent.length}
				<p class="eyebrow">{t('chat.recentlyUsed')}</p>
				<div class="grid" role="listbox" aria-label={t('chat.recentlyUsed')}>
					{#each recent as token (token)}
						<button
							type="button"
							class="cell"
							class:on={value === token}
							role="option"
							aria-selected={value === token}
							onclick={() => pick(token)}
						>
							{#if isCustomEmojiToken(token)}
								<ChatEmoji {token} size={28} />
							{:else}
								{token}
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			{#if allowCustom && activeSession()}
				<div class="eyebrow-row">
					<p class="eyebrow">{t('chat.customEmoji')}</p>
					<button
						type="button"
						class="eyebrow-plus"
						aria-label={t('chat.uploadCustomEmoji')}
						disabled={uploading}
						onclick={openUpload}
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M8 3.25v9.5M3.25 8h9.5"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</button>
				</div>
				{#if customs.length}
					<div class="grid" role="listbox" aria-label={t('chat.customEmoji')}>
						{#each customs as em (em.id)}
							<button
								type="button"
								class="cell custom"
								class:on={value === `:${em.name}:`}
								role="option"
								aria-selected={value === `:${em.name}:`}
								title={`:${em.name}:`}
								onclick={() => pickCustom(em.name)}
							>
								<ChatEmoji token={`:${em.name}:`} size={28} />
							</button>
						{/each}
					</div>
				{:else}
					<div class="custom-empty">
						<p class="custom-empty-copy">{t('chat.noCustomEmoji')}</p>
						<button type="button" class="cta" disabled={uploading} onclick={openUpload}>
							{uploading ? t('common.uploading') : t('chat.uploadCustomEmoji')}
						</button>
					</div>
				{/if}
			{/if}

			{#each EMOJI_CATEGORIES as cat (cat.id)}
				{@const catKey = categoryLabel[cat.id]}
				<p class="eyebrow">{catKey ? t(catKey) : cat.label}</p>
				<div class="grid" role="listbox" aria-label={catKey ? t(catKey) : cat.label}>
					{#each cat.items as item (item.g + (item.n ?? ''))}
						<button
							type="button"
							class="cell"
							class:on={value === item.g}
							role="option"
							aria-selected={value === item.g}
							title={item.n}
							onclick={() => pick(item.g)}
						>
							{item.g}
						</button>
					{/each}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		flex: 1;
		height: 100%;
		padding: 10px 10px 8px;
		box-sizing: border-box;
	}

	.search-pill {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 0 12px;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		box-sizing: border-box;
	}

	.search-pill:focus-within {
		color: var(--fg);
	}

	.search-ico {
		flex-shrink: 0;
		display: grid;
		place-items: center;
	}

	.search {
		flex: 1;
		min-width: 0;
		height: 34px;
		border: 0;
		padding: 0;
		background: transparent;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--fg);
		outline: none;
		box-sizing: border-box;
	}

	.search::placeholder {
		color: var(--fg-33);
		font-weight: 500;
	}

	.clear {
		flex-shrink: 0;
		height: 28px;
		padding: 0 8px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--destructive);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.file {
		display: none;
	}

	.err {
		margin: 0;
		font-size: 0.75rem;
		color: var(--accent-3, #b44);
		flex-shrink: 0;
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-bottom: 4px;
	}

	.eyebrow-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 22px;
		flex-shrink: 0;
	}

	.eyebrow-row .eyebrow {
		flex: 1;
		min-width: 0;
	}

	.eyebrow {
		margin: 4px 2px 0;
		padding: 0;
		font-size: 0.625rem;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-33);
		flex-shrink: 0;
	}

	.eyebrow-plus {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--fg-8);
		color: var(--fg-66);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.eyebrow-plus:hover {
		color: var(--fg);
	}

	.eyebrow-plus:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 2px;
		flex-shrink: 0;
		content-visibility: auto;
		contain-intrinsic-size: auto 120px;
	}

	.cell {
		aspect-ratio: 1;
		border: 0;
		border-radius: 8px;
		background: transparent;
		font-size: 1.375rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		display: grid;
		place-items: center;
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
	}

	.cell:hover,
	.cell.on {
		background: var(--fg-8);
	}

	.custom-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 18px 14px;
		border-radius: 14px;
		background: var(--fg-4);
		box-sizing: border-box;
	}

	.custom-empty-copy {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg-33);
		text-align: center;
	}

	.cta {
		height: 34px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 650;
		cursor: pointer;
	}

	.cta:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.empty {
		grid-column: 1 / -1;
		margin: 20px 0;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--fg-33);
	}
</style>
