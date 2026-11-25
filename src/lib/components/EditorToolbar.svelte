<script>
	/**
	 * Compact editor tools for create sheets.
	 * Order: style (block) → lists → camera → code → attach.
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

	let styleOpen = $state(false);
	let listOpen = $state(false);
	/** @type {HTMLButtonElement | null} */
	let styleBtn = $state(null);
	/** @type {HTMLButtonElement | null} */
	let listBtn = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	function toggleStyle() {
		listOpen = false;
		styleOpen = !styleOpen;
	}

	function toggleList() {
		styleOpen = false;
		listOpen = !listOpen;
	}

	/** @param {() => void} run */
	function runStyle(run) {
		run();
		styleOpen = false;
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
		bind:this={styleBtn}
		type="button"
		class="tool wide"
		class:on={styleOpen}
		aria-label={t('fmt.styles')}
		aria-expanded={styleOpen}
		aria-haspopup="menu"
		disabled={!editor}
		onclick={toggleStyle}
	>
		<span class="style-mark">Aa</span>
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
		<svg class="code-chev" width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
			<path
				d="M5.5 1.75 1.25 7 5.5 12.25"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d="M12.5 1.75 16.75 7 12.5 12.25"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
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
	open={styleOpen}
	anchor={styleBtn}
	placement="above"
	width={260}
	onclose={() => (styleOpen = false)}
>
	<div class="dropdown-list style-menu" role="menu">
		<button
			type="button"
			class="dropdown-item style-opt"
			role="menuitem"
			onclick={() => runStyle(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
		>
			<span class="style-preview h1">{t('fmt.heading1')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item style-opt"
			role="menuitem"
			onclick={() => runStyle(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
		>
			<span class="style-preview h2">{t('fmt.heading2')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item style-opt"
			role="menuitem"
			onclick={() => runStyle(() => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
		>
			<span class="style-preview h3">{t('fmt.heading3')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item style-opt"
			role="menuitem"
			onclick={() => runStyle(() => editor?.chain().focus().setParagraph().run())}
		>
			<span class="style-preview p">{t('fmt.paragraph')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item style-opt"
			role="menuitem"
			onclick={() => runStyle(() => editor?.chain().focus().toggleBlockquote().run())}
		>
			<span class="style-preview quote">{t('fmt.quote')}</span>
		</button>
		<div class="style-sep" role="separator"></div>
		<button
			type="button"
			class="dropdown-item inline-opt"
			role="menuitem"
			onclick={() => runStyle(() => editor?.chain().focus().toggleBold().run())}
		>
			<span class="inline-mark bold">B</span>
			<span>{t('fmt.bold')}</span>
		</button>
		<button
			type="button"
			class="dropdown-item inline-opt"
			role="menuitem"
			onclick={() => runStyle(() => editor?.chain().focus().toggleItalic().run())}
		>
			<span class="inline-mark italic">I</span>
			<span>{t('fmt.italic')}</span>
		</button>
	</div>
</DropdownMenu>

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
			onclick={() => runList(() => editor?.chain().focus().toggleTaskList().run())}
		>
			<EditorGlyph name="checklist" size={16} />
			<span>{t('fmt.taskList')}</span>
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
		gap: 8px;
		padding: 0 8px 0 10px;
		min-width: 44px;
	}

	.tool:hover:not(:disabled),
	.tool.on {
		color: var(--fg);
		background: var(--float-trigger-on, var(--fg-8));
	}

	.tool:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.style-mark {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.8125rem;
		font-weight: 650;
		letter-spacing: -0.03em;
		line-height: 1;
	}

	.chev {
		opacity: 0.7;
		padding-top: 1px;
		box-sizing: content-box;
	}

	.code-chev {
		display: block;
	}

	.style-menu {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
	}

	.style-opt {
		justify-content: flex-start;
		min-height: 40px;
		padding: 8px 12px;
	}

	.style-preview {
		display: block;
		width: 100%;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		letter-spacing: -0.02em;
		line-height: 1.2;
		color: var(--fg);
		text-align: left;
	}

	.style-preview.h1 {
		font-size: 1.45rem;
		font-weight: 700;
	}

	.style-preview.h2 {
		font-size: 1.2rem;
		font-weight: 700;
	}

	.style-preview.h3 {
		font-size: 1.05rem;
		font-weight: 700;
	}

	.style-preview.p {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.style-preview.quote {
		font-size: 0.875rem;
		font-weight: 500;
		font-style: italic;
		color: var(--fg-66);
		border-left: 2px solid var(--fg-16, var(--fg-8));
		padding-left: 10px;
	}

	.style-sep {
		height: 1px;
		margin: 4px 8px;
		background: var(--fg-8);
	}

	.inline-opt {
		gap: 10px;
	}

	.inline-mark {
		width: 18px;
		text-align: center;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--fg);
	}

	.inline-mark.italic {
		font-style: italic;
		font-weight: 600;
	}
</style>
