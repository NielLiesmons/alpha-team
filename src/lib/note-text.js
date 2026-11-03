/**
 * Notes may be HTML (TipTap) or legacy plain/markdown.
 * @param {string} raw
 */
export function notePlainText(raw) {
	if (!raw) return '';
	let s = String(raw);
	if (s.includes('<')) {
		s = s
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p>/gi, '\n')
			.replace(/<\/h[1-6]>/gi, '\n')
			.replace(/<li[^>]*>/gi, '• ')
			.replace(/<[^>]+>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"');
	}
	return stripMarkdownSyntax(s).replace(/\s+/g, ' ').trim();
}

/**
 * Strip common markdown markers so list previews stay readable.
 * @param {string} s
 */
export function stripMarkdownSyntax(s) {
	return String(s)
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]+`/g, (m) => m.slice(1, -1))
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^\s*>+\s?/gm, '')
		.replace(/^\s*[-*+]\s+/gm, '')
		.replace(/^\s*\d+\.\s+/gm, '')
		.replace(/(\*\*|__)(.*?)\1/g, '$2')
		.replace(/(\*|_)(.*?)\1/g, '$2')
		.replace(/~~(.*?)~~/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
}

/** @param {string} raw */
export function noteLooksLikeHtml(raw) {
	return typeof raw === 'string' && /<\/?[a-z][\s\S]*>/i.test(raw);
}

/** @param {string} s */
function escapeHtml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Heuristic: plain text that should be parsed as Markdown (paste / legacy notes). */
/** @param {string} s */
export function looksLikeMarkdown(s) {
	const t = String(s || '');
	if (!t.trim()) return false;
	return (
		/^#{1,6}\s/m.test(t) ||
		/^\s{0,3}([-—*+]|\d+\.)\s/m.test(t) ||
		/^\s{0,3}>/m.test(t) ||
		/(\*\*|__)[^*\n]+(\*\*|__)/.test(t) ||
		/(^|[^*])\*[^*\n]+\*(?!\*)/.test(t) ||
		/(^|[^_])_[^_\n]+_(?!_)/.test(t) ||
		/`[^`\n]+`/.test(t) ||
		/\[[^\]]+\]\([^)]+\)/.test(t) ||
		/^```/m.test(t)
	);
}

/**
 * True when clipboard HTML is real rich content (Word/Docs/Notion).
 * Ignores Chromium/WebKit paste wrappers that falsely look like markup
 * (e.g. `<b style="font-weight:normal">`, Apple span soup around plain MD).
 * @param {string} html
 */
export function clipboardHtmlIsRich(html) {
	let s = String(html || '');
	if (!s.trim()) return false;
	s = s
		.replace(/<!--StartFragment-->/gi, '')
		.replace(/<!--EndFragment-->/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<meta[^>]*>/gi, '')
		.replace(/<\/?(html|head|body|fragment)[^>]*>/gi, '')
		/* Chromium wraps plain selections in <b style="font-weight:normal"> */
		.replace(/<b\b[^>]*font-weight\s*:\s*normal[^>]*>/gi, '')
		.replace(/<\/b>/gi, '')
		/* WebKit / Apple Notes noise */
		.replace(/<span\b[^>]*Apple-[^>]*>/gi, '')
		.replace(/<\/span>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.trim();
	if (!s) return false;
	/* Structural / semantic rich paste — keep browser HTML.
	 * <pre>/<code>/<div>/<p>/<span> alone are often editors wrapping MD source. */
	if (/<(h[1-6]|ul|ol|li|table|blockquote|img)\b/i.test(s)) return true;
	if (/<(strong|em)\b/i.test(s)) return true;
	/* Real bold/italic — not the Chromium wrapper already stripped */
	if (/<b\b/i.test(s) || /<i\b/i.test(s)) return true;
	return false;
}

/** @param {string} s */
function inlineMarkdown(s) {
	let out = escapeHtml(s);
	out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
	out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
	out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
	out = out.replace(
		/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g,
		'$1<a href="$2">$2</a>'
	);
	return out;
}

/**
 * Convert common Markdown to TipTap-friendly HTML.
 * @param {string} raw
 */
export function markdownToHtml(raw) {
	const text = String(raw || '').replace(/\r\n/g, '\n');
	if (!text.trim()) return '';

	const lines = text.split('\n');
	/** @type {string[]} */
	const html = [];
	/** @type {'ul' | 'ol' | null} */
	let listKind = null;
	/** @type {string[]} */
	let para = [];

	function closeList() {
		if (!listKind) return;
		html.push(`</${listKind}>`);
		listKind = null;
	}

	function flushPara() {
		if (!para.length) return;
		html.push(`<p>${para.map(inlineMarkdown).join('<br>')}</p>`);
		para = [];
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (/^```/.test(line)) {
			flushPara();
			closeList();
			/** @type {string[]} */
			const code = [];
			i++;
			while (i < lines.length && !/^```/.test(lines[i])) {
				code.push(escapeHtml(lines[i]));
				i++;
			}
			html.push(`<pre><code>${code.join('\n')}</code></pre>`);
			continue;
		}

		const heading = /^(#{1,3})\s+(.+)$/.exec(line);
		if (heading) {
			flushPara();
			closeList();
			const level = heading[1].length;
			html.push(`<h${level}>${inlineMarkdown(heading[2].trim())}</h${level}>`);
			continue;
		}

		const quote = /^>\s?(.*)$/.exec(line);
		if (quote) {
			flushPara();
			closeList();
			html.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
			continue;
		}

		const ul = /^\s{0,3}[-—*+]\s+(.+)$/.exec(line);
		if (ul) {
			flushPara();
			if (listKind !== 'ul') {
				closeList();
				html.push('<ul>');
				listKind = 'ul';
			}
			html.push(`<li><p>${inlineMarkdown(ul[1])}</p></li>`);
			continue;
		}

		const ol = /^\s{0,3}(\d+)\.\s+(.+)$/.exec(line);
		if (ol) {
			flushPara();
			if (listKind !== 'ol') {
				closeList();
				html.push('<ol>');
				listKind = 'ol';
			}
			html.push(`<li><p>${inlineMarkdown(ol[2])}</p></li>`);
			continue;
		}

		if (!line.trim()) {
			flushPara();
			closeList();
			continue;
		}

		closeList();
		para.push(line);
	}

	flushPara();
	closeList();
	return html.join('');
}

/**
 * Escape plain text and turn markdown / bare URLs into accent-ready anchors.
 * @param {string} raw
 */
export function renderInlineLinks(raw) {
	if (!raw) return '';
	const escaped = escapeHtml(raw);
	const withMd = escaped.replace(
		/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
		'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
	);
	return withMd.replace(
		/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g,
		'$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
	);
}
