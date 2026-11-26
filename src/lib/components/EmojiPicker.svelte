<script>
	/**
	 * Emoji browser — pill search + one scroll of Recent / Custom / categories.
	 * Reused by chat reactions expand + enterprise icon picker.
	 * Custom “+ Upload” opens a Space emoji manage view (name before save).
	 */
	import ChatEmoji from './ChatEmoji.svelte';
	import Search from './icons/Search.svelte';
	import Trash from './icons/Trash.svelte';
	import {
		customEmojis,
		refreshCustomEmojis,
		removeCustomEmoji,
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
	let manageOpen = $state(false);
	let uploadName = $state('');
	/** @type {File | null} */
	let pendingFile = $state(null);
	/** @type {string | null} */
	let pendingPreview = $state(null);
	/** @type {string | null} */
	let deletingId = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let searchInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let nameInput = $state();

	const searching = $derived(query.trim().length > 0);
	const stockHits = $derived(searching ? searchEmojis(query, 120) : []);
	const customs = $derived.by(() => {
		customEmojis.length;
		const q = query.trim().toLowerCase().replace(/^:/, '').replace(/:$/, '');
		const list = [...customEmojis];
		if (!q || manageOpen) return list;
		return list.filter((e) => e.name.includes(q) || `:${e.name}:`.includes(q));
	});

	const nameOk = $derived(/^[a-z0-9_]{2,32}$/i.test(uploadName.trim().replace(/\s+/g, '_')));
	const canSave = $derived(Boolean(pendingFile) && nameOk && !uploading);

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
		if (!autofocus || manageOpen) return;
		queueMicrotask(() => searchInput?.focus());
	});

	$effect(() => {
		return () => {
			if (pendingPreview) URL.revokeObjectURL(pendingPreview);
		};
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

	function clearPending() {
		if (pendingPreview) URL.revokeObjectURL(pendingPreview);
		pendingPreview = null;
		pendingFile = null;
		uploadName = '';
	}

	function openManage() {
		uploadError = null;
		manageOpen = true;
		queueMicrotask(() => nameInput?.focus());
	}

	function closeManage() {
		manageOpen = false;
		uploadError = null;
		clearPending();
	}

	function openFilePicker() {
		uploadError = null;
		fileInput?.click();
	}

	/** @param {Event} e */
	function onFile(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (pendingPreview) URL.revokeObjectURL(pendingPreview);
		pendingFile = file;
		pendingPreview = URL.createObjectURL(file);
		/* Suggest from filename — user must still edit/confirm via Save. */
		if (!uploadName.trim()) {
			uploadName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 32);
		}
		uploadError = null;
		manageOpen = true;
		queueMicrotask(() => {
			nameInput?.focus();
			nameInput?.select();
		});
	}

	async function saveUpload() {
		if (!pendingFile || !canSave) return;
		uploading = true;
		uploadError = null;
		try {
			await uploadCustomEmoji(pendingFile, uploadName);
			clearPending();
			/* Stay in manage so more can be added; reaction pick stays on the browser grid. */
		} catch (err) {
			uploadError = err instanceof Error ? err.message : String(err);
		} finally {
			uploading = false;
		}
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async function onDelete(id, name) {
		const label = `:${name}:`;
		if (!confirm(t('common.deleteConfirm', { label }))) return;
		deletingId = id;
		uploadError = null;
		try {
			await removeCustomEmoji(id);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : String(err);
		} finally {
			deletingId = null;
		}
	}
</script>

<div class="picker">
	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/webp,image/gif,image/jpeg"
		class="file"
		onchange={onFile}
	/>

	{#if manageOpen && allowCustom && activeSession()}
		<div class="manage">
			<div class="manage-top">
				<button type="button" class="back-pill" onclick={closeManage}>
					{t('common.back')}
				</button>
				<p class="manage-title">{t('chat.customEmoji')}</p>
				<span class="manage-top-spacer" aria-hidden="true"></span>
			</div>

			{#if uploadError}
				<p class="err">{uploadError}</p>
			{/if}

			<div class="manage-scroll">
				{#if customs.length}
					<ul class="manage-list" aria-label={t('chat.customEmoji')}>
						{#each customs as em (em.id)}
							<li class="manage-row">
								<button
									type="button"
									class="manage-pick"
									title={`:${em.name}:`}
									onclick={() => pickCustom(em.name)}
								>
									<span class="manage-thumb">
										<ChatEmoji token={`:${em.name}:`} size={28} />
									</span>
									<span class="manage-name">:{em.name}:</span>
								</button>
								<button
									type="button"
									class="manage-del"
									aria-label={t('common.delete')}
									disabled={deletingId === em.id}
									onclick={() => onDelete(em.id, em.name)}
								>
									<Trash size={14} />
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="manage-empty">{t('chat.noCustomEmoji')}</p>
				{/if}
			</div>

			<div class="compose">
				{#if pendingFile && pendingPreview}
					<div class="compose-preview">
						<img src={pendingPreview} alt="" width="44" height="44" draggable="false" />
					</div>
					<input
						bind:this={nameInput}
						class="name"
						type="text"
						placeholder={t('chat.emojiNameHint')}
						bind:value={uploadName}
						aria-label={t('chat.customEmoji')}
						maxlength="32"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								void saveUpload();
							}
						}}
					/>
					<button type="button" class="save" disabled={!canSave} onclick={() => void saveUpload()}>
						{uploading ? t('common.uploading') : t('common.save')}
					</button>
					<button
						type="button"
						class="compose-cancel"
						disabled={uploading}
						onclick={clearPending}
						aria-label={t('common.cancel')}
					>
						{t('common.cancel')}
					</button>
				{:else}
					<button type="button" class="choose" disabled={uploading} onclick={openFilePicker}>
						+ {t('common.upload')}
					</button>
				{/if}
			</div>
		</div>
	{:else}
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
							class="upload-pill"
							aria-label={t('chat.uploadCustomEmoji')}
							onclick={openManage}
						>
							+ {t('common.upload')}
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
							<button type="button" class="cta" onclick={openManage}>
								+ {t('common.upload')}
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
	{/if}
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

	.upload-pill {
		flex-shrink: 0;
		height: 28px;
		margin: 0;
		padding: 0 12px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.12s ease;
	}

	.upload-pill:hover {
		color: var(--fg);
		transform: scale(1.04);
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

	/* —— Manage Space custom emoji —— */
	.manage {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		flex: 1;
		height: 100%;
	}

	.manage-top {
		flex-shrink: 0;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 8px;
		min-height: 32px;
	}

	.back-pill {
		height: 28px;
		padding: 0 12px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.12s ease;
	}

	.back-pill:hover {
		color: var(--fg);
		transform: scale(1.04);
	}

	.manage-title {
		margin: 0;
		text-align: center;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--fg);
		line-height: 1.2;
	}

	.manage-top-spacer {
		width: 56px;
	}

	.manage-scroll {
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.manage-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.manage-row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		padding: 0 2px 0 4px;
		border-radius: 12px;
		box-sizing: border-box;
	}

	.manage-row:hover {
		background: var(--fg-4);
	}

	.manage-pick {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		padding: 6px 4px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		cursor: pointer;
		text-align: left;
	}

	.manage-thumb {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
	}

	.manage-name {
		flex: 1;
		min-width: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.manage-del {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--accent-3, var(--destructive));
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.manage-del:hover {
		background: var(--fg-8);
	}

	.manage-del:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.manage-empty {
		margin: 28px 12px;
		text-align: center;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg-33);
	}

	.compose {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 4px;
		box-sizing: border-box;
	}

	.compose-preview {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: 10px;
		overflow: hidden;
		background: var(--fg-8);
		display: grid;
		place-items: center;
	}

	.compose-preview img {
		width: 44px;
		height: 44px;
		object-fit: cover;
		display: block;
	}

	.name {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0 12px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg);
		outline: none;
		box-sizing: border-box;
	}

	.name::placeholder {
		color: var(--fg-33);
	}

	.save {
		flex-shrink: 0;
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 650;
		cursor: pointer;
	}

	.save:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.compose-cancel {
		flex-shrink: 0;
		height: 36px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.choose {
		flex: 1;
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.12s ease;
	}

	.choose:hover {
		color: var(--fg);
		transform: scale(1.02);
	}

	.choose:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
</style>
