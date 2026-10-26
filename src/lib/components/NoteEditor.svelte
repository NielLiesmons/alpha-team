<script>
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';
	import { looksLikeMarkdown, markdownToHtml, noteLooksLikeHtml } from '$lib/note-text.js';

	/**
	 * WYSIWYG note body — type or paste Markdown (##, **, lists, …).
	 * @type {{
	 *   value?: string,
	 *   placeholder?: string,
	 *   editable?: boolean,
	 *   onChange?: (html: string) => void
	 * }}
	 */
	let {
		value = '',
		placeholder = 'Start writing…',
		editable = true,
		onChange = undefined
	} = $props();

	/** @type {HTMLDivElement | undefined} */
	let host = $state();
	/** @type {Editor | null} */
	let editor = null;
	/** Skip echoing our own updates back into setContent */
	let applyingExternal = false;

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
	 * Prefer Markdown when clipboard is plain / trivial HTML wrappers.
	 * @param {DataTransfer | null} data
	 */
	function markdownFromClipboard(data) {
		if (!data) return null;
		const text = data.getData('text/plain');
		if (!text || !looksLikeMarkdown(text)) return null;
		const html = data.getData('text/html') || '';
		/* Rich paste from Word/Docs — keep browser HTML */
		if (html && /<(h[1-6]|ul|ol|li|strong|em|b|i)\b/i.test(html)) return null;
		return markdownToHtml(text);
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
				Link.configure({
					openOnClick: true,
					autolink: true,
					linkOnPaste: true,
					HTMLAttributes: {
						rel: 'noopener noreferrer',
						target: '_blank'
					}
				}),
				Placeholder.configure({ placeholder })
			],
			content: toDoc(value),
			editorProps: {
				attributes: {
					class: 'note-prose'
				},
				handlePaste(_view, event) {
					const mdHtml = markdownFromClipboard(event.clipboardData);
					if (!mdHtml || !editor) return false;
					event.preventDefault();
					editor.chain().focus().insertContent(mdHtml).run();
					return true;
				},
				handleDrop(_view, event) {
					const mdHtml = markdownFromClipboard(event.dataTransfer);
					if (!mdHtml || !editor) return false;
					event.preventDefault();
					editor.chain().focus().insertContent(mdHtml).run();
					return true;
				}
			},
			onUpdate: ({ editor: ed }) => {
				if (applyingExternal) return;
				onChange?.(ed.getHTML());
			}
		});
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
		editor?.destroy();
		editor = null;
	});
</script>

<div class="note-editor" class:readonly={!editable}>
	<div class="host" bind:this={host}></div>
</div>

<style>
	.note-editor {
		width: 100%;
		min-height: 8rem;
	}

	.note-editor.readonly {
		min-height: 0;
	}

	.host {
		width: 100%;
		min-height: inherit;
	}

	.note-editor :global(.tiptap),
	.note-editor :global(.ProseMirror) {
		outline: none;
		min-height: 8rem;
		padding: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		line-height: 1.55;
		color: var(--fg-66);
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

	.note-editor :global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
		color: var(--white33);
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
		margin: 0.85em 0 0.35em;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.25;
		color: var(--white);
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

	.note-editor :global(.note-prose code) {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.92em;
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: var(--white8);
	}

	.note-editor :global(.note-prose pre) {
		margin: 0 0 0.65em;
		padding: 0.65rem 0.75rem;
		border-radius: 8px;
		background: var(--white8);
		overflow-x: auto;
	}

	.note-editor :global(.note-prose pre code) {
		padding: 0;
		background: transparent;
	}

	.note-editor :global(.note-prose blockquote) {
		margin: 0 0 0.65em;
		padding-left: 0.85rem;
		border-left: 2px solid var(--white16);
		color: var(--white66);
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
</style>
