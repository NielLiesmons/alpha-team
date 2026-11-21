/**
 * Detect emoji-only chat bodies (1–3 glyphs / custom shortcodes) and tokenize
 * message text for unicode + custom emoji rendering.
 */

const SHORTCODE_RE = /:([a-z0-9_]{2,32}):/gi;
const EMOJI_START_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;

/**
 * @param {string} grapheme
 */
function isEmojiGrapheme(grapheme) {
	const g = String(grapheme || '');
	if (!g || /^\s$/.test(g)) return false;
	if (EMOJI_START_RE.test(g)) return true;
	/* digits/keycaps etc. */
	return /\p{Emoji}/u.test(g) && !/^[0-9#*]$/u.test(g);
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function graphemes(text) {
	const t = String(text || '');
	if (!t) return [];
	if (typeof Intl !== 'undefined' && Intl.Segmenter) {
		return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map(
			(s) => s.segment
		);
	}
	return [...t];
}

/**
 * True when the whole trimmed body is 1–3 emoji (unicode and/or :shortcodes:).
 * @param {string | null | undefined} body
 * @returns {{ count: number, tokens: string[] } | null}
 */
export function emojiOnlyInfo(body) {
	const raw = String(body || '').trim();
	if (!raw) return null;

	/** @type {string[]} */
	const tokens = [];
	let i = 0;
	while (i < raw.length) {
		if (/\s/.test(raw[i])) {
			i += 1;
			continue;
		}
		const short = raw.slice(i).match(/^:([a-z0-9_]{2,32}):/i);
		if (short) {
			tokens.push(short[0].toLowerCase());
			i += short[0].length;
			continue;
		}
		const rest = graphemes(raw.slice(i));
		const g = rest[0];
		if (!g || !isEmojiGrapheme(g)) return null;
		tokens.push(g);
		i += g.length;
	}

	if (tokens.length < 1 || tokens.length > 3) return null;
	return { count: tokens.length, tokens };
}

/**
 * @typedef {{ email: string, name?: string }} MentionPerson
 * @typedef {{
 *   type: 'text' | 'emoji' | 'custom' | 'mention' | 'link',
 *   value: string,
 *   email?: string,
 *   label?: string,
 *   href?: string
 * }} ChatBodyToken
 */

const URL_START_RE = /^https?:\/\//i;
/** Bare http(s) URL — trim common trailing punctuation after the match. */
const URL_BODY_RE = /^https?:\/\/[^\s<>"'`]+/i;

/**
 * Safe http(s) href only — rejects javascript: and other schemes.
 * @param {string} raw
 * @returns {string | null}
 */
export function safeHttpHref(raw) {
	const s = String(raw || '').trim();
	if (!URL_START_RE.test(s)) return null;
	try {
		const u = new URL(s);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
		return u.href;
	} catch {
		return null;
	}
}

/**
 * @param {string} matched
 */
function trimUrlMatch(matched) {
	let url = String(matched || '');
	/* Drop trailing sentence punctuation not part of the URL. */
	url = url.replace(/[.,;:!?]+$/g, '');
	while (url.endsWith(')')) {
		const opens = (url.match(/\(/g) || []).length;
		const closes = (url.match(/\)/g) || []).length;
		if (closes <= opens) break;
		url = url.slice(0, -1);
	}
	return url;
}

/**
 * Build compact-name → person lookup for `@Mentions` (spaces stripped on insert).
 * @param {MentionPerson[]} people
 */
export function mentionLookup(people) {
	/** @type {Map<string, MentionPerson>} */
	const map = new Map();
	for (const p of people || []) {
		const email = String(p.email || '')
			.trim()
			.toLowerCase();
		const name = String(p.name || '').trim();
		if (name) map.set(name.replace(/\s+/g, '').toLowerCase(), { email, name });
		if (email) {
			const local = email.split('@')[0];
			if (local && !map.has(local)) map.set(local, { email, name: name || local });
		}
	}
	return map;
}

/**
 * Split body into text / unicode-emoji / custom-shortcode / @mention tokens.
 * @param {string | null | undefined} body
 * @param {{ people?: MentionPerson[] }} [opts]
 * @returns {ChatBodyToken[]}
 */
export function tokenizeChatBody(body, opts = {}) {
	const raw = String(body ?? '');
	if (!raw) return [];

	const peopleMap = mentionLookup(opts.people || []);

	/** @type {ChatBodyToken[]} */
	const out = [];
	let i = 0;
	while (i < raw.length) {
		const short = raw.slice(i).match(/^:([a-z0-9_]{2,32}):/i);
		if (short) {
			out.push({ type: 'custom', value: short[0].toLowerCase() });
			i += short[0].length;
			continue;
		}

		/* http(s) URLs → link tokens (never javascript:) */
		if (raw[i] === 'h' || raw[i] === 'H') {
			const m = raw.slice(i).match(URL_BODY_RE);
			if (m) {
				const matched = trimUrlMatch(m[0]);
				const href = safeHttpHref(matched);
				if (href) {
					out.push({ type: 'link', value: matched, href });
					i += matched.length;
					continue;
				}
			}
		}

		/* @mention — only when it resolves to a known person */
		if (raw[i] === '@') {
			const m = raw.slice(i).match(/^@([A-Za-z0-9._\-]+)/);
			if (m) {
				const person = peopleMap.get(m[1].toLowerCase());
				if (person) {
					out.push({
						type: 'mention',
						value: m[0],
						email: person.email,
						label: person.name || m[1]
					});
					i += m[0].length;
					continue;
				}
			}
		}

		const g = graphemes(raw.slice(i))[0];
		if (!g) break;
		if (isEmojiGrapheme(g)) {
			out.push({ type: 'emoji', value: g });
		} else {
			const last = out[out.length - 1];
			if (last?.type === 'text') last.value += g;
			else out.push({ type: 'text', value: g });
		}
		i += g.length;
	}
	return out;
}

/**
 * Normalize a custom shortcode to `:name:`.
 * @param {string} nameOrCode
 */
export function customEmojiShortcode(nameOrCode) {
	const raw = String(nameOrCode || '')
		.trim()
		.toLowerCase();
	const name = raw.replace(/^:|:$/g, '');
	if (!/^[a-z0-9_]{2,32}$/.test(name)) return '';
	return `:${name}:`;
}

/**
 * @param {string} reaction
 */
export function isCustomEmojiToken(reaction) {
	return /^:[a-z0-9_]{2,32}:$/i.test(String(reaction || '').trim());
}

export { SHORTCODE_RE };
