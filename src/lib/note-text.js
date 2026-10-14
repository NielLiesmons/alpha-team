/**
 * Notes may be HTML (TipTap) or legacy plain/markdown.
 * @param {string} raw
 */
export function notePlainText(raw) {
	if (!raw) return '';
	const s = String(raw);
	if (s.includes('<')) {
		return s
			.replace(/<br\s*\/?>/gi, ' ')
			.replace(/<\/p>/gi, ' ')
			.replace(/<\/h[1-6]>/gi, ' ')
			.replace(/<[^>]+>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/\s+/g, ' ')
			.trim();
	}
	return s.replace(/\s+/g, ' ').trim();
}

/** @param {string} raw */
export function noteLooksLikeHtml(raw) {
	return typeof raw === 'string' && /<\/?[a-z][\s\S]*>/i.test(raw);
}
