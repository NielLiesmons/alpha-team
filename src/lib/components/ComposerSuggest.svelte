<script>
	/**
	 * Zapstore-style typeahead for chat/comment textareas.
	 * `:` → emoji (stock + custom). `@` → people + files.
	 */
	import ProfilePic from './ProfilePic.svelte';
	import ChatEmoji from './ChatEmoji.svelte';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { customEmojis, customEmojiUrl, refreshCustomEmojis } from '$lib/custom-emoji.svelte.js';
	import { applyComposerInsert, detectComposerTrigger } from '$lib/composer-suggest.js';
	import { searchEmojis } from '$lib/emoji.js';
	import { filesView } from '$lib/files-view.svelte.js';
	import { members } from '$lib/members.svelte.js';
	import { customEmojiShortcode } from '$lib/message-emoji.js';
	import { activeSession } from '$lib/drive/session.svelte.js';

	/**
	 * @type {{
	 *   inputEl?: HTMLTextAreaElement | null,
	 *   value?: string,
	 *   oninsert: (next: string, cursor: number) => void
	 * }}
	 */
	let { inputEl = null, value = '', oninsert } = $props();

	/** @type {'@' | ':' | null} */
	let trigger = $state(null);
	let query = $state('');
	let rangeStart = $state(0);
	let rangeEnd = $state(0);
	let selected = $state(0);
	/** @type {'people' | 'files'} */
	let atTab = $state('people');
	/** @type {'emoji' | 'custom'} */
	let emojiTab = $state('emoji');

	const open = $derived(Boolean(trigger));

	/** @typedef {{ id: string, label: string, sub?: string, insert: string, kind: string, email?: string, path?: string, emoji?: string }} SuggestItem */

	const items = $derived.by(() => {
		/** @type {SuggestItem[]} */
		const out = [];
		const q = query.trim().toLowerCase();
		if (trigger === '@') {
			if (atTab === 'people') {
				members.length;
				for (const m of members) {
					if (m.status === 'disabled') continue;
					const email = String(m.email || '').toLowerCase();
					const name = String(m.name || displayNameFromEmail(email)).trim();
					if (q && !email.includes(q) && !name.toLowerCase().includes(q)) continue;
					out.push({
						id: `p:${email}`,
						label: name,
						sub: email,
						insert: `@${name.replace(/\s+/g, '')}`,
						kind: 'person',
						email
					});
					if (out.length >= 8) break;
				}
			} else {
				filesView.entries.length;
				for (const e of filesView.entries) {
					const path = String(e.path || '');
					const name = String(e.display_name || path.split('/').pop() || path);
					if (q && !path.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) {
						continue;
					}
					out.push({
						id: `f:${path}`,
						label: name,
						sub: path,
						insert: `@${path}`,
						kind: 'file',
						path
					});
					if (out.length >= 8) break;
				}
			}
		} else if (trigger === ':') {
			if (emojiTab === 'custom') {
				customEmojis.length;
				for (const em of customEmojis) {
					if (q && !em.name.includes(q)) continue;
					const code = customEmojiShortcode(em.name);
					out.push({
						id: `c:${em.id}`,
						label: code,
						sub: em.name,
						insert: code,
						kind: 'custom',
						emoji: code
					});
					if (out.length >= 24) break;
				}
			} else {
				const stock = searchEmojis(q || ' ', q ? 48 : 32);
				for (const item of stock) {
					out.push({
						id: `e:${item.g}`,
						label: item.g,
						sub: item.n || '',
						insert: item.g,
						kind: 'emoji',
						emoji: item.g
					});
				}
				/* Also surface matching custom in the emoji tab when querying */
				if (q) {
					for (const em of customEmojis) {
						if (!em.name.includes(q)) continue;
						const code = customEmojiShortcode(em.name);
						out.push({
							id: `c:${em.id}`,
							label: code,
							sub: em.name,
							insert: code,
							kind: 'custom',
							emoji: code
						});
					}
				}
			}
		}
		return out;
	});

	$effect(() => {
		if (trigger === ':' && activeSession()) {
			void refreshCustomEmojis().catch(() => {});
		}
	});

	$effect(() => {
		items.length;
		selected = 0;
	});

	function syncFromInput() {
		const el = inputEl;
		if (!el) {
			close();
			return;
		}
		const hit = detectComposerTrigger(el.value, el.selectionStart ?? el.value.length);
		if (!hit) {
			close();
			return;
		}
		trigger = hit.trigger;
		query = hit.query;
		rangeStart = hit.start;
		rangeEnd = hit.end;
	}

	function close() {
		trigger = null;
		query = '';
	}

	/** @param {SuggestItem} item */
	function choose(item) {
		const el = inputEl;
		const base = el?.value ?? value;
		const { value: next, cursor } = applyComposerInsert(
			base,
			{ start: rangeStart, end: rangeEnd },
			item.insert
		);
		oninsert(next, cursor);
		close();
		queueMicrotask(() => {
			if (!inputEl) return;
			inputEl.focus();
			inputEl.setSelectionRange(cursor, cursor);
		});
	}

	/**
	 * @param {KeyboardEvent} e
	 * @returns {boolean}
	 */
	function handleKeydown(e) {
		if (!open) return false;
		if (!items.length) {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopImmediatePropagation();
				close();
				return true;
			}
			return false;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			e.stopImmediatePropagation();
			selected = (selected + 1) % items.length;
			return true;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			e.stopImmediatePropagation();
			selected = (selected - 1 + items.length) % items.length;
			return true;
		}
		if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			e.stopImmediatePropagation();
			choose(items[selected]);
			return true;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopImmediatePropagation();
			close();
			return true;
		}
		return false;
	}

	/* Self-bind so parents don't need component method exports. */
	$effect(() => {
		const el = inputEl;
		if (!el) return;
		const onInput = () => syncFromInput();
		/** @param {KeyboardEvent} e */
		const onKey = (e) => {
			handleKeydown(e);
		};
		el.addEventListener('input', onInput);
		el.addEventListener('click', onInput);
		el.addEventListener('keyup', onInput);
		el.addEventListener('keydown', onKey, true);
		value;
		queueMicrotask(onInput);
		return () => {
			el.removeEventListener('input', onInput);
			el.removeEventListener('click', onInput);
			el.removeEventListener('keyup', onInput);
			el.removeEventListener('keydown', onKey, true);
		};
	});
</script>

{#if open}
	<div class="suggest" role="listbox" aria-label={trigger === '@' ? 'Mentions' : 'Emoji'}>
		{#if trigger === '@'}
			<div class="tabs" role="tablist">
				<button
					type="button"
					class="tab"
					class:on={atTab === 'people'}
					onclick={() => (atTab = 'people')}>People</button
				>
				<button
					type="button"
					class="tab"
					class:on={atTab === 'files'}
					onclick={() => (atTab = 'files')}>Files</button
				>
			</div>
		{:else}
			<div class="tabs" role="tablist">
				<button
					type="button"
					class="tab"
					class:on={emojiTab === 'emoji'}
					onclick={() => (emojiTab = 'emoji')}>Emoji</button
				>
				<button
					type="button"
					class="tab"
					class:on={emojiTab === 'custom'}
					onclick={() => (emojiTab = 'custom')}>Space</button
				>
			</div>
		{/if}

		<div class="list" class:emoji-grid={trigger === ':' && emojiTab === 'emoji' && !query}>
			{#each items as item, i (item.id)}
				<button
					type="button"
					class="item"
					class:on={i === selected}
					class:emoji={item.kind === 'emoji' || item.kind === 'custom'}
					role="option"
					aria-selected={i === selected}
					onclick={() => choose(item)}
				>
					{#if item.kind === 'person'}
						<ProfilePic
							name={item.label}
							email={item.email || ''}
							pictureUrl={pictureUrlFor(item.email)}
							size={28}
						/>
						<span class="meta">
							<span class="label">{item.label}</span>
							{#if item.sub}<span class="sub">{item.sub}</span>{/if}
						</span>
					{:else if item.kind === 'file'}
						<span class="file-glyph" aria-hidden="true">📄</span>
						<span class="meta">
							<span class="label">{item.label}</span>
							{#if item.sub}<span class="sub">{item.sub}</span>{/if}
						</span>
					{:else if item.kind === 'custom'}
						{#if customEmojiUrl(item.emoji || '')}
							<img
								class="custom-img"
								src={customEmojiUrl(item.emoji || '')}
								alt={item.label}
								width="28"
								height="28"
							/>
						{:else}
							<ChatEmoji token={item.emoji || ''} size={28} />
						{/if}
						{#if query || emojiTab === 'custom'}
							<span class="meta">
								<span class="label">{item.label}</span>
							</span>
						{/if}
					{:else}
						<span class="emoji-glyph">{item.emoji}</span>
						{#if query}
							<span class="meta">
								<span class="label">{item.sub || item.label}</span>
							</span>
						{/if}
					{/if}
				</button>
			{:else}
				<p class="empty">
					{#if trigger === '@'}
						No {atTab === 'people' ? 'people' : 'files'}
					{:else}
						No emoji
					{/if}
				</p>
			{/each}
		</div>
	</div>
{/if}

<style>
	.suggest {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(100% + 8px);
		z-index: 8;
		min-width: 220px;
		max-width: 100%;
		border: 1px solid var(--glass-border);
		border-radius: 14px;
		background: var(--glass, var(--popover, var(--bg)));
		box-shadow: 0 10px 28px color-mix(in srgb, var(--fg) 16%, transparent);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		overflow: hidden;
	}

	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 0.33px solid var(--fg-8);
	}

	.tab {
		flex: 1;
		height: 34px;
		border: 0;
		background: transparent;
		color: var(--fg-33);
		font: inherit;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
	}

	.tab.on {
		color: var(--fg);
		box-shadow: inset 0 -2px 0 var(--fg);
	}

	.list {
		max-height: 220px;
		overflow: auto;
		padding: 4px;
	}

	.list.emoji-grid {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 2px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.list.emoji-grid .item {
		aspect-ratio: 1;
		justify-content: center;
		padding: 0;
	}

	.item:hover,
	.item.on {
		background: var(--fg-4);
	}

	.meta {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.label {
		font-size: 13px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sub {
		font-size: 11px;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-glyph,
	.emoji-glyph {
		font-size: 22px;
		line-height: 1;
	}

	.custom-img {
		display: block;
		object-fit: contain;
	}

	.empty {
		margin: 16px 8px;
		text-align: center;
		font-size: 13px;
		color: var(--fg-33);
		grid-column: 1 / -1;
	}
</style>
