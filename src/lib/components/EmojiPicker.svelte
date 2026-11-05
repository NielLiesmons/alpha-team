<script>
	/**
	 * Compact emoji panel — recent defaults + Space custom emoji + upload.
	 */
	import {
		customEmojis,
		customEmojiUrl,
		refreshCustomEmojis,
		uploadCustomEmoji
	} from '$lib/custom-emoji.svelte.js';
	import { customEmojiShortcode } from '$lib/message-emoji.js';
	import { defaultEmojiPanel, rememberEmoji, searchEmojis } from '$lib/emoji.js';
	import { activeSession } from '$lib/drive/session.svelte.js';

	/**
	 * @type {{
	 *   value?: string | null,
	 *   onselect: (emoji: string) => void,
	 *   onclear?: (() => void) | null,
	 *   allowCustom?: boolean
	 * }}
	 */
	let { value = null, onselect, onclear = null, allowCustom = true } = $props();

	let query = $state('');
	let uploadName = $state('');
	let uploadError = $state(/** @type {string | null} */ (null));
	let uploading = $state(false);
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	const searching = $derived(query.trim().length > 0);
	const stock = $derived(searching ? searchEmojis(query, 96) : defaultEmojiPanel(64));
	const customs = $derived.by(() => {
		customEmojis.length;
		const q = query.trim().toLowerCase();
		const list = [...customEmojis];
		if (!q) return list;
		return list.filter((e) => e.name.includes(q) || `:${e.name}:`.includes(q));
	});

	$effect(() => {
		if (activeSession()) void refreshCustomEmojis().catch(() => {});
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
		const base = uploadName.trim() || file.name.replace(/\.[^.]+$/, '');
		uploading = true;
		uploadError = null;
		try {
			const row = await uploadCustomEmoji(file, base);
			uploadName = '';
			pickCustom(row.name);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : String(err);
		} finally {
			uploading = false;
		}
	}
</script>

<div class="picker">
	<div class="search-row">
		<input
			class="search"
			type="search"
			placeholder="Search emoji…"
			bind:value={query}
			aria-label="Search emoji"
		/>
		{#if value && onclear}
			<button type="button" class="clear" onclick={onclear}>Remove</button>
		{/if}
	</div>

	{#if allowCustom && activeSession()}
		<div class="custom-bar">
			<input
				class="name"
				type="text"
				placeholder="name (for :name:)"
				bind:value={uploadName}
				aria-label="Custom emoji name"
				maxlength="32"
			/>
			<button type="button" class="upload" disabled={uploading} onclick={openUpload}>
				{uploading ? '…' : 'Upload'}
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/png,image/webp,image/gif,image/jpeg"
				class="file"
				onchange={onFile}
			/>
		</div>
		{#if uploadError}
			<p class="err">{uploadError}</p>
		{/if}
	{/if}

	{#if allowCustom && customs.length}
		<p class="hint">Space</p>
		<div class="grid custom-grid" role="listbox" aria-label="Custom emoji">
			{#each customs as em (em.id)}
				{@const src = customEmojiUrl(em.name)}
				<button
					type="button"
					class="cell custom"
					class:on={value === `:${em.name}:`}
					role="option"
					aria-selected={value === `:${em.name}:`}
					title={`:${em.name}:`}
					onclick={() => pickCustom(em.name)}
				>
					{#if src}
						<img src={src} alt={`:${em.name}:`} width="28" height="28" draggable="false" />
					{:else}
						<span class="ph">:{em.name}:</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<p class="hint">{searching ? `${stock.length} result${stock.length === 1 ? '' : 's'}` : 'Recently used'}</p>
	<div class="grid" role="listbox">
		{#each stock as item (item.g + (item.n ?? ''))}
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
		{#if stock.length === 0 && customs.length === 0}
			<p class="empty">No matches</p>
		{/if}
	</div>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
		flex: 1;
		padding: 10px 10px 8px;
		box-sizing: border-box;
	}

	.search-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.search {
		flex: 1;
		min-width: 0;
		height: 34px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-8);
		font: inherit;
		font-size: 14px;
		color: var(--fg);
		outline: none;
		box-sizing: border-box;
	}

	.search::placeholder {
		color: var(--fg-33);
	}

	.clear {
		flex-shrink: 0;
		height: 34px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--destructive);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.custom-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.name {
		flex: 1;
		min-width: 0;
		height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		font: inherit;
		font-size: 13px;
		color: var(--fg);
		outline: none;
		box-sizing: border-box;
	}

	.upload {
		flex-shrink: 0;
		height: 32px;
		padding: 0 12px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
	}

	.upload:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.file {
		display: none;
	}

	.err {
		margin: 0;
		font-size: 12px;
		color: #b44;
	}

	.hint {
		margin: 0;
		padding: 0 2px;
		font-size: 10px;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-33);
		flex-shrink: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 2px;
		flex: 1;
		min-height: 0;
		max-height: 280px;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 2px;
	}

	.custom-grid {
		max-height: 120px;
		flex: 0 0 auto;
	}

	.cell {
		aspect-ratio: 1;
		border: 0;
		border-radius: 8px;
		background: transparent;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		display: grid;
		place-items: center;
	}

	.cell.custom img {
		display: block;
		width: 28px;
		height: 28px;
		object-fit: contain;
	}

	.cell .ph {
		font-size: 9px;
		font-weight: 600;
		color: var(--fg-33);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cell:hover,
	.cell.on {
		background: var(--fg-8);
	}

	.empty {
		grid-column: 1 / -1;
		margin: 20px 0;
		text-align: center;
		font-size: 13px;
		color: var(--fg-33);
	}
</style>
