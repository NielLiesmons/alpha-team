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
 * Accept unaccented “ecrit” (entities decoded upstream) and thin spaces.
 * `.+` spans date formats like `21/11/2026 21:27, Name` (no email required).
 */
const REPLY_HEADER_LINE =
	/^(?:On\b[\s\S]+?\bwrote\s*:|Le\b[\s\S]+?\ba\s+(?:[ée]crit|ecrit)\s*:|Op\b[\s\S]+?\bschreef[\s\S]+?:|El\b[\s\S]+?\bescribi[oó]\s*:)\s*$/i;

/** Same, but may share the line with trailing content. */
const REPLY_HEADER_PREFIX =
	/^(?:On\b[\s\S]+?\bwrote\s*:|Le\b[\s\S]+?\ba\s+(?:[ée]crit|ecrit)\s*:|Op\b[\s\S]+?\bschreef[\s\S]+?:|El\b[\s\S]+?\bescribi[oó]\s*:)\s*/i;

/**
 * Gmail / Apple soft-wrap: first line is “On … <email>” or “On … Name” without wrote yet.
 * Only used when the next physical line is WROTE_ONLY — keep the opener broad.
 */
const REPLY_HEADER_START =
	/^(?:On\b|Le\b|Op\b|El\b|Il\b|Am\b|Den\b).{4,200}$/i;

const WROTE_ONLY = /^(?:wrote|a\s+(?:[ée]crit|ecrit)|schreef|escribi[oó]|scritto)\s*:?\s*$/i;

/** Inline tags that may interrupt an attribution without ending the block. */
const ATTR_INLINE_GAP =
	'(?:\\s|&nbsp;|&#160;|&#x0*a0;|<br\\s*/?>|</?(?:span|font|b|i|u|strong|em|a|wbr|time)\\b[^>]*>)*';

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
 * Parse a CSS color token to [r,g,b] (0–255) or null.
 * @param {string} value
 * @returns {[number, number, number] | null}
 */
function parseCssColor(value) {
	const v = String(value || '')
		.trim()
		.toLowerCase();
	if (!v || v === 'transparent' || v === 'inherit' || v === 'currentcolor' || v === 'initial') {
		return null;
	}
	if (v === 'black') return [0, 0, 0];
	if (v === 'white') return [255, 255, 255];
	let m = v.match(/^#([0-9a-f]{3})$/i);
	if (m) {
		const h = m[1];
		return [
			parseInt(h[0] + h[0], 16),
			parseInt(h[1] + h[1], 16),
			parseInt(h[2] + h[2], 16)
		];
	}
	m = v.match(/^#([0-9a-f]{6})$/i);
	if (m) {
		return [
			parseInt(m[1].slice(0, 2), 16),
			parseInt(m[1].slice(2, 4), 16),
			parseInt(m[1].slice(4, 6), 16)
		];
	}
	m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
	if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
	return null;
}

/** @param {[number, number, number]} rgb */
function luminance(rgb) {
	return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** Near-black ink that assumes a light canvas (Apple Mail adapts these). */
function isAssumedLightInk(rgb) {
	/* Catch #000–#444-ish; leave mid grays / brand hues alone. */
	return Boolean(rgb) && luminance(rgb) <= 68;
}

/** Near-white fills that force light-mode contrast against adapted ink. */
function isAssumedLightFill(rgb) {
	return Boolean(rgb) && luminance(rgb) >= 248;
}

/**
 * Remap light-mode absolute colors in a style="" value for theme inheritance.
 * Near-black → currentColor; near-white backgrounds → transparent. Brand hues kept.
 * @param {string} style
 */
function adaptMailStyleColors(style) {
	const parts = String(style || '')
		.split(';')
		.map((p) => p.trim())
		.filter(Boolean);
	/** @type {string[]} */
	const out = [];
	for (const part of parts) {
		const colon = part.indexOf(':');
		if (colon < 0) {
			out.push(part);
			continue;
		}
		const prop = part.slice(0, colon).trim().toLowerCase();
		const val = part.slice(colon + 1).trim();
		const rgb = parseCssColor(val);
		if ((prop === 'color' || prop === 'text-decoration-color') && isAssumedLightInk(rgb)) {
			out.push(`${prop}: currentColor`);
			continue;
		}
		if (
			(prop === 'background' || prop === 'background-color') &&
			isAssumedLightFill(rgb) &&
			!/url\s*\(/i.test(val)
		) {
			out.push(`${prop}: transparent`);
			continue;
		}
		out.push(part);
	}
	return out.join('; ');
}

/**
 * Apple Mail–style theme adaptation for HTML mails: rewrite near-black ink and
 * near-white backgrounds so body text follows `--fg` / inherited color in dark mode.
 * Leaves intentional brand colors alone.
 * @param {string} html
 */
function adaptMailThemeColors(html) {
	let s = String(html || '');

	/* style="color:#000; background:#fff" */
	s = s.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (full, q, style) => {
		const next = adaptMailStyleColors(style);
		if (!next.trim()) return '';
		return ` style=${q}${next}${q}`;
	});

	/* <font color="#000000"> / color=black */
	s = s.replace(/\scolor\s*=\s*(["']?)([^"'>\s]+)\1/gi, (full, _q, raw) => {
		const rgb = parseCssColor(raw);
		if (isAssumedLightInk(rgb)) return ' color="currentColor"';
		return full;
	});

	/* bgcolor="#ffffff" */
	s = s.replace(/\sbgcolor\s*=\s*(["']?)([^"'>\s]+)\1/gi, (full, _q, raw) => {
		const rgb = parseCssColor(raw);
		if (isAssumedLightFill(rgb)) return ' bgcolor="transparent"';
		return full;
	});

	return s;
}

/**
 * TipTap / composer / inbound HTML safe to drop into the thread.
 * Strips scripts, styles, and inline event handlers; neuters javascript: URLs.
 * Also unwraps Gmail false-positive anchors whose label is only `+` / `++`
 * (e.g. “d'inventer ++”) while keeping real http(s)/mailto links.
 * Adapts near-black / near-white absolute colors for dark-mode readability.
 * @param {string} html
 */
export function safeMailHtml(html) {
	let s = String(html || '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<\/?(?:base|object|embed|iframe|form|input|button|textarea|select)\b[^>]*>/gi, '')
		.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '');

	/* Gmail sometimes autolinks bare `++` — unwrap those, keep real link labels. */
	s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (full, _attrs, inner) => {
		const label = String(inner || '')
			.replace(/<[^>]+>/g, '')
			.replace(/&nbsp;/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (/^\++$/.test(label)) return inner;
		return full;
	});

	return adaptMailThemeColors(s);
}

/** @param {string} s */
function escapeHtml(s) {
	return String(s || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Inline Gmail-ish plain markers + URLs inside an already-escaped line.
 * Stashes anchors first so bare-URL / emphasis passes cannot nest inside hrefs.
 * @param {string} escaped
 */
function formatPlainInline(escaped) {
	/** @type {string[]} */
	const links = [];
	/** @param {string} href @param {string} [label] */
	const stash = (href, label = href) => {
		const i = links.length;
		links.push(
			`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
		);
		return `\0L${i}\0`;
	};

	let s = String(escaped || '');
	/* Angle-bracket URLs: <https://…> (escaped as &lt;…&gt;) */
	s = s.replace(/&lt;(https?:\/\/[^&\s<>]+)&gt;/gi, (_, url) => stash(url));
	/* Bare http(s) URLs */
	s = s.replace(/(^|[\s([{\"'])(https?:\/\/[^\s<&]+)/g, (_, pre, url) => {
		const href = url.replace(/[),.]+$/u, '');
		const trail = url.slice(href.length);
		return `${pre}${stash(href)}${trail}`;
	});
	/* *bold* (Gmail plain alternative) — skip lone list markers */
	s = s.replace(
		/(^|[\s(])\*([^*\n]{1,200})\*(?=[\s),.!?:;]|$)/g,
		'$1<strong>$2</strong>'
	);
	/* _italic_ */
	s = s.replace(
		/(^|[\s(])_([^_\n]{1,200})_(?=[\s),.!?:;]|$)/g,
		'$1<em>$2</em>'
	);
	return s.replace(/\0L(\d+)\0/g, (_, i) => links[Number(i)] || '');
}

/**
 * Turn plain Gmail alternatives into safe HTML: *bold*, -/* lists, &lt;url&gt; / bare links.
 * Used when only text/plain is available.
 * @param {string} text
 */
export function plainMailToSafeHtml(text) {
	const raw = trimTrailingEmptyPlain(String(text ?? '').replace(/\r\n/g, '\n'));
	if (!raw.trim()) return '';

	const lines = raw.split('\n');
	/** @type {string[]} */
	const out = [];
	/** @type {string[]} */
	let listBuf = [];

	const flushList = () => {
		if (!listBuf.length) return;
		out.push(
			`<ul>${listBuf.map((item) => `<li>${formatPlainInline(item)}</li>`).join('')}</ul>`
		);
		listBuf = [];
	};

	for (const line of lines) {
		const bullet = line.match(/^\s*[-*]\s+(.+)$/);
		if (bullet) {
			listBuf.push(escapeHtml(bullet[1]));
			continue;
		}
		flushList();
		if (line.trim() === '') {
			out.push('<br>');
			continue;
		}
		out.push(`<div class="plain-line">${formatPlainInline(escapeHtml(line))}</div>`);
	}
	flushList();
	return out.join('');
}

/**
 * Decode common HTML entities so FR “a &eacute;crit” matches reply headers.
 * @param {string} s
 */
function decodeHtmlEntities(s) {
	return String(s || '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&#160;/g, ' ')
		.replace(/&#x0*a0;/gi, ' ')
		.replace(/&quot;/gi, '"')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&apos;/gi, "'")
		.replace(/&eacute;/gi, 'é')
		.replace(/&Eacute;/g, 'É')
		.replace(/&egrave;/gi, 'è')
		.replace(/&Egrave;/g, 'È')
		.replace(/&agrave;/gi, 'à')
		.replace(/&Agrave;/g, 'À')
		.replace(/&acirc;/gi, 'â')
		.replace(/&ocirc;/gi, 'ô')
		.replace(/&uuml;/gi, 'ü')
		.replace(/&ouml;/gi, 'ö')
		.replace(/&ccedil;/gi, 'ç')
		.replace(/&#(\d+);/g, (_, n) => {
			const code = Number(n);
			return Number.isFinite(code) ? String.fromCharCode(code) : '';
		})
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => {
			const code = parseInt(h, 16);
			return Number.isFinite(code) ? String.fromCharCode(code) : '';
		})
		.replace(/&amp;/gi, '&');
}

/** @param {string} html */
function stripHtml(html) {
	return decodeHtmlEntities(
		String(html || '')
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
	)
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** @param {string} text */
export function isForwardedMail(text) {
	return FORWARD_ANYWHERE.test(String(text || ''));
}

/**
 * Strip ZWSP / soft hyphens / NBSP variants so attribution regexes see clean text.
 * @param {string} s
 */
function normalizeMailInvisible(s) {
	return String(s || '')
		.replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, '')
		.replace(/[\u00a0\u202f\u2007\u2009\u200a]/g, ' ');
}

/** @param {string} line */
function isForwardBanner(line) {
	return FORWARD_BANNER_LINE.test(normalizeMailInvisible(line).trim());
}

/** @param {string} line */
function isReplyHeaderLine(line) {
	return REPLY_HEADER_LINE.test(normalizeMailInvisible(line).trim());
}

/** @param {string} line */
function isReplyHeaderLike(line) {
	const trim = normalizeMailInvisible(line).trim();
	return (
		isReplyHeaderLine(trim) ||
		REPLY_HEADER_PREFIX.test(trim) ||
		REPLY_HEADER_START.test(trim) ||
		WROTE_ONLY.test(trim)
	);
}

/**
 * Strip trailing blank lines from plain mail (accidental Enter keys).
 * @param {string} text
 */
export function trimTrailingEmptyPlain(text) {
	return String(text ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/(?:[ \t]*\n)+$/u, '')
		.replace(/[ \t]+$/u, '');
}

/**
 * Strip trailing empty HTML chrome: `<br>`, `<div><br></div>`, `&nbsp;`-only nodes.
 * Does not remove meaningful content.
 * @param {string} html
 */
export function trimTrailingEmptyHtml(html) {
	let s = String(html || '');
	for (let guard = 0; guard < 12; guard++) {
		const prev = s;
		s = s.replace(/(?:(?:<br\s*\/?>)|\s|&nbsp;|&#160;|&#x0*a0;)+$/gi, '');
		s = s.replace(
			/<(div|p|span|font)\b[^>]*>\s*(?:<br\s*\/?>|&nbsp;|&#160;|&#x0*a0;|\s)*<\/\1>\s*$/gi,
			''
		);
		/* Empty open wrappers left after a quote cut: …</div><div> / …<br><div> */
		s = s.replace(/(?:<br\s*\/?>|\s)*<(?:div|p|span|font)\b[^>]*>\s*$/gi, '');
		if (s === prev) break;
	}
	return s;
}

/**
 * Earliest HTML quote container (attribution wrappers + blockquote).
 * Include `gmail_attr` / `moz-cite-prefix` so attribution is not left in main.
 * @param {string} html
 */
function findHtmlQuoteIndex(html) {
	const patterns = [
		/<div\b[^>]*class\s*=\s*["'][^"']*gmail_attr[^"']*["'][^>]*>/i,
		/<div\b[^>]*class\s*=\s*["'][^"']*moz-cite-prefix[^"']*["'][^>]*>/i,
		/<blockquote\b/i,
		/<div\b[^>]*class\s*=\s*["'][^"']*gmail_quote[^"']*["'][^>]*>/i,
		/<div\b[^>]*class\s*=\s*["'][^"']*gmail_extra[^"']*["'][^>]*>/i,
		/<div\b[^>]*id\s*=\s*["']divRplyFwdMsg["'][^>]*>/i,
		/<div\b[^>]*class\s*=\s*["'][^"']*OutlookMessageHeader[^"']*["'][^>]*>/i,
		/<hr\b[^>]*class\s*=\s*["'][^"']*(?:solid|outlook)[^"']*["'][^>]*>/i
	];
	let best = -1;
	for (const re of patterns) {
		const m = html.search(re);
		if (m >= 0 && (best < 0 || m < best)) best = m;
	}
	return best;
}

/**
 * Earliest “On … wrote:” / “Le … a écrit :” in HTML, allowing soft breaks, NBSP,
 * and inline tags between tokens. Anchored at a block boundary (not mid-sentence).
 * @param {string} html
 */
function findHtmlAttributionIndex(html) {
	const s = String(html || '');
	const gap = ATTR_INLINE_GAP;
	const patterns = [
		new RegExp(
			`(?:^|>)(?:\\s|<br\\s*/?>|&nbsp;)*On\\b${gap}[\\s\\S]{2,220}?${gap}wrote${gap}:`,
			'i'
		),
		new RegExp(
			`(?:^|>)(?:\\s|<br\\s*/?>|&nbsp;)*Le\\b${gap}[\\s\\S]{2,220}?${gap}a${gap}(?:&(?:eacute|Eacute);|[ée]crit|ecrit)${gap}:`,
			'i'
		),
		new RegExp(
			`(?:^|>)(?:\\s|<br\\s*/?>|&nbsp;)*Op\\b${gap}[\\s\\S]{2,220}?${gap}schreef[\\s\\S]{0,80}?:`,
			'i'
		),
		new RegExp(
			`(?:^|>)(?:\\s|<br\\s*/?>|&nbsp;)*El\\b${gap}[\\s\\S]{2,220}?${gap}escribi[oó]${gap}:`,
			'i'
		)
	];
	let best = -1;
	for (const re of patterns) {
		const m = s.match(re);
		if (!m || m.index == null) continue;
		/* Skip the leading `>` from a prior tag close when present. */
		let idx = m.index;
		if (s[idx] === '>') idx += 1;
		while (idx < s.length && /\s/.test(s[idx])) idx += 1;
		/* Prefer the start of a nearby opening tag that wraps this text. */
		const lookBehind = s.slice(Math.max(0, idx - 80), idx);
		const open = lookBehind.match(/<(div|p|span|font|td)\b[^>]*>\s*$/i);
		if (open && open.index != null) {
			idx = Math.max(0, idx - 80) + open.index;
		}
		if (best < 0 || idx < best) best = idx;
	}
	return best;
}

/**
 * Earliest cut for HTML bodies: attribution line or quote container.
 * @param {string} html
 */
function findHtmlCutIndex(html) {
	const qAt = findHtmlQuoteIndex(html);
	const aAt = findHtmlAttributionIndex(html);
	if (aAt < 0) return qAt;
	if (qAt < 0) return aAt;
	return Math.min(aAt, qAt);
}

/**
 * Fold from the first attribution / soft-wrap pair anywhere in main (not only the
 * trailing line). Everything from that line onward joins the quoted region.
 * @param {string} main
 * @param {string} quoted
 * @returns {{ main: string, quoted: string } | null}
 */
function foldAttributionFromMain(main, quoted) {
	const lines = normalizeMailInvisible(String(main ?? ''))
		.replace(/\r\n/g, '\n')
		.split('\n');
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		const trim = lines[i].trim();
		if (!trim) continue;
		if (isReplyHeaderLine(trim) || REPLY_HEADER_PREFIX.test(trim)) {
			start = i;
			break;
		}
		if (
			REPLY_HEADER_START.test(trim) &&
			i + 1 < lines.length &&
			WROTE_ONLY.test(lines[i + 1].trim())
		) {
			start = i;
			break;
		}
	}
	if (start < 0) return null;
	const peeled = lines.slice(start).join('\n');
	const nextMain = trimTrailingEmptyPlain(lines.slice(0, start).join('\n'));
	const nextQuoted = quoted ? `${peeled}\n${quoted}` : peeled;
	return { main: nextMain, quoted: nextQuoted };
}

/**
 * Move a trailing “On … wrote:” / “Le … a écrit :” line (or soft-wrapped pair)
 * from main into quoted so attribution never stays in the collapsed preview.
 * @param {string} main
 * @param {string} quoted
 * @returns {{ main: string, quoted: string } | null}
 */
function peelTrailingReplyHeader(main, quoted) {
	/* Prefer any in-main attribution (handles text between attr and quote cut). */
	const anywhere = foldAttributionFromMain(main, quoted);
	if (anywhere) return anywhere;

	const lines = normalizeMailInvisible(String(main ?? ''))
		.replace(/\r\n/g, '\n')
		.split('\n');
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
	if (!lines.length) return null;

	let start = -1;
	const last = lines[lines.length - 1].trim();
	if (isReplyHeaderLine(last) || REPLY_HEADER_PREFIX.test(last)) {
		start = lines.length - 1;
	} else if (
		lines.length >= 2 &&
		WROTE_ONLY.test(last) &&
		REPLY_HEADER_START.test(lines[lines.length - 2].trim())
	) {
		start = lines.length - 2;
	}
	if (start < 0) return null;

	const peeled = lines.slice(start).join('\n');
	const nextMain = trimTrailingEmptyPlain(lines.slice(0, start).join('\n'));
	const nextQuoted = quoted ? `${peeled}\n${quoted}` : peeled;
	return { main: nextMain, quoted: nextQuoted };
}

/**
 * Drop trailing attribution from htmlMain after a plain peel — Gmail/Outlook
 * wrappers, bare “On … wrote:” / “Le … a écrit :” blocks, and empty <br> tails.
 * @param {string} html
 * @returns {string}
 */
function peelHtmlTrailingAttr(html) {
	let s = String(html || '');

	const gmailRe =
		/(?:(?:<br\s*\/?>)|\s)*<(?:div|p)\b[^>]*class\s*=\s*["'][^"']*(?:gmail_attr|OutlookMessageHeader|moz-cite-prefix)[^"']*["'][^>]*>[\s\S]*$/i;
	const gmail = s.match(gmailRe);
	if (gmail && gmail.index != null && gmail.index > 0) {
		s = s.slice(0, gmail.index);
	}

	/* If an attribution still sits somewhere in the tail, cut from its start. */
	const attrAt = findHtmlAttributionIndex(s);
	if (attrAt > 0) {
		const before = stripHtml(s.slice(0, attrAt)).trim();
		if (before) s = s.slice(0, attrAt);
	}

	s = trimTrailingEmptyHtml(s);

	/*
	 * Peel a trailing leaf block whose text is a reply attribution
	 * (Apple / Thunderbird often emit a plain <div>On … wrote:</div> before
	 * <blockquote>, without gmail_attr).
	 */
	for (let guard = 0; guard < 8; guard++) {
		const m = s.match(
			/(?:(?:<br\s*\/?>)|\s)*<(div|p|span|font|td)\b([^>]*)>([\s\S]*?)<\/\1>\s*$/i
		);
		if (!m || m.index == null || m.index <= 0) break;
		const innerText = normalizeMailInvisible(stripHtml(m[3])).trim();
		if (!innerText) {
			s = trimTrailingEmptyHtml(s.slice(0, m.index));
			continue;
		}
		if (isReplyHeaderLine(innerText) || REPLY_HEADER_PREFIX.test(innerText)) {
			s = trimTrailingEmptyHtml(s.slice(0, m.index));
			continue;
		}
		break;
	}

	/* Bare text attribution after the last tag: …</div>On … wrote:<br> */
	const bare = s.match(
		/(?:(?:<br\s*\/?>)|\s)*((?:On|Le|Op|El)\b[\s\S]{0,220}(?:wrote|a\s+(?:[ée]crit|ecrit)|schreef|escribi[oó])\s*:)\s*(?:(?:<br\s*\/?>)|\s)*$/i
	);
	if (bare && bare.index != null && bare.index > 0) {
		const peeled = normalizeMailInvisible(decodeHtmlEntities(bare[1])).trim();
		if (isReplyHeaderLine(peeled) || REPLY_HEADER_PREFIX.test(peeled)) {
			s = trimTrailingEmptyHtml(s.slice(0, bare.index));
		}
	}

	return trimTrailingEmptyHtml(s);
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
		/\b(?:wrote|[ée]crit|ecrit|schreef|escribi[oó]|scritto)\s*:/i.test(head)
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
	const lines = normalizeMailInvisible(text).split('\n');
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
	if (start === 0) return { main: '', quoted: lines.join('\n') };
	return {
		main: trimTrailingEmptyPlain(lines.slice(0, start).join('\n')),
		quoted: lines.slice(start).join('\n')
	};
}

/**
 * Split body into new reply vs quoted tail.
 * Quoted always runs through end of body (full prior citation, not a snippet).
 * Attribution (“On … wrote:” / “Le … a écrit”) always starts the quoted region —
 * including when it sits mid-body before a blockquote / `>` tail.
 * Pure forwards / empty-main splits are never collapsible.
 * @param {string} body
 * @returns {{ main: string, quoted: string, collapsible: boolean, htmlMain: string }}
 */
export function splitMailQuote(body) {
	const raw = String(body ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	if (!raw.trim()) return { main: '', quoted: '', collapsible: false, htmlMain: '' };

	const asHtml = isHtmlMailBody(raw);
	/** @type {string} */
	let plainSource = asHtml
		? normalizeMailInvisible(stripHtml(raw))
		: normalizeMailInvisible(
				/&(?:[a-z]+|#(?:\d+|x[0-9a-f]+));/i.test(raw) ? decodeHtmlEntities(raw) : raw
			);

	let main = plainSource;
	let quoted = '';
	/** HTML slice before quote (when body is HTML) — keep rich main for rendering. */
	let htmlMain = '';
	let fromHtml = false;

	if (asHtml) {
		const cut = findHtmlCutIndex(raw);
		if (cut > 0) {
			htmlMain = raw.slice(0, cut);
			main = normalizeMailInvisible(stripHtml(htmlMain));
			quoted = normalizeMailInvisible(stripHtml(raw.slice(cut)));
			fromHtml = true;
		} else if (cut === 0) {
			/* Entire body is a quote/attr container — don't collapse to empty. */
			return {
				main: trimTrailingEmptyPlain(stripHtml(raw)),
				quoted: '',
				collapsible: false,
				htmlMain: ''
			};
		}
	}

	/*
	 * Authoritative plain split: earliest “On … wrote:” wins even when an early
	 * HTML <blockquote> (inline cite) would have cut too soon.
	 */
	const viaPlain = splitViaReplyParser(plainSource) || splitViaLineScan(plainSource);
	if (viaPlain) {
		const plainMain = viaPlain.main;
		const plainQuoted = viaPlain.quoted;
		/* Prefer the earlier attribution boundary. */
		if (
			!quoted.trim() ||
			plainMain.length < main.length ||
			(quotedLooksLikeReply(plainQuoted) && !quotedLooksLikeReply(quoted))
		) {
			main = plainMain;
			quoted = plainQuoted;
			if (asHtml && fromHtml) {
				/* Re-cut htmlMain to the plain attribution when it is earlier. */
				const attrAt = findHtmlAttributionIndex(raw);
				const qAt = findHtmlQuoteIndex(raw);
				let cut = -1;
				if (attrAt >= 0 && qAt >= 0) cut = Math.min(attrAt, qAt);
				else cut = attrAt >= 0 ? attrAt : qAt;
				if (cut > 0) {
					htmlMain = raw.slice(0, cut);
					fromHtml = true;
				} else {
					htmlMain = '';
					fromHtml = false;
				}
			} else if (!fromHtml) {
				htmlMain = '';
			}
		}
	}

	if (quoted.trim()) {
		const peeled = peelTrailingReplyHeader(main, quoted);
		if (peeled) {
			main = peeled.main;
			quoted = peeled.quoted;
		}
		if (htmlMain) {
			htmlMain = peelHtmlTrailingAttr(htmlMain);
			if (normalizeMailInvisible(stripHtml(htmlMain)).trim() !== normalizeMailInvisible(main).trim()) {
				htmlMain = '';
			}
		}
	} else if (fromHtml && !/<blockquote/i.test(raw) && findHtmlAttributionIndex(raw) < 0) {
		/* HTML wrapper without a real attribution — keep full body visible. */
		return {
			main: trimTrailingEmptyPlain(stripHtml(raw)),
			quoted: '',
			collapsible: false,
			htmlMain: ''
		};
	}

	main = trimTrailingEmptyPlain(main);
	quoted = String(quoted || '').replace(/^\n+/, '');
	quoted = trimTrailingEmptyPlain(quoted);
	if (htmlMain) htmlMain = trimTrailingEmptyHtml(htmlMain);

	if (!quoted.trim()) {
		return {
			main: trimTrailingEmptyPlain(asHtml ? stripHtml(raw) : plainSource),
			quoted: '',
			collapsible: false,
			htmlMain: ''
		};
	}

	const firstQuoted = quoted
		.split('\n')
		.map((l) => l.trim())
		.find(Boolean);
	const firstPlain = plainSource
		.split('\n')
		.map((l) => l.trim())
		.find(Boolean);
	const pureForward =
		isForwardBanner(firstQuoted || '') ||
		(isForwardBanner(firstPlain || '') && !quotedLooksLikeReply(quoted));

	if (pureForward) {
		return {
			main: trimTrailingEmptyPlain(asHtml ? stripHtml(raw) : plainSource),
			quoted: '',
			collapsible: false,
			htmlMain: ''
		};
	}
	if (!main.trim()) {
		/* Attribution-only / quote-only body — show full text, no empty collapse. */
		return {
			main: trimTrailingEmptyPlain(asHtml ? stripHtml(raw) : plainSource),
			quoted: '',
			collapsible: false,
			htmlMain: ''
		};
	}

	/* Final safety: never leave an attribution line in visible main. */
	const safety = foldAttributionFromMain(main, quoted);
	if (safety) {
		main = trimTrailingEmptyPlain(safety.main);
		quoted = trimTrailingEmptyPlain(safety.quoted);
		if (htmlMain) {
			htmlMain = peelHtmlTrailingAttr(htmlMain);
			if (normalizeMailInvisible(stripHtml(htmlMain)).trim() !== normalizeMailInvisible(main).trim()) {
				htmlMain = '';
			} else {
				htmlMain = trimTrailingEmptyHtml(htmlMain);
			}
		}
		if (!main.trim()) {
			return {
				main: trimTrailingEmptyPlain(asHtml ? stripHtml(raw) : plainSource),
				quoted: '',
				collapsible: false,
				htmlMain: ''
			};
		}
	}

	return { main, quoted, collapsible: true, htmlMain };
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
