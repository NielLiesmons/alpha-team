/**
 * Contenteditable ↔ wire-format helpers for the chat composer.
 * Wire stays `:shortcode:` + `@CompactName` + unicode; the CE paints chips.
 */

import { customEmojiUrl } from './custom-emoji.svelte.js';
import { profileNameCss } from './color.js';
import { mentionLookup, tokenizeChatBody } from './message-emoji.js';

/** @typedef {{ email: string, name?: string }} MentionPerson */

/**
 * @param {Node | null | undefined} node
 * @returns {string}
 */
export function serializeComposerNode(node) {
	if (!node) return '';
	if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
	if (node.nodeType !== Node.ELEMENT_NODE) return '';
	const el = /** @type {HTMLElement} */ (node);
	if (el.dataset?.emoji) return el.dataset.emoji;
	if (el.dataset?.mention) return el.dataset.mention;
	if (el.tagName === 'BR') return '\n';
	let out = '';
	for (const child of el.childNodes) out += serializeComposerNode(child);
	/* Block-ish breaks between divs (contenteditable Enter). */
	if ((el.tagName === 'DIV' || el.tagName === 'P') && out && !out.endsWith('\n')) {
		/* leaf handled by children; parent join adds newline between blocks below */
	}
	return out;
}

/**
 * Serialize a contenteditable root to wire text.
 * @param {HTMLElement | null | undefined} root
 */
export function serializeComposer(root) {
	if (!root) return '';
	/** @type {string[]} */
	const parts = [];
	const kids = [...root.childNodes];
	for (let i = 0; i < kids.length; i++) {
		const kid = kids[i];
		if (
			kid.nodeType === Node.ELEMENT_NODE &&
			(/** @type {HTMLElement} */ (kid).tagName === 'DIV' ||
				/** @type {HTMLElement} */ (kid).tagName === 'P')
		) {
			if (parts.length && !String(parts[parts.length - 1]).endsWith('\n')) parts.push('\n');
			parts.push(serializeComposerNode(kid));
			continue;
		}
		parts.push(serializeComposerNode(kid));
	}
	return parts.join('').replace(/\u00a0/g, ' ');
}

/**
 * Wire-format length up to a DOM point (for cursor mapping).
 * @param {HTMLElement} root
 * @param {Node} target
 * @param {number} offset
 */
function wireLengthBefore(root, target, offset) {
	let count = 0;
	/** @param {Node} node */
	function walk(node) {
		if (node === target) {
			if (node.nodeType === Node.TEXT_NODE) {
				count += Math.min(offset, (node.textContent || '').length);
			} else if (offset > 0) {
				const kids = [...node.childNodes];
				for (let i = 0; i < offset && i < kids.length; i++) {
					count += serializeComposerNode(kids[i]).length;
				}
			}
			return true;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			count += (node.textContent || '').length;
			return false;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return false;
		const el = /** @type {HTMLElement} */ (node);
		if (el.dataset?.emoji || el.dataset?.mention) {
			if (node === target) return true;
			count += serializeComposerNode(el).length;
			return false;
		}
		if (el.tagName === 'BR') {
			count += 1;
			return false;
		}
		for (const child of el.childNodes) {
			if (walk(child)) return true;
		}
		return false;
	}
	walk(root);
	return count;
}

/**
 * @param {HTMLElement | null | undefined} root
 * @returns {number}
 */
export function getComposerCursor(root) {
	if (!root || typeof window === 'undefined') return serializeComposer(root).length;
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return serializeComposer(root).length;
	const range = sel.getRangeAt(0);
	if (!root.contains(range.startContainer)) return serializeComposer(root).length;
	return wireLengthBefore(root, range.startContainer, range.startOffset);
}

/**
 * Place caret at a wire-format offset.
 * @param {HTMLElement | null | undefined} root
 * @param {number} wireOffset
 */
export function setComposerCursor(root, wireOffset) {
	if (!root || typeof window === 'undefined') return;
	const target = Math.max(0, Number(wireOffset) || 0);
	const sel = window.getSelection();
	if (!sel) return;

	let remaining = target;
	/** @type {{ node: Node, offset: number } | null} */
	let hit = null;

	/** @param {Node} node */
	function walk(node) {
		if (hit) return;
		if (node.nodeType === Node.TEXT_NODE) {
			const len = (node.textContent || '').length;
			if (remaining <= len) {
				hit = { node, offset: remaining };
				remaining = 0;
				return;
			}
			remaining -= len;
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const el = /** @type {HTMLElement} */ (node);
		if (el.dataset?.emoji || el.dataset?.mention) {
			const len = serializeComposerNode(el).length;
			if (remaining <= len) {
				/* Place after the chip when offset lands inside it. */
				const parent = el.parentNode;
				if (parent) {
					const idx = [...parent.childNodes].indexOf(el) + (remaining > 0 ? 1 : 0);
					hit = { node: parent, offset: Math.max(0, idx) };
				}
				remaining = 0;
				return;
			}
			remaining -= len;
			return;
		}
		if (el.tagName === 'BR') {
			if (remaining <= 1) {
				const parent = el.parentNode;
				if (parent) {
					const idx = [...parent.childNodes].indexOf(el) + 1;
					hit = { node: parent, offset: idx };
				}
				remaining = 0;
				return;
			}
			remaining -= 1;
			return;
		}
		for (const child of el.childNodes) walk(child);
	}

	walk(root);
	if (!hit) {
		hit = { node: root, offset: root.childNodes.length };
	}

	const range = document.createRange();
	try {
		range.setStart(hit.node, hit.offset);
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);
	} catch {
		/* ignore invalid offsets */
	}
}

/**
 * @param {string} token
 * @returns {HTMLImageElement}
 */
function emojiChip(token) {
	const img = document.createElement('img');
	img.className = 'ce-emoji';
	img.dataset.emoji = token;
	img.alt = token;
	img.title = token;
	img.draggable = false;
	img.width = 20;
	img.height = 20;
	const src = customEmojiUrl(token);
	if (src) img.src = src;
	else {
		img.classList.add('ce-emoji-skel');
		img.removeAttribute('src');
	}
	return img;
}

/**
 * @param {string} wire
 * @param {string} label
 * @param {string} email
 * @param {boolean} isDark
 */
function mentionChip(wire, label, email, isDark) {
	const span = document.createElement('span');
	span.className = 'ce-mention';
	span.dataset.mention = wire;
	span.dataset.email = email || '';
	span.contentEditable = 'false';
	span.textContent = wire.startsWith('@') ? wire : `@${label || wire}`;
	span.style.color = profileNameCss(email, label || wire, isDark);
	return span;
}

/**
 * Strip invisible / NBSP so empty CE chrome (br, zwsp) doesn't look like content.
 * @param {string} wire
 */
export function normalizeComposerWire(wire) {
	return String(wire ?? '')
		.replace(/\u00a0/g, ' ')
		.replace(/[\u200b\u200c\u200d\ufeff]/g, '');
}

/**
 * True when the wire has no visible text (whitespace / newlines only).
 * @param {string} wire
 */
export function isComposerWireEmpty(wire) {
	return !normalizeComposerWire(wire).trim();
}

/**
 * Contenteditable empty chrome: browsers leave `<br>`, `<div><br></div>`, or ZWSP
 * after focus/blur/backspace — that inflates scrollHeight and trips multi-line layout.
 * Clear to a truly empty root when wire has no visible text. Returns whether DOM changed.
 * @param {HTMLElement | null | undefined} root
 */
export function normalizeComposerEmpty(root) {
	if (!root) return false;
	const wire = serializeComposer(root);
	if (!isComposerWireEmpty(wire)) return false;
	if (!root.childNodes.length) return false;
	root.replaceChildren();
	return true;
}

/**
 * Build contenteditable children from wire text.
 * @param {HTMLElement} root
 * @param {string} wire
 * @param {{ people?: MentionPerson[], isDark?: boolean }} [opts]
 */
export function renderComposerWire(root, wire, opts = {}) {
	const people = opts.people || [];
	const isDark = Boolean(opts.isDark);
	const normalized = isComposerWireEmpty(wire) ? '' : String(wire ?? '');
	const tokens = tokenizeChatBody(normalized, { people });
	root.replaceChildren();
	if (!tokens.length) return;

	/** @type {DocumentFragment} */
	const frag = document.createDocumentFragment();
	/** @type {Text | null} */
	let textRun = null;

	/** @param {string} s */
	function pushText(s) {
		if (!s) return;
		if (textRun) textRun.data += s;
		else {
			textRun = document.createTextNode(s);
			frag.appendChild(textRun);
		}
	}

	/** @param {Node} node */
	function pushNode(node) {
		textRun = null;
		frag.appendChild(node);
	}

	for (const tok of tokens) {
		if (tok.type === 'text' || tok.type === 'link') {
			pushText(tok.value);
		} else if (tok.type === 'emoji') {
			pushText(tok.value);
		} else if (tok.type === 'custom') {
			pushNode(emojiChip(tok.value));
		} else if (tok.type === 'mention') {
			pushNode(
				mentionChip(tok.value, tok.label || tok.value, tok.email || '', isDark)
			);
		}
	}
	root.appendChild(frag);
}

/**
 * True when text nodes still contain complete custom shortcodes or resolvable @mentions.
 * @param {HTMLElement} root
 * @param {MentionPerson[]} [people]
 */
export function composerNeedsPromote(root, people = []) {
	const map = mentionLookup(people);
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	/** @type {Node | null} */
	let n = walker.nextNode();
	while (n) {
		const t = n.textContent || '';
		if (/:[a-z0-9_]{2,32}:/i.test(t)) return true;
		const mentions = t.match(/@[A-Za-z0-9._\-]+/g);
		if (mentions) {
			for (const hit of mentions) {
				if (map.get(hit.slice(1).toLowerCase())) return true;
			}
		}
		n = walker.nextNode();
	}
	return false;
}

/**
 * After plain typing, promote completed `:shortcode:` / resolvable `@mentions` to chips.
 * Returns whether the DOM changed.
 * @param {HTMLElement} root
 * @param {{ people?: MentionPerson[], isDark?: boolean }} [opts]
 */
export function promoteComposerTokens(root, opts = {}) {
	const people = opts.people || [];
	if (!composerNeedsPromote(root, people)) return false;
	const before = serializeComposer(root);
	const cursor = getComposerCursor(root);
	renderComposerWire(root, before, opts);
	setComposerCursor(root, cursor);
	return serializeComposer(root) !== before;
}

/**
 * Read wire value from a composer input (textarea or contenteditable).
 * @param {HTMLElement | HTMLTextAreaElement | null | undefined} el
 */
export function getComposerWireValue(el) {
	if (!el) return '';
	if (el instanceof HTMLTextAreaElement) return el.value;
	if (el.isContentEditable) return serializeComposer(el);
	return '';
}

/**
 * @param {HTMLElement | HTMLTextAreaElement | null | undefined} el
 */
export function getComposerSelectionStart(el) {
	if (!el) return 0;
	if (el instanceof HTMLTextAreaElement) return el.selectionStart ?? el.value.length;
	if (el.isContentEditable) return getComposerCursor(el);
	return 0;
}

/**
 * @param {HTMLElement | HTMLTextAreaElement | null | undefined} el
 * @param {number} start
 * @param {number} [end]
 */
export function setComposerSelectionRange(el, start, end = start) {
	if (!el) return;
	if (el instanceof HTMLTextAreaElement) {
		el.setSelectionRange(start, end);
		return;
	}
	if (el.isContentEditable) setComposerCursor(el, start);
}

/**
 * Apply textarea-like value/selection shims onto a contenteditable root
 * so existing suggest/parent code can keep calling setSelectionRange.
 * @param {HTMLElement} el
 * @param {() => string} getWire
 * @param {(wire: string) => void} setWire
 */
export function installComposerTextareaShim(el, getWire, setWire) {
	Object.defineProperty(el, 'value', {
		configurable: true,
		get: () => getWire(),
		set: (v) => setWire(String(v ?? ''))
	});
	Object.defineProperty(el, 'selectionStart', {
		configurable: true,
		get: () => getComposerCursor(el),
		set: (v) => setComposerCursor(el, Number(v) || 0)
	});
	Object.defineProperty(el, 'selectionEnd', {
		configurable: true,
		get: () => getComposerCursor(el),
		set: (v) => setComposerCursor(el, Number(v) || 0)
	});
	/** @param {number} start @param {number} [end] */
	el.setSelectionRange = (start, _end) => {
		setComposerCursor(el, start);
	};
}

/**
 * People list for mention coloring / resolve.
 * @param {Iterable<{ email?: string, name?: string, status?: string }>} members
 * @returns {MentionPerson[]}
 */
export function composerPeopleFromMembers(members) {
	/** @type {MentionPerson[]} */
	const out = [];
	for (const m of members || []) {
		if (m.status === 'disabled') continue;
		out.push({
			email: String(m.email || ''),
			name: String(m.name || '').trim()
		});
	}
	return out;
}

export { mentionLookup };
