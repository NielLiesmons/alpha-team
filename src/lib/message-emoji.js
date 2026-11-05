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
 * Split body into text / unicode-emoji / custom-shortcode tokens for rendering.
 * @param {string | null | undefined} body
 * @returns {{ type: 'text' | 'emoji' | 'custom', value: string }[]}
 */
export function tokenizeChatBody(body) {
	const raw = String(body ?? '');
	if (!raw) return [];

	/** @type {{ type: 'text' | 'emoji' | 'custom', value: string }[]} */
	const out = [];
	let i = 0;
	while (i < raw.length) {
		const short = raw.slice(i).match(/^:([a-z0-9_]{2,32}):/i);
		if (short) {
			out.push({ type: 'custom', value: short[0].toLowerCase() });
			i += short[0].length;
			continue;
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
