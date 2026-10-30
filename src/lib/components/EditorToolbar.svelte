<script>
	/**
	 * Compact editor tools for create sheets / mobile — square tools + wide
	 * dropdown triggers (icon + chevron) for headings / lists.
	 */
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

<div class="tools" role="toolbar" aria-label="Formatting">
	<div class="tool-wrap">
		<button
			type="button"
			class="tool wide"
			class:on={menu === 'heading'}
			aria-label="Headings"
			aria-expanded={menu === 'heading'}
			disabled={!editor}
			onclick={() => toggleMenu('heading')}
		>
			<svg width="16" height="12" viewBox="0 0 27 16" fill="none" aria-hidden="true">
				<path
					fill="currentColor"
					d="M2.98735 15.5364C2.94225 15.6708 2.81629 15.7614 2.67447 15.7614H0.330273C0.102699 15.7614 -0.0565715 15.5365 0.0189999 15.3218L5.33547 0.220417C5.38196 0.0883514 5.50673 0 5.64674 0H8.70427C8.84423 0 8.96896 0.0882853 9.0155 0.220281L14.3393 15.3217C14.415 15.5364 14.2557 15.7614 14.0281 15.7614H11.684C11.5422 15.7614 11.4163 15.6709 11.3712 15.5365L7.25662 3.29067C7.24491 3.25581 7.21224 3.23232 7.17547 3.23232C7.13868 3.23232 7.106 3.25583 7.0943 3.29071L2.98735 15.5364Z"
				/>
			</svg>
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
					>Heading 1</button
				>
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
					>Heading 2</button
				>
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
					>Heading 3</button
				>
			</div>
		{/if}
	</div>

	<div class="tool-wrap">
		<button
			type="button"
			class="tool wide"
			class:on={menu === 'list'}
			aria-label="Lists"
			aria-expanded={menu === 'list'}
			disabled={!editor}
			onclick={() => toggleMenu('list')}
		>
			<svg width="14" height="13" viewBox="0 0 20 18" fill="none" aria-hidden="true">
				<path
					fill="currentColor"
					d="M10 3c0-.55.45-1 1-1h8a1 1 0 1 1 0 2h-8a1 1 0 0 1-1-1Zm0 12c0-.55.45-1 1-1h8a1 1 0 1 1 0 2h-8a1 1 0 0 1-1-1ZM6 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
				/>
			</svg>
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
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleBulletList().run())}
					>Bullet list</button
				>
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleOrderedList().run())}
					>Numbered list</button
				>
				<button type="button" role="menuitem" onclick={() => act(() => editor?.chain().focus().toggleBlockquote().run())}
					>Quote</button
				>
			</div>
		{/if}
	</div>

	<button
		type="button"
		class="tool"
		aria-label="Insert media"
		disabled={!editor}
		onclick={() => fileInput?.click()}
	>
		<svg width="16" height="13" viewBox="0 0 23 18" fill="none" aria-hidden="true">
			<path
				fill="currentColor"
				d="M0 4.5C0 3.26 1.01 2.25 2.25 2.25h2.55c.53 0 1.04-.21 1.41-.59l1.08-1.08c.37-.37.88-.58 1.41-.58h5.09c.53 0 1.04.21 1.41.58l1.08 1.08c.37.38.88.59 1.41.59H20.25c1.24 0 2.25 1.01 2.25 2.25V15.75c0 1.24-1.01 2.25-2.25 2.25H2.25A2.25 2.25 0 0 1 0 15.75V4.5Zm11.25 11.25a5.63 5.63 0 1 0 0-11.25 5.63 5.63 0 0 0 0 11.25Z"
			/>
		</svg>
	</button>

	<button
		type="button"
		class="tool"
		aria-label="Code block"
		disabled={!editor}
		onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
	>
		<svg width="15" height="12" viewBox="0 0 18 14" fill="none" aria-hidden="true">
			<path
				d="M5.5 2.5 1.5 7l4 4.5M12.5 2.5l4 4.5-4 4.5M10 1.5 8 12.5"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	<button
		type="button"
		class="tool"
		aria-label="Attach"
		disabled={!editor}
		onclick={() => fileInput?.click()}
	>
		<svg width="14" height="15" viewBox="0 0 20 21" fill="none" aria-hidden="true">
			<path
				d="M18.7 9.16 9.67 18.17a5.66 5.66 0 0 1-8 0 5.66 5.66 0 0 1 0-8l9.02-9.01a4.24 4.24 0 0 1 6 6L9.55 15.34a2.12 2.12 0 1 1-3-3l7.6-7.6"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
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

	.menu button:hover {
		background: var(--fg-4);
	}
</style>
