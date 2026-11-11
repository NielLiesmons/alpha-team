<script>
	/**
	 * Compact editor tools for create sheets / mobile — square tools + wide
	 * dropdown triggers (icon + chevron) for headings / lists.
	 * Glyphs: alpha-ui camera + ue* formatting icons.
	 */
	import Camera from './icons/Camera.svelte';
	import EditorGlyph from './icons/EditorGlyph.svelte';
	import { t } from '$lib/i18n.svelte.js';
	/** @type {{
	 *   editor?: import('@tiptap/core').Editor | null,
	 *   onMedia?: () => void
	 * }} */
	let { editor = null, onMedia } = $props();

	/** @type {'heading' | 'list' | null} */
	let menu = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	/** @param {'heading' | 'list'} which */
	function toggleMenu(which) {
		menu = menu === which ? null : which;
	}

	/** @param {() => void} run */
	function act(run) {
		menu = null;
		run();
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
	<div class="tool-wrap">
		<button
			type="button"
			class="tool wide"
			class:on={menu === 'heading'}
			aria-label={t('fmt.headings')}
			aria-expanded={menu === 'heading'}
			disabled={!editor}
			onclick={() => toggleMenu('heading')}
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
		{#if menu === 'heading'}
			<div class="menu" role="menu">
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
					>{t('fmt.heading1')}</button
				>
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
					>{t('fmt.heading2')}</button
				>
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
					>{t('fmt.heading3')}</button
				>
			</div>
		{/if}
	</div>

	<div class="tool-wrap">
		<button
			type="button"
			class="tool wide"
			class:on={menu === 'list'}
			aria-label={t('fmt.lists')}
			aria-expanded={menu === 'list'}
			disabled={!editor}
			onclick={() => toggleMenu('list')}
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
		{#if menu === 'list'}
			<div class="menu" role="menu">
				<button type="button" class="menu-item" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleBulletList().run())}>
					<EditorGlyph name="list" size={16} />
					<span>{t('fmt.bulletList')}</span>
				</button>
				<button type="button" class="menu-item" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleOrderedList().run())}>
					<EditorGlyph name="numbered" size={16} />
					<span>{t('fmt.numberedList')}</span>
				</button>
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleBlockquote().run())}
					>{t('fmt.quote')}</button
				>
			</div>
		{/if}
	</div>

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

<style>
	.tools {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.tool-wrap {
		position: relative;
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
		background: var(--fg-4);
		color: var(--fg-66);
		cursor: pointer;
	}

	.tool.wide {
		padding: 0 8px 0 10px;
		border-radius: 10px;
		min-width: 44px;
	}

	.tool:hover:not(:disabled),
	.tool.on {
		color: var(--fg);
		background: var(--fg-8);
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

	.menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		z-index: 30;
		min-width: 160px;
		padding: 6px;
		border-radius: 12px;
		border: 1px solid var(--glass-border);
		background: var(--popover);
		box-shadow: 0 10px 28px var(--shadow, rgba(0, 0, 0, 0.2));
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.menu button {
		border: 0;
		border-radius: 8px;
		background: transparent;
		padding: 8px 10px;
		text-align: left;
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		color: var(--fg);
		cursor: pointer;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.menu button:hover {
		background: var(--fg-4);
	}
</style>
