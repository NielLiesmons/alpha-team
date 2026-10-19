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
