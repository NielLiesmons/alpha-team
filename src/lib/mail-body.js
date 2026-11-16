/**
 * Plain-text mail body split + quote parsing for thread panels.
 * Split uses email-reply-parser (Crisp / willdurand) for solid On…wrote detection;
 * reply/forward markers also cover EN / FR / NL / ES variants.
 */
import EmailReplyParser from 'email-reply-parser';

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

/** Gmail soft-wrap: first line looks like “On … <email>” without wrote yet. */
const REPLY_HEADER_START =
	/^(?:On\b|Le\b|Op\b|El\b|Il\b|Am\b|Den\b).{0,160}<[^>]+@[^>]+>\s*$/i;

const WROTE_ONLY = /^(?:wrote|a\s+[ée]crit|schreef|escribi[oó]|scritto)\s*:?\s*$/i;

const FORWARD_BANNER_LINE =
	/^(?:-{2,}\s*(?:Forwarded message|Message transf[ée]r[ée]|Doorgestuurd bericht|Mensaje reenviado)\s*-{2,}|Begin forwarded message\s*:|D[ée]but du message transf[ée]r[ée]\s*:|Begin doorgestuurd bericht\s*:|Inicio del mensaje reenviado\s*:)\s*$/i;

const FORWARD_ANYWHERE =
	/(?:^|\n)\s*(?:-{2,}\s*(?:Forwarded message|Message transf[ée]r[ée]|Doorgestuurd bericht|Mensaje reenviado)\s*-{2,}|Begin forwarded message\s*:|D[ée]but du message transf[ée]r[ée]\s*:|Begin doorgestuurd bericht\s*:|Inicio del mensaje reenviado\s*:)/i;

/** From / De / Van + Sent|Date / Envoyé / Verzonden / Enviado|Fecha */
const ATTRIBUTION_FROM = /^(?:From|De|Van)\s*:\s*/i;
const ORIGINAL_MESSAGE =
	/^(?:-{2,}\s*Original Message\s*-{2,}|-{2,}\s*Message d['’]origine\s*-{2,}|-{2,}\s*Oorspronkelijk bericht\s*-{2,}|-{2,}\s*Mensaje original\s*-{2,})\s*$/i;

const replyParser = new EmailReplyParser();

/** Real markup — not `Name <user@host>` angle addresses. */
export function isHtmlMailBody(text) {
	return /<\/?(?:br|p|div|span|blockquote|html|body|table|tr|td|th|a|img|font|b|i|u|strong|em|ul|ol|li|h[1-6]|head|meta|style|pre|hr)\b/i.test(
		String(text || '')
	);
}

/**
 * TipTap / composer HTML safe to drop into the thread.
 * Strips scripts, styles, and inline event handlers.
 * @param {string} html
 */
export function safeMailHtml(html) {
	return String(html || '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '');
}

/** @param {string} html */
function stripHtml(html) {
	return String(html || '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<\/div>/gi, '\n')
		.replace(/<\/li>/gi, '\n')
		.replace(/<\/tr>/gi, '\n')
		.replace(/<\/h[1-6]>/gi, '\n\n')
		.replace(/<hr\b[^>]*>/gi, '\n---\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
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

/** @param {string} line */
function isReplyHeaderLike(line) {
	const trim = String(line || '').trim();
	return (
		isReplyHeaderLine(trim) ||
		REPLY_HEADER_PREFIX.test(trim) ||
		REPLY_HEADER_START.test(trim) ||
		WROTE_ONLY.test(trim)
	);
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
 * True when the cited tail looks like a real reply attribution — not a bare `>` callout.
 * @param {string} quoted
 */
function quotedLooksLikeReply(quoted) {
	const lines = String(quoted || '')
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((l) => l.replace(/^(?:\s*>)+\s?/, '').trim())
		.filter(Boolean);
	if (!lines.length) return false;
	const head = lines.slice(0, 4).join('\n');
	if (isReplyHeaderLike(lines[0])) return true;
	if (lines.length > 1 && REPLY_HEADER_START.test(lines[0]) && WROTE_ONLY.test(lines[1])) {
		return true;
	}
	if (ORIGINAL_MESSAGE.test(lines[0])) return true;
	if (isForwardBanner(lines[0])) return true;
	if (
		ATTRIBUTION_FROM.test(lines[0]) &&
		lines.some((l) => /^(?:Sent|Date|Envoy[ée]|Verzonden|Enviado|Fecha)\s*:/i.test(l))
	) {
		return true;
	}
	/* email-reply-parser may keep header + body on one fragment */
	if (
		/^(?:On|Le|Op|El|Il|Am|Den)\b/i.test(head) &&
		/\b(?:wrote|écrit|schreef|escribi[oó]|scritto)\s*:/i.test(head)
	) {
		return true;
	}
	return false;
}

/**
 * Peel one leading `>` level so nested depth is relative to the outer quote rail.
 * @param {string} text
 */
export function stripOneQuoteLevel(text) {
	return String(text ?? '')
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => line.replace(/^\s*>\s?/, ''))
		.join('\n');
}

/**
 * @param {string} text
 * @returns {{ main: string, quoted: string } | null}
 */
function splitViaReplyParser(text) {
	try {
		const email = replyParser.read(text);
		const visible = String(email.getVisibleText?.() || '').replace(/\s+$/u, '');
		let quoted = '';
		if (typeof email.getQuotedText === 'function') {
			quoted = String(email.getQuotedText() || '').replace(/^\n+/, '');
		}
		if (!quoted.trim()) {
			const frags = email.getFragments?.() || [];
			const parts = [];
			for (const f of frags) {
				if (f.isQuoted?.()) parts.push(String(f.getContent?.() || ''));
			}
			quoted = parts.join('').replace(/^\n+/, '');
		}
		if (!quoted.trim() || !quotedLooksLikeReply(quoted)) return null;
		/* Visible empty → whole body is citation; caller decides collapsible. */
		return { main: visible, quoted };
	} catch {
		return null;
	}
}

/**
 * Line-scan fallback when the library misses (or HTML path already stripped).
 * @param {string} text
 * @returns {{ main: string, quoted: string } | null}
 */
function splitViaLineScan(text) {
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
		/* Gmail wrap: On … <email>\nwrote: */
		if (
			REPLY_HEADER_START.test(trim) &&
			i + 1 < lines.length &&
			WROTE_ONLY.test(lines[i + 1].trim())
		) {
			start = i;
			break;
		}
	}
	/*
	 * Do NOT collapse on bare `>` lines alone. Intentional callouts / menus
	 * (e.g. “> Yuna…”) are not reply quotes — only real attribution headers.
	 */
	if (start < 0) return null;
	if (start === 0) return { main: '', quoted: text };
	return {
		main: lines.slice(0, start).join('\n').trimEnd(),
		quoted: lines.slice(start).join('\n')
	};
}

/**
 * Split body into new reply vs quoted tail.
 * Quoted always runs through end of body (full prior citation, not a snippet).
 * Pure forwards / empty-main splits are never collapsible.
 * @param {string} body
 * @returns {{ main: string, quoted: string, collapsible: boolean }}
 */
export function splitMailQuote(body) {
	let text = String(body ?? '').replace(/\r\n/g, '\n');
	if (!text.trim()) return { main: '', quoted: '', collapsible: false };

	let main = text;
	let quoted = '';
	let fromHtml = false;

	if (isHtmlMailBody(text)) {
		const qAt = findHtmlQuoteIndex(text);
		if (qAt > 0) {
			main = stripHtml(text.slice(0, qAt));
			quoted = stripHtml(text.slice(qAt));
			fromHtml = true;
		} else if (qAt === 0) {
			/* Entire body is a quote container — don't collapse to empty. */
			return { main: stripHtml(text), quoted: '', collapsible: false };
		} else {
			text = stripHtml(text);
			main = text;
		}
	}

	if (!quoted) {
		const viaLib = splitViaReplyParser(text);
		const viaScan = viaLib || splitViaLineScan(text);
		if (viaScan) {
			main = viaScan.main;
			quoted = viaScan.quoted;
		}
	} else if (fromHtml && !quotedLooksLikeReply(quoted) && !/<blockquote/i.test(String(body || ''))) {
		/* HTML wrapper without a real attribution — keep full body visible. */
		return { main: stripHtml(String(body ?? '')), quoted: '', collapsible: false };
	}

	if (!quoted.trim()) return { main: text, quoted: '', collapsible: false };

	const firstQuoted = quoted
		.split('\n')
		.map((l) => l.trim())
		.find(Boolean);
	const pureForward =
		!main.trim() ||
		isForwardBanner(firstQuoted || '') ||
		(isForwardBanner(text.split('\n').map((l) => l.trim()).find(Boolean) || '') &&
			!quotedLooksLikeReply(quoted));

	if (pureForward) {
		return { main: text, quoted: '', collapsible: false };
	}
	if (!main.trim()) {
		return { main: text, quoted: '', collapsible: false };
	}
	return { main, quoted, collapsible: true };
}

/**
 * Plain text for a stored mail body (HTML stripped when needed).
 * @param {unknown} body
 */
export function plainMailBody(body) {
	let text = String(body ?? '')
		.replace(/\r\n/g, '\n')
		.trim();
	if (!text) return '';
	if (isHtmlMailBody(text)) text = stripHtml(text);
	return text.trim();
}

/**
 * Apple Mail–style expand: show the cited tail (normalized), falling back to the
 * previous thread message when the citation is empty.
 * @param {string} quoted
 * @param {any[]} mails chronological thread messages
 * @param {string} mailId current message id
 */
export function resolveExpandedQuote(quoted, mails, mailId) {
	const q = String(quoted || '').trim();
	const list = Array.isArray(mails) ? mails : [];
	const idx = list.findIndex((m) => String(m?.id || '') === String(mailId || ''));
	const prev = idx > 0 ? list[idx - 1] : null;
	const prevBody = prev ? plainMailBody(prev.body) : '';

	/* Prefer the citation from this message — peel one `>` so rails nest correctly. */
	if (q) return stripOneQuoteLevel(q);
	if (prevBody) return stripOneQuoteLevel(prevBody);
	return '';
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

/**
 * Soft-wrapped quote continuations often lose the leading `>` (clients reflow
 * “> … avec” → next line “ses "burgüs".”). Keep those orphans inside the rail.
 * @param {string} prevContent
 * @param {string} currContent
 */
function looksLikeQuoteContinuation(prevContent, currContent) {
	const curr = String(currContent ?? '');
	const trimmed = curr.trim();
	if (!trimmed) return false;
	/* Lowercase / closing punctuation → mid-sentence wrap */
	if (/^\p{Ll}/u.test(trimmed)) return true;
	if (/^[)»”"“'’\]}]/u.test(trimmed)) return true;
	const prevRaw = String(prevContent ?? '');
	const prev = prevRaw.replace(/\s+$/u, '');
	if (!prev) return false;
	/* Previous line ends mid-clause or was format=flowed (trailing space) */
	if (/\s$/u.test(prevRaw)) return true;
	if (/[,;:–—(\[{«"“]$/u.test(prev)) return true;
	return false;
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
	/** After a reply header, keep following body lines on the same rail. */
	let replyRailDepth = 0;

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

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let depth = quoteDepth(line);
		let content = stripQuotePrefix(line, depth);

		/*
		 * Gmail soft-wrap: “On … <email>” then “wrote:” on the next physical line.
		 * Merge into one attribution line so it stays in a single quote segment.
		 */
		if (
			REPLY_HEADER_START.test(content.trim()) &&
			!isReplyHeaderLine(content.trim()) &&
			i + 1 < lines.length
		) {
			const nextRaw = lines[i + 1];
			const nextDepth = quoteDepth(nextRaw);
			const nextContent = stripQuotePrefix(nextRaw, nextDepth).trim();
			if (WROTE_ONLY.test(nextContent) && nextDepth === depth) {
				content = `${content.trim()} ${nextContent}`;
				i += 1;
			}
		}

		/*
		 * Reflowed quote without `>` on the next physical line — stay in the
		 * open quote segment so trailing words don’t jump out of the rail.
		 */
		if (
			depth === 0 &&
			bufDepth > 0 &&
			buf.length > 0 &&
			looksLikeQuoteContinuation(buf[buf.length - 1], content)
		) {
			depth = bufDepth;
		}

		if (REPLY_HEADER_PREFIX.test(content) || ATTRIBUTION_FROM.test(content)) {
			const em = emailFromLine(content);
			if (em) attributed = em;
		}

		if (isForwardBanner(content)) {
			forceForwardDepth = 1;
			attributed = '';
			replyRailDepth = 0;
		}

		/*
		 * Reply attribution belongs on a quote rail with its body — never leave
		 * “On … wrote:” at depth 0 while `>` lines nest one deeper.
		 */
		if (isReplyHeaderLine(content) || REPLY_HEADER_PREFIX.test(content)) {
			depth = Math.max(depth, 1);
			replyRailDepth = depth;
		} else if (replyRailDepth > 0) {
			if (depth <= replyRailDepth + 1) {
				/* Same citation body (optional single extra `>` from clients). */
				depth = replyRailDepth;
			} else {
				/* Deeper nested citation — leave relative depth alone. */
				replyRailDepth = 0;
			}
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

/**
 * Nest flat depth segments into a tree for layered quote rails (Gmail / Apple Mail style).
 * @param {{ depth: number, email: string, text: string }[]} segments
 * @returns {{ depth: number, email: string, text: string, children: any[] }[]}
 */
export function nestMailSegments(segments) {
	const list = Array.isArray(segments) ? segments : [];
	/** @type {{ depth: number, email: string, text: string, children: any[] }} */
	const root = { depth: -1, email: '', text: '', children: [] };
	/** @type {typeof root[]} */
	const stack = [root];

	for (const seg of list) {
		const depth = Math.max(0, Number(seg.depth) || 0);
		const node = {
			depth,
			email: String(seg.email || ''),
			text: String(seg.text || ''),
			children: /** @type {any[]} */ ([])
		};
		while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
			stack.pop();
		}
		stack[stack.length - 1].children.push(node);
		stack.push(node);
	}

	return root.children;
}
