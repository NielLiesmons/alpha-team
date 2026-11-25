<script>
	/**
	 * Shared rich text editor (notes, tasks, newsletters).
	 * Empty lines show “Type / for commands”; `/` opens a Linear-style slash menu.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Image from '@tiptap/extension-image';
	import Placeholder from '@tiptap/extension-placeholder';
	import TaskList from '@tiptap/extension-task-list';
	import TaskItem from '@tiptap/extension-task-item';
	import {
		clipboardHtmlIsRich,
		looksLikeMarkdown,
		markdownToHtml,
		noteLooksLikeHtml
	} from '$lib/note-text.js';

	/** @typedef {{ id: string, label: string, group?: string, run: (ed: Editor) => void }} SlashItem */

	/**
	 * @type {{
	 *   value?: string,
	 *   placeholder?: string,
	 *   editable?: boolean,
	 *   onChange?: (html: string) => void,
	 *   onReady?: (ed: Editor | null) => void
	 * }}
	 */
	let {
		value = '',
		placeholder = 'Type / for commands',
		editable = true,
		onChange = undefined,
		onReady = undefined
	} = $props();

	/** @type {HTMLDivElement | undefined} */
	let host = $state();
	/** @type {HTMLInputElement | undefined} */
	let mediaInput = $state();
	/** @type {Editor | null} */
	let editor = null;
	let applyingExternal = false;

	/** @type {{ open: boolean, top: number, left: number, query: string, from: number } | null} */
	let slash = $state(null);

	/** @param {string} raw */
	function toDoc(raw) {
		if (!raw) return '';
		if (noteLooksLikeHtml(raw)) return raw;
		if (looksLikeMarkdown(raw)) return markdownToHtml(raw);
		const escaped = raw
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		return escaped
			.split(/\n\n+/)
			.map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
			.join('');
	}

	/**
	 * Prefer Markdown when plain text looks like MD.
	 * Skip only for real rich HTML (Word/Docs) — not Chromium/WebKit wrappers.
	 * @param {DataTransfer | null} data
	 */
	function markdownFromClipboard(data) {
		if (!data) return null;
		const text = data.getData('text/plain');
		if (!text || !looksLikeMarkdown(text)) return null;
		const html = data.getData('text/html') || '';
		if (html && clipboardHtmlIsRich(html)) return null;
		return markdownToHtml(text);
	}

	/**
	 * Insert parsed MD HTML as block nodes (shared by page editor + create modal).
	 * @param {Editor} ed
	 * @param {string} html
	 */
	function insertMarkdownHtml(ed, html) {
		ed.chain()
			.focus()
			.insertContent(html, {
				parseOptions: { preserveWhitespace: false }
			})
			.run();
	}

	function closeSlash() {
		slash = null;
	}

	/** @param {Editor} ed */
	function syncSlash(ed) {
		const { from, empty } = ed.state.selection;
		if (!empty) {
			closeSlash();
			return;
		}
		const textBefore = ed.state.doc.textBetween(Math.max(0, from - 64), from, '\n', '\0');
		const m = textBefore.match(/(?:^|\n)\/([^\n]*)$/);
		if (!m) {
			closeSlash();
			return;
		}
		const query = m[1] ?? '';
		const start = from - query.length - 1;
		const coords = ed.view.coordsAtPos(start);
		const hostRect = host?.getBoundingClientRect();
		slash = {
			open: true,
			query,
			from: start,
			top: coords.bottom - (hostRect?.top ?? 0) + 6,
			left: Math.max(0, coords.left - (hostRect?.left ?? 0))
		};
	}

	/** @type {SlashItem[]} */
	const slashItems = [
		{
			id: 'h1',
			label: 'Heading 1',
			group: 'Turn into',
			run: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run()
		},
		{
			id: 'h2',
			label: 'Heading 2',
			group: 'Turn into',
			run: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run()
		},
		{
			id: 'h3',
			label: 'Heading 3',
			group: 'Turn into',
			run: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run()
		},
		{
			id: 'bullet',
			label: 'Bullet list',
			group: 'Lists',
			run: (ed) => ed.chain().focus().toggleBulletList().run()
		},
		{
			id: 'ordered',
			label: 'Numbered list',
			group: 'Lists',
			run: (ed) => ed.chain().focus().toggleOrderedList().run()
		},
		{
			id: 'task',
			label: 'Task list',
			group: 'Lists',
			run: (ed) => ed.chain().focus().toggleTaskList().run()
		},
		{
			id: 'quote',
			label: 'Block quote',
			group: 'Turn into',
			run: (ed) => ed.chain().focus().toggleBlockquote().run()
		},
		{
			id: 'code',
			label: 'Code block',
			group: 'Insert',
			run: (ed) => ed.chain().focus().toggleCodeBlock().run()
		},
		{
			id: 'media',
			label: 'Insert media',
			group: 'Insert',
			run: () => mediaInput?.click()
		},
		{
			id: 'attach',
			label: 'Attach files',
			group: 'Insert',
			run: () => mediaInput?.click()
		},
		{
			id: 'emoji',
			label: 'Emoji',
			group: 'Insert',
			run: (ed) => ed.chain().focus().insertContent('🙂').run()
		},
		{
			id: 'diagram',
			label: 'Diagram',
			group: 'Insert',
			run: (ed) =>
				ed.chain().focus().insertContent('<p><em>Diagram — coming soon</em></p>').run()
		},
		{
			id: 'latex',
			label: 'LaTeX math',
			group: 'Insert',
			run: (ed) => ed.chain().focus().insertContent('<p>$$ … $$</p>').run()
		}
	];

	const filteredSlash = $derived.by(() => {
		const q = (slash?.query || '').trim().toLowerCase();
		if (!q) return slashItems;
		return slashItems.filter((i) => i.label.toLowerCase().includes(q) || i.id.includes(q));
	});

	/** @param {SlashItem} item */
	function runSlash(item) {
		if (!editor) return;
		const from = slash?.from ?? editor.state.selection.from;
		const to = editor.state.selection.from;
		editor.chain().focus().deleteRange({ from, to }).run();
		closeSlash();
		item.run(editor);
	}

	/** @param {Event} e */
	function onMediaFile(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		if (!file || !editor) return;
		const reader = new FileReader();
		reader.onload = () => {
			const src = String(reader.result || '');
			if (!src) return;
			editor?.chain().focus().setImage({ src }).run();
		};
		reader.readAsDataURL(file);
		input.value = '';
	}

	onMount(() => {
		if (!host) return;
		editor = new Editor({
			element: host,
			editable,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] }
				}),
				TaskList,
				TaskItem.configure({
					nested: true
				}),
				Link.configure({
					openOnClick: true,
					autolink: true,
					linkOnPaste: true,
					HTMLAttributes: {
						rel: 'noopener noreferrer',
						target: '_blank'
					}
				}),
				Image.configure({
					allowBase64: true,
					HTMLAttributes: { class: 'editor-img' }
				}),
				Placeholder.configure({
					placeholder,
					showOnlyWhenEditable: true,
					showOnlyCurrent: true
				})
			],
			content: toDoc(value),
			editorProps: {
				attributes: {
					class: 'note-prose'
				},
				handlePaste(_view, event) {
					const mdHtml = markdownFromClipboard(event.clipboardData);
					if (!mdHtml || !editor || editor.isDestroyed) return false;
					event.preventDefault();
					insertMarkdownHtml(editor, mdHtml);
					return true;
				},
				handleDrop(_view, event) {
					const mdHtml = markdownFromClipboard(event.dataTransfer);
					if (!mdHtml || !editor || editor.isDestroyed) return false;
					event.preventDefault();
					insertMarkdownHtml(editor, mdHtml);
					return true;
				},
				handleKeyDown(_view, event) {
					if (!slash?.open) return false;
					if (event.key === 'Escape') {
						event.preventDefault();
						closeSlash();
						return true;
					}
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
						/* Enter handled by menu button focus; Esc closes */
						if (event.key === 'Enter' && filteredSlash[0]) {
							event.preventDefault();
							runSlash(filteredSlash[0]);
							return true;
						}
					}
					return false;
				}
			},
			onUpdate: ({ editor: ed }) => {
				if (applyingExternal) return;
				onChange?.(ed.getHTML());
				syncSlash(ed);
			},
			onSelectionUpdate: ({ editor: ed }) => {
				syncSlash(ed);
			}
		});
		onReady?.(editor);
	});

	$effect(() => {
		if (!editor || editor.isDestroyed) return;
		editor.setEditable(editable);
	});

	$effect(() => {
		const next = toDoc(value);
		if (!editor || editor.isDestroyed) return;
		if (editor.isFocused) return;
		if (editor.getHTML() === next) return;
		applyingExternal = true;
		editor.commands.setContent(next, { emitUpdate: false });
		applyingExternal = false;
	});

	onDestroy(() => {
		onReady?.(null);
		editor?.destroy();
		editor = null;
	});
</script>

<div class="note-editor" class:readonly={!editable}>
	<div class="host-wrap">
		<div class="host" bind:this={host}></div>
		{#if slash?.open && filteredSlash.length}
			<div
				class="slash-menu alpha-popover"
				style:top="{slash.top}px"
				style:left="{slash.left}px"
				role="listbox"
				aria-label="Commands"
			>
				{#each filteredSlash as item (item.id)}
					<button
						type="button"
						class="slash-item"
						role="option"
						onclick={() => runSlash(item)}
					>
						<span class="slash-label">{item.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
	<input bind:this={mediaInput} type="file" accept="image/*" hidden onchange={onMediaFile} />
</div>

<style>
	.note-editor {
		width: 100%;
		min-height: 8rem;
	}

	.note-editor.readonly {
		min-height: 0;
	}

	.host-wrap {
		position: relative;
		width: 100%;
		min-height: inherit;
	}

	.host {
		width: 100%;
		min-height: inherit;
	}

	.slash-menu {
		position: absolute;
		z-index: 20;
		min-width: 220px;
		max-height: 280px;
		overflow: auto;
		padding: 6px;
	}

	.slash-item {
		display: flex;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 550;
		text-align: left;
		cursor: pointer;
	}

	.slash-item:hover {
		background: var(--fg-4);
	}

	.note-editor :global(.tiptap),
	.note-editor :global(.ProseMirror) {
		outline: none;
		min-height: 8rem;
		padding: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--fg-83);
		caret-color: var(--fg);
		overflow-wrap: anywhere;
		word-break: break-word;
		white-space: pre-wrap;
	}

	.note-editor.readonly :global(.tiptap),
	.note-editor.readonly :global(.ProseMirror) {
		min-height: 0;
		padding: 0;
	}

	.note-editor :global(.ProseMirror p.is-empty::before),
	.note-editor :global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
		color: var(--fg-33);
	}

	.note-editor :global(.note-prose p) {
		margin: 0 0 0.65em;
	}

	.note-editor :global(.note-prose p:last-child) {
		margin-bottom: 0;
	}

	.note-editor :global(.note-prose h1),
	.note-editor :global(.note-prose h2),
	.note-editor :global(.note-prose h3) {
		margin: 0.85em 0 0.7em;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.25;
		color: var(--fg);
	}

	.note-editor :global(.note-prose > h1:first-child),
	.note-editor :global(.note-prose > h2:first-child),
	.note-editor :global(.note-prose > h3:first-child),
	.note-editor :global(.note-prose > p:first-child) {
		margin-top: 0;
	}

	.note-editor :global(.note-prose h1) {
		font-size: 1.45rem;
	}

	.note-editor :global(.note-prose h2) {
		font-size: 1.2rem;
	}

	.note-editor :global(.note-prose h3) {
		font-size: 1.05rem;
	}

	.note-editor :global(.note-prose ul),
	.note-editor :global(.note-prose ol) {
		margin: 0 0 0.65em;
		padding-left: 1.25rem;
	}

	.note-editor :global(.note-prose ul[data-type='taskList']) {
		list-style: none;
		padding-left: 0;
	}

	.note-editor :global(.note-prose ul[data-type='taskList'] li) {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.note-editor :global(.note-prose ul[data-type='taskList'] li > label) {
		display: inline-flex;
		margin-top: 0.2em;
		flex-shrink: 0;
	}

	.note-editor :global(.note-prose ul[data-type='taskList'] li > div) {
		flex: 1;
		min-width: 0;
	}

	.note-editor :global(.note-prose code) {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.92em;
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: var(--fg-8);
	}

	.note-editor :global(.note-prose pre) {
		margin: 0 0 0.65em;
		padding: 0.65rem 0.75rem;
		border-radius: 8px;
		background: var(--fg-8);
		overflow-x: auto;
	}

	.note-editor :global(.note-prose pre code) {
		padding: 0;
		background: transparent;
	}

	.note-editor :global(.note-prose blockquote) {
		margin: 0 0 0.65em;
		padding-left: 0.85rem;
		border-left: 2px solid var(--fg-16, var(--fg-8));
		color: var(--fg-66);
	}

	.note-editor :global(.note-prose a) {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-thickness: 1px;
		cursor: pointer;
	}

	.note-editor :global(.note-prose a:hover) {
		color: var(--link-hover);
	}

	.note-editor :global(.note-prose .editor-img) {
		display: block;
		max-width: 100%;
		border-radius: 12px;
		margin: 0.5em 0;
	}
</style>
