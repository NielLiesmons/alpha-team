<script>
	/**
	 * Compact editor tools for create sheets — square tools with FloatPanel
	 * menus for headings / lists (same surface as the project selector).
	 * Glyphs: alpha-ui camera + ue* formatting icons.
	 */
	import DropdownMenu from './DropdownMenu.svelte';
	import Camera from './icons/Camera.svelte';
	import EditorGlyph from './icons/EditorGlyph.svelte';
	import { t } from '$lib/i18n.svelte.js';
	/** @type {{
	 *   editor?: import('@tiptap/core').Editor | null,
	 *   onMedia?: () => void
	 * }} */
	let { editor = null, onMedia } = $props();

	let headingOpen = $state(false);
	let listOpen = $state(false);
	/** @type {HTMLButtonElement | null} */
	let headingBtn = $state(null);
	/** @type {HTMLButtonElement | null} */
	let listBtn = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	const headingItems = $derived.by(() => {
		void editor;
		return [
			{
				id: 'h1',
				label: t('fmt.heading1'),
				onclick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run()
			},
			{
				id: 'h2',
				label: t('fmt.heading2'),
				onclick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run()
			},
			{
				id: 'h3',
				label: t('fmt.heading3'),
				onclick: () => editor?.chain().focus().toggleHeading({ level: 3 }).run()
			}
		];
	});

	function toggleHeading() {
		listOpen = false;
		headingOpen = !headingOpen;
	}

	function toggleList() {
		headingOpen = false;
		listOpen = !listOpen;
	}

	/** @param {() => void} run */
	function runList(run) {
		run();
		listOpen = false;
	}

	/** @param {Event} e */
	function onFile(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		if (!file || !editor) return;
		const reader = new FileReader();
		reader.onload = () => {
			const src = String(reader.result || '');
			if (src) editor?.chain().focus().setImage({ src }).run();
		};
		reader.readAsDataURL(file);
		input.value = '';
		onMedia?.();
	}
</script>

<div class="tools" role="toolbar" aria-label={t('fmt.formatting')}>
	<button
		bind:this={headingBtn}
		type="button"
		class="tool wide"
		class:on={headingOpen}
		aria-label={t('fmt.headings')}
		aria-expanded={headingOpen}
		aria-haspopup="menu"
		disabled={!editor}
		onclick={toggleHeading}
	>
		<span class="h-mark">H</span>
		<svg class="chev" width="10" height="6" viewBox="0 0 14 8" fill="none" aria-hidden="true">
			<path
				d="M12.7 0.7 6.71 6.69 0.7 0.7"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	<button
		bind:this={listBtn}
		type="button"
		class="tool wide"
		class:on={listOpen}
		aria-label={t('fmt.lists')}
		aria-expanded={listOpen}
		aria-haspopup="menu"
		disabled={!editor}
		onclick={toggleList}
	>
		<EditorGlyph name="list" size={16} />
		<svg class="chev" width="10" height="6" viewBox="0 0 14 8" fill="none" aria-hidden="true">
			<path
				d="M12.7 0.7 6.71 6.69 0.7 0.7"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	<button
		type="button"
		class="tool"
		aria-label={t('fmt.insertMedia')}
		disabled={!editor}
		onclick={() => fileInput?.click()}
	>
		<Camera size={18} />
	</button>

	<button
		type="button"
		class="tool"
		aria-label={t('fmt.codeBlock')}
		disabled={!editor}
		onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
	>
		<EditorGlyph name="code" size={16} />
	</button>

	<button
		type="button"
		class="tool"
		aria-label={t('fmt.attach')}
		disabled={!editor}
		onclick={() => fileInput?.click()}
	>
		<EditorGlyph name="attach" size={15} />
	</button>

	<input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</div>

<DropdownMenu
	open={headingOpen}
	anchor={headingBtn}
	placement="above"
	width={200}
	onclose={() => (headingOpen = false)}
	items={headingItems}
/>

<DropdownMenu
	open={listOpen}
	anchor={listBtn}
	placement="above"
	width={220}
	onclose={() => (listOpen = false)}
>
	<div class="dropdown-list" role="menu">
		<button
			type="button"
			class="dropdown-item"
			role="menuitem"
			onclick={() => runList(() => editor?.chain().focus().toggleBulletList().run())}
		>
			<EditorGlyph name="list" size={16} />
			<span>{t('fmt.bulletList')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item"
			role="menuitem"
			onclick={() => runList(() => editor?.chain().focus().toggleOrderedList().run())}
		>
			<EditorGlyph name="numbered" size={16} />
			<span>{t('fmt.numberedList')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item"
			role="menuitem"
			onclick={() => runList(() => editor?.chain().focus().toggleBlockquote().run())}
		>
			{t('fmt.quote')}
		</button>
	</div>
</DropdownMenu>

<style>
	.tools {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		min-width: 0;
		flex-wrap: wrap;
	}

	.tool {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		height: 32px;
		min-width: 32px;
		padding: 0 8px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-8);
		color: var(--fg-66);
		cursor: pointer;
	}

	.tool.wide {
		padding: 0 8px 0 10px;
		min-width: 44px;
	}

	.tool:hover:not(:disabled),
	.tool.on {
		color: var(--fg);
		background: var(--float-trigger-on);
	}

	.tool:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.h-mark {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 650;
		letter-spacing: -0.04em;
		line-height: 1;
	}

	.chev {
		opacity: 0.7;
	}
</style>
