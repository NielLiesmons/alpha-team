/**
 * Infer chat/Drive attachment kind when `kind` or MIME is missing
 * (common for camera-roll files with empty `File.type`).
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif|tiff?|svg)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i;

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
	if (/\.webm$/i.test(n)) return 'video/webm';
	if (/\.mov$/i.test(n)) return 'video/quicktime';
	if (/\.mp3$/i.test(n)) return 'audio/mpeg';
	if (/\.m4a$/i.test(n)) return 'audio/mp4';
	if (/\.ogg$/i.test(n)) return 'audio/ogg';
	if (/\.wav$/i.test(n)) return 'audio/wav';
	return ct || 'application/octet-stream';
}

/**
 * @param {{ kind?: string, content_type?: string, name?: string, path?: string } | null | undefined} att
 * @returns {'image' | 'video' | 'voice' | 'file'}
 */
export function inferMediaKind(att) {
	if (!att || typeof att !== 'object') return 'file';
	const declared = String(att.kind || '');
	if (declared === 'image' || declared === 'video' || declared === 'voice') return declared;

	const ct = String(att.content_type || '').toLowerCase();
	if (ct.startsWith('image/')) return 'image';
	if (ct.startsWith('video/')) return 'video';
	if (ct.startsWith('audio/')) return 'voice';

	const name = String(att.name || '');
	const path = String(att.path || '');
	const probe = `${name} ${path.split('/').pop() || ''}`;
	if (IMAGE_EXT.test(probe)) return 'image';
	if (VIDEO_EXT.test(probe)) return 'video';
	if (AUDIO_EXT.test(probe) && !/\.webm$/i.test(probe)) return 'voice';
	/* bare .webm: prefer video unless kind/content already said audio */
	if (/\.webm$/i.test(probe)) return 'video';

	return declared === 'file' ? 'file' : 'file';
}

/**
 * True when the Drive path is a chunked media manifest (not a raw leaf).
 * @param {string} path
 */
export function isMediaManifestPath(path) {
	return String(path || '').endsWith('media.json');
}
