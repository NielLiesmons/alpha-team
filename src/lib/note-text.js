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
