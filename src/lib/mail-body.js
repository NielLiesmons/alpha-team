/**
 * Plain-text mail body split + quote parsing for thread panels.
 * Reply/forward markers cover EN / FR / NL / ES (and common variants).
 */

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;

/**
 * “On … wrote:” style headers — match a full line.
 * EN On … wrote: | FR Le … a écrit : | NL Op … schreef …: | ES El … escribió:
 */
const REPLY_HEADER_LINE =
	/^(?:On\b.+wrote\s*:|Le\b.+a\s+[ée]crit\s*:|Op\b.+schreef.+:|El\b.+escribi[oó]\s*:)\s*$/i;

/** Same, but may share the line with trailing content. */
const REPLY_HEADER_PREFIX =
	/^(?:On\b.+wrote\s*:|Le\b.+a\s+[ée]crit\s*:|Op\b.+schreef.+:|El\b.+escribi[oó]\s*:)\s*/i;

const FORWARD_BANNER_LINE =
	/^(?:-{2,}\s*(?:Forwarded message|Message transf[ée]r[ée]|Doorgestuurd bericht|Mensaje reenviado)\s*-{2,}|Begin forwarded message\s*:|D[ée]but du message transf[ée]r[ée]\s*:|Begin doorgestuurd bericht\s*:|Inicio del mensaje reenviado\s*:)\s*$/i;

const FORWARD_ANYWHERE =
	/(?:^|\n)\s*(?:-{2,}\s*(?:Forwarded message|Message transf[ée]r[ée]|Doorgestuurd bericht|Mensaje reenviado)\s*-{2,}|Begin forwarded message\s*:|D[ée]but du message transf[ée]r[ée]\s*:|Begin doorgestuurd bericht\s*:|Inicio del mensaje reenviado\s*:)/i;

/** From / De / Van + Sent|Date / Envoyé / Verzonden / Enviado|Fecha */
const ATTRIBUTION_FROM = /^(?:From|De|Van)\s*:\s*/i;
const ORIGINAL_MESSAGE =
	/^(?:-{2,}\s*Original Message\s*-{2,}|-{2,}\s*Message d['’]origine\s*-{2,}|-{2,}\s*Oorspronkelijk bericht\s*-{2,}|-{2,}\s*Mensaje original\s*-{2,})\s*$/i;

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
		.replace(/<\/div>/gi, '\n')
		.replace(/<\/tr>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** @param {string} text */
export function isForwardedMail(text) {
	return FORWARD_ANYWHERE.test(String(text || ''));
}

/** @param {string} line */
function isForwardBanner(line) {
	return FORWARD_BANNER_LINE.test(String(line || '').trim());
}

/** @param {string} line */
function isReplyHeaderLine(line) {
	return REPLY_HEADER_LINE.test(String(line || '').trim());
}

/**
 * Earliest HTML quote container (blockquote or gmail/outlook quote wrappers).
 * @param {string} html
 */
function findHtmlQuoteIndex(html) {
	const patterns = [
		/<blockquote\b/i,
		/<div\b[^>]*class\s*=\s*["'][^"']*gmail_quote[^"']*["'][^>]*>/i,
		/<div\b[^>]*class\s*=\s*["'][^"']*gmail_extra[^"']*["'][^>]*>/i,
		/<div\b[^>]*id\s*=\s*["']divRplyFwdMsg["'][^>]*>/i,
		/<div\b[^>]*class\s*=\s*["'][^"']*OutlookMessageHeader[^"']*["'][^>]*>/i
	];
	let best = -1;
	for (const re of patterns) {
		const m = html.search(re);
		if (m >= 0 && (best < 0 || m < best)) best = m;
	}
	return best;
}

/**
 * Split body into new reply vs quoted tail.
 * Quoted always runs through end of body (full prior citation, not a snippet).
 * Forwards / empty-main splits are never collapsible.
 * @param {string} body
 * @returns {{ main: string, quoted: string, collapsible: boolean }}
 */
export function splitMailQuote(body) {
	let text = String(body ?? '').replace(/\r\n/g, '\n');
	if (!text.trim()) return { main: '', quoted: '', collapsible: false };

	let main = text;
	let quoted = '';

	if (looksLikeHtml(text)) {
		const qAt = findHtmlQuoteIndex(text);
		if (qAt > 0) {
			main = stripHtml(text.slice(0, qAt));
			quoted = stripHtml(text.slice(qAt));
		} else if (qAt === 0) {
			/* Entire body is a quote container — don't collapse to empty. */
			return { main: stripHtml(text), quoted: '', collapsible: false };
		} else {
			text = stripHtml(text);
			main = text;
		}
	}

	if (!quoted) {
		const lines = text.split('\n');
		let start = -1;
		for (let i = 0; i < lines.length; i++) {
			const trim = lines[i].trim();
			if (
				isReplyHeaderLine(trim) ||
				ORIGINAL_MESSAGE.test(trim) ||
				isForwardBanner(trim) ||
				(/^(?:From|De|Van)\s*:/i.test(trim) &&
					i + 1 < lines.length &&
					/^(?:Sent|Date|Envoy[ée]|Verzonden|Enviado|Fecha)\s*:/i.test(lines[i + 1].trim()))
			) {
				start = i;
				break;
			}
		}
		if (start < 0) {
			for (let i = 0; i < lines.length; i++) {
				if (!/^\s*>/.test(lines[i])) continue;
				start = i;
				if (i > 0 && isReplyHeaderLine(lines[i - 1].trim())) start = i - 1;
				else if (
					i > 1 &&
					lines[i - 1].trim() === '' &&
					isReplyHeaderLine(lines[i - 2].trim())
				) {
					start = i - 2;
				}
				break;
			}
		}
		if (start === 0) {
			main = '';
			quoted = text;
		} else if (start > 0) {
			main = lines.slice(0, start).join('\n').trimEnd();
			quoted = lines.slice(start).join('\n');
		}
	}

	if (!quoted.trim()) return { main: text, quoted: '', collapsible: false };
	if (!main.trim() || isForwardedMail(text) || isForwardedMail(quoted)) {
		return { main: text, quoted: '', collapsible: false };
	}
	return { main, quoted, collapsible: true };
}

/**
 * Prefer a complete previous message when the inline citation is a thin scrap.
 * @param {string} quoted
 * @param {any[]} mails chronological thread messages
 * @param {string} mailId current message id
 */
export function resolveExpandedQuote(quoted, mails, mailId) {
	const q = String(quoted || '').trim();
	const list = Array.isArray(mails) ? mails : [];
	const idx = list.findIndex((m) => String(m?.id || '') === String(mailId || ''));
	const prev = idx > 0 ? list[idx - 1] : null;
	let prevBody = String(prev?.body || '').trim();
	if (prevBody && looksLikeHtml(prevBody)) prevBody = stripHtml(prevBody);
	if (!prevBody) return q;
	if (!q) return prevBody;
	/* Citation clearly shorter than the prior mail → show the prior mail in full. */
	if (prevBody.length > 40 && q.length < Math.max(80, prevBody.length * 0.55)) {
		return prevBody;
	}
	return q;
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
 * @param {{ minDepth?: number }} [opts]
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
		let content = stripQuotePrefix(line, depth);

		if (REPLY_HEADER_PREFIX.test(content) || ATTRIBUTION_FROM.test(content)) {
			const em = emailFromLine(content);
			if (em) attributed = em;
		}

		if (isForwardBanner(content)) {
			forceForwardDepth = 1;
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
