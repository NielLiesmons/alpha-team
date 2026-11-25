/**
 * Infer chat/Drive attachment kind when `kind` or MIME is missing
 * (common for camera-roll files with empty `File.type`).
 *
 * Voice clips live under `media/audio/clips/{id}/media.json` with names like
 * `voice-{ts}.webm`. Extension sniffing must check name / path leaf separately —
 * a combined `"voice.webm media.json"` probe never matches `$`-anchored ext regexes
 * and used to fall through to `file` (filename chip) on receive.
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif|tiff?|svg)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i;
const VOICE_NAME = /^voice[-_]/i;

/**
 * @param {string} [name]
 * @param {string} [contentType]
 */
export function mimeFromNameAndType(name = '', contentType = '') {
	const ct = String(contentType || '').toLowerCase().trim();
	if (ct && ct !== 'application/octet-stream') return ct;
	const n = String(name || '').toLowerCase();
	if (/\.jpe?g$/i.test(n)) return 'image/jpeg';
	if (/\.png$/i.test(n)) return 'image/png';
	if (/\.gif$/i.test(n)) return 'image/gif';
	if (/\.webp$/i.test(n)) return 'image/webp';
	if (/\.avif$/i.test(n)) return 'image/avif';
	if (/\.heic$/i.test(n)) return 'image/heic';
	if (/\.heif$/i.test(n)) return 'image/heif';
	if (/\.svg$/i.test(n)) return 'image/svg+xml';
	if (/\.mp4$/i.test(n)) return 'video/mp4';
	/* Chat voice recorder names clips voice-*.webm — prefer audio over video/webm. */
	if (/\.webm$/i.test(n)) return VOICE_NAME.test(n) ? 'audio/webm' : 'video/webm';
	if (/\.mov$/i.test(n)) return 'video/quicktime';
	if (/\.mp3$/i.test(n)) return 'audio/mpeg';
	if (/\.m4a$/i.test(n)) return 'audio/mp4';
	if (/\.ogg$/i.test(n) || /\.opus$/i.test(n)) return 'audio/ogg';
	if (/\.wav$/i.test(n)) return 'audio/wav';
	return ct || 'application/octet-stream';
}

/**
 * @param {string} name
 * @param {string} path
 * @returns {'image' | 'video' | 'voice' | null}
 */
function kindFromPathLayout(name, path) {
	const p = String(path || '');
	if (p.includes('/audio/clips/') || p.startsWith('media/audio/clips/')) return 'voice';
	if (p.includes('/audio/tracks/') || p.startsWith('media/audio/tracks/')) return 'voice';
	if (p.includes('/photos/') || p.startsWith('media/photos/')) return 'image';
	if (p.includes('/video/items/') || p.startsWith('media/video/items/')) return 'video';
	const n = String(name || '');
	if (VOICE_NAME.test(n) && AUDIO_EXT.test(n)) return 'voice';
	return null;
}

/**
 * @param {string} probe
 * @returns {'image' | 'video' | 'voice' | null}
 */
function kindFromExt(probe) {
	const s = String(probe || '');
	if (!s) return null;
	if (IMAGE_EXT.test(s)) return 'image';
	if (AUDIO_EXT.test(s) && !/\.webm$/i.test(s)) return 'voice';
	if (VOICE_NAME.test(s) && /\.webm$/i.test(s)) return 'voice';
	if (VIDEO_EXT.test(s)) return 'video';
	if (/\.webm$/i.test(s)) return 'video';
	return null;
}

/**
 * @param {{ kind?: string, content_type?: string, name?: string, path?: string } | null | undefined} att
 * @returns {'image' | 'video' | 'voice' | 'file'}
 */
export function inferMediaKind(att) {
	if (!att || typeof att !== 'object') return 'file';
	const declared = String(att.kind || '');
	if (declared === 'image' || declared === 'video' || declared === 'voice') return declared;

	const name = String(att.name || '');
	const path = String(att.path || '');
	const fromPath = kindFromPathLayout(name, path);
	if (fromPath) return fromPath;

	const ct = String(att.content_type || '').toLowerCase();
	if (ct.startsWith('image/')) return 'image';
	if (ct.startsWith('audio/')) return 'voice';
	if (ct.startsWith('video/')) {
		/* video/webm + voice-* name (or audio clip path already handled) → voice */
		if (VOICE_NAME.test(name) && /\.webm$/i.test(name)) return 'voice';
		return 'video';
	}

	/* Check name and path leaf separately — never concatenate (breaks $ anchors). */
	const leaf = path.split('/').pop() || '';
	const fromName = kindFromExt(name);
	if (fromName) return fromName;
	const fromLeaf = kindFromExt(leaf);
	if (fromLeaf) return fromLeaf;

	return 'file';
}

/**
 * Re-stamp kind / content_type so bus hints and tip-wake rows render the same
 * bubble as the sender (voice player, not filename / image skeleton).
 * @param {any} att
 */
export function normalizeChatAttachment(att) {
	if (!att || typeof att !== 'object') return att;
	const kind = inferMediaKind(att);
	let content_type =
		mimeFromNameAndType(att.name, att.content_type) ||
		String(att.content_type || 'application/octet-stream');
	if (kind === 'voice' && !String(content_type).toLowerCase().startsWith('audio/')) {
		content_type = mimeFromNameAndType(att.name, 'audio/webm');
	}
	if (att.kind === kind && String(att.content_type || '') === content_type) return att;
	return { ...att, kind, content_type };
}

/**
 * True when the Drive path is a chunked media manifest (not a raw leaf).
 * @param {string} path
 */
export function isMediaManifestPath(path) {
	return String(path || '').endsWith('media.json');
}
