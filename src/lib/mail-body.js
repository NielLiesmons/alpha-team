/**
 * Plain-text mail body split + quote parsing for thread panels.
 */

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;

/** Real markup — not `Name <user@host>` angle addresses. */
function looksLikeHtml(text) {
	return /<\/?(?:br|p|div|span|blockquote|html|body|table|tr|td|th|a|img|font|b|i|u|strong|em|ul|ol|li|h[1-6]|head|meta|style|pre|hr)\b/i.test(
		String(text || '')
	);
}

/** @param {string} html */
function stripHtml(html) {
	return String(html || '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.trim();
}

/** @param {string} text */
export function isForwardedMail(text) {
	const t = String(text || '');
	return (
		/(?:^|\n)\s*-{2,}\s*Forwarded message\s*-{2,}/i.test(t) ||
		/(?:^|\n)\s*Begin forwarded message:\s*$/im.test(t)
	);
}

/** @param {string} line */
function isForwardBanner(line) {
	const t = String(line || '').trim();
	return /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i.test(t) || /^Begin forwarded message:\s*$/i.test(t);
}

/**
 * Split body into new reply vs quoted tail.
 * Forwards (and empty-main splits) are never collapsible — show in full.
 * @param {string} body
 * @returns {{ main: string, quoted: string, collapsible: boolean }}
 */
export function splitMailQuote(body) {
	let text = String(body ?? '').replace(/\r\n/g, '\n');
	if (!text.trim()) return { main: '', quoted: '', collapsible: false };

	let main = text;
	let quoted = '';

	if (looksLikeHtml(text)) {
		const bq = text.search(/<blockquote\b/i);
		if (bq > 0) {
			main = stripHtml(text.slice(0, bq));
			quoted = stripHtml(text.slice(bq));
		} else {
			text = stripHtml(text);
			main = text;
		}
	}

	if (!quoted) {
		const patterns = [
			/\n(On .+wrote:[\s\S]*)$/i,
			/\n(-{2,}\s*Original Message\s*-{2,}[\s\S]*)$/i,
			/\n(_{5,}[\s\S]*)$/,
			/\n(From:\s[^\n]+\n(?:Sent|Date):\s[\s\S]*)$/i
		];
		for (const re of patterns) {
			const m = text.match(re);
			if (m?.[1] && m.index != null) {
				main = text.slice(0, m.index).trimEnd();
				quoted = m[1];
				break;
			}
		}
	}

	if (!quoted) {
		if (/^On .+wrote:/i.test(text.trim())) {
			main = '';
			quoted = text.trim();
		} else {
			const lines = text.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (!/^\s*>/.test(lines[i])) continue;
				let start = i;
				if (i > 0 && /^On .+wrote:\s*$/i.test(lines[i - 1].trim())) start = i - 1;
				else if (
					i > 1 &&
					lines[i - 1].trim() === '' &&
					/^On .+wrote:\s*$/i.test(lines[i - 2].trim())
				) {
					start = i - 2;
				}
				if (start === 0) {
					main = '';
					quoted = text;
				} else {
					main = lines.slice(0, start).join('\n').trimEnd();
					quoted = lines.slice(start).join('\n');
				}
				break;
			}
		}
	}

	/* Nothing to hide, or hiding would leave an empty panel (forwards / mis-split). */
	if (!quoted.trim()) return { main: text, quoted: '', collapsible: false };
	if (!main.trim() || isForwardedMail(text) || isForwardedMail(quoted)) {
		return { main: text, quoted: '', collapsible: false };
	}
	return { main, quoted, collapsible: true };
}

/** @param {string} line */
function quoteDepth(line) {
	const m = String(line).match(/^(?:\s*>)+/);
	if (!m) return 0;
	return (m[0].match(/>/g) || []).length;
}

/** @param {string} line @param {number} depth */
function stripQuotePrefix(line, depth) {
	if (depth <= 0) return line;
	let s = line;
	for (let i = 0; i < depth; i++) {
		s = s.replace(/^\s*>\s?/, '');
	}
	return s;
}

/** @param {string} line */
function emailFromLine(line) {
	const m = String(line).match(EMAIL_RE);
	return m ? m[0].toLowerCase() : '';
}

/**
 * @param {string} text
 * @param {string} [fallbackEmail]
 * @param {{ minDepth?: number }} [opts] use minDepth:1 for collapsed reply tails
 * @returns {{ depth: number, email: string, text: string }[]}
 */
export function parseMailSegments(text, fallbackEmail = '', opts = {}) {
	const minDepth = Math.max(0, Number(opts.minDepth) || 0);
	const raw = String(text ?? '').replace(/\r\n/g, '\n');
	if (!raw.trim()) return [];

	const lines = raw.split('\n');
	/** @type {{ depth: number, email: string, text: string }[]} */
	const segments = [];
	let attributed = String(fallbackEmail || '')
		.trim()
		.toLowerCase();
	/** After a forward banner, plain lines stay quoted until the end. */
	let forceForwardDepth = 0;

	/** @type {string[]} */
	let buf = [];
	let bufDepth = 0;
	let bufEmail = '';

	const flush = () => {
		while (buf.length && buf[buf.length - 1] === '') buf.pop();
		while (buf.length && buf[0] === '') buf.shift();
		if (!buf.length) return;
		segments.push({
			depth: bufDepth,
			email: bufEmail,
			text: buf.join('\n')
		});
		buf = [];
	};

	for (const line of lines) {
		const depth = quoteDepth(line);
		const content = stripQuotePrefix(line, depth);

		if (/^\s*On .+wrote:/i.test(content) || /^\s*From:\s*/i.test(content)) {
			const em = emailFromLine(content);
			if (em) attributed = em;
		}

		if (isForwardBanner(content)) {
			forceForwardDepth = 1;
			/* Wait for the following From: line for accent color. */
			attributed = '';
		}

		const segDepth = Math.max(depth, forceForwardDepth, minDepth);
		const email = segDepth > 0 ? attributed : '';

		if (segDepth !== bufDepth || email !== bufEmail) {
			flush();
			bufDepth = segDepth;
			bufEmail = email;
		}
		buf.push(content);
	}
	flush();

	return segments;
}
