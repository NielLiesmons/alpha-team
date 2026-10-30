/**
 * Lightweight tag readers for Player upload (ID3v2 + iTunes/MP4 atoms).
 * Falls back to filename heuristics when tags are missing/stripped.
 * Also extracts embedded artwork (APIC/PIC/covr) and probes duration.
 */

/**
 * Strip a leading track index from a title/filename stem.
 * "01 Songname", "01. Songname", "01 - Songname", "1_Songname"
 * @param {string} raw
 * @returns {{ title: string, track_no: number | null }}
 */
export function stripLeadingTrackNo(raw) {
	const t = String(raw ?? '').trim();
	if (!t) return { title: 'Untitled', track_no: null };
	const m = t.match(/^(\d{1,3})(?:\s*[.\-_]\s*|\s+)(.+)$/);
	if (!m) return { title: t, track_no: null };
	const n = parseInt(m[1], 10);
	const title = m[2].trim();
	if (!title || !Number.isFinite(n) || n < 1) return { title: t, track_no: null };
	return { title, track_no: n };
}

/**
 * @param {string} filename
 */
export function parseAudioFilename(filename) {
	const base = filename.replace(/\.[^.]+$/, '').trim() || 'Untitled';
	const stripped = stripLeadingTrackNo(base);
	let rest = stripped.title;
	/** @type {number | null} */
	let track_no = stripped.track_no;
	const m = rest.match(/^(.+?)\s*[-–—]\s*(.+)$/);
	if (m) {
		return { artists: [m[1].trim()], title: m[2].trim(), album: '', track_no, disc_no: null };
	}
	return { artists: ['Unknown'], title: rest, album: '', track_no, disc_no: null };
}

/**
 * @param {string | undefined} raw
 * @returns {number | null}
 */
function parseTrackPart(raw) {
	if (!raw) return null;
	const m = String(raw).match(/(\d+)/);
	if (!m) return null;
	const n = parseInt(m[1], 10);
	return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * @typedef {{
 *   title: string,
 *   artists: string[],
 *   album: string,
 *   track_no: number | null,
 *   disc_no: number | null,
 *   artwork?: { mime: string, bytes: Uint8Array } | null,
 *   duration_ms?: number | null
 * }} AudioMeta
 */

/**
 * @param {File} file
 * @returns {Promise<AudioMeta>}
 */
export async function readAudioTags(file) {
	const fromName = parseAudioFilename(file.name);
	/** @type {AudioMeta} */
	let meta = {
		title: fromName.title,
		artists: fromName.artists,
		album: fromName.album,
		track_no: fromName.track_no,
		disc_no: fromName.disc_no,
		artwork: null,
		duration_ms: null
	};
	try {
		// Artwork can sit late in large ID3 tags — read up to 4MB of prefix.
		const head = new Uint8Array(await file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer());
		const tagged = readId3v2(head) || readMp4Tags(head);
		if (tagged) {
			const fromTag = stripLeadingTrackNo(tagged.title || fromName.title);
			meta = {
				title: fromTag.title || fromName.title,
				artists:
					tagged.artists?.length && tagged.artists[0] !== 'Unknown'
						? tagged.artists
						: fromName.artists,
				album: tagged.album || fromName.album,
				track_no: tagged.track_no ?? fromTag.track_no ?? fromName.track_no,
				disc_no: tagged.disc_no ?? fromName.disc_no,
				artwork: tagged.artwork ?? null,
				duration_ms: null
			};
		}
	} catch {
		/* keep filename meta */
	}
	try {
		meta.duration_ms = await probeDurationMs(file);
	} catch {
		meta.duration_ms = null;
	}
	return meta;
}

/**
 * Strip ID3v2 (start) + ID3v1 (end) so the first media chunk is real MPEG frames.
 * Large embedded artwork otherwise fills the first 256KB and blocks progressive play.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function stripId3Containers(bytes) {
	let start = 0;
	let end = bytes.length;
	if (end >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
		const tagSize = synchsafe32(bytes, 6);
		const header = 10 + tagSize;
		// v2.4 footer
		const hasFooter = (bytes[5] & 0x10) !== 0;
		start = Math.min(end, header + (hasFooter ? 10 : 0));
	}
	if (end - start >= 128) {
		const tag = end - 128;
		if (bytes[tag] === 0x54 && bytes[tag + 1] === 0x41 && bytes[tag + 2] === 0x47) {
			end = tag;
		}
	}
	if (start === 0 && end === bytes.length) return bytes;
	if (start >= end) return bytes;
	return bytes.subarray(start, end);
}

/**
 * True when buffer contains an MPEG frame sync (0xFFEx).
 * @param {Uint8Array} bytes
 */
export function hasMpegFrameSync(bytes) {
	const n = bytes.length - 1;
	for (let i = 0; i < n; i++) {
		if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) return true;
	}
	return false;
}

/**
 * Sniff container from plaintext prefix (after optional ID3).
 * Helps when upload content_type is wrong (CD rips, Finder, etc.).
 * @param {Uint8Array} bytes
 * @returns {'mp3' | 'mp4' | 'flac' | 'ogg' | 'wav' | 'aac' | 'unknown'}
 */
export function sniffAudioKind(bytes) {
	if (!bytes?.length) return 'unknown';
	let o = 0;
	/* Skip ID3v2 so we see the real payload. */
	if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
		const size =
			((bytes[6] & 0x7f) << 21) |
			((bytes[7] & 0x7f) << 14) |
			((bytes[8] & 0x7f) << 7) |
			(bytes[9] & 0x7f);
		o = Math.min(bytes.length, 10 + size);
	}
	const b0 = bytes[o];
	const b1 = bytes[o + 1];
	const b2 = bytes[o + 2];
	const b3 = bytes[o + 3];
	if (b0 === undefined) return 'unknown';
	/* fLaC */
	if (b0 === 0x66 && b1 === 0x4c && b2 === 0x61 && b3 === 0x43) return 'flac';
	/* OggS */
	if (b0 === 0x4f && b1 === 0x67 && b2 === 0x67 && b3 === 0x53) return 'ogg';
	/* RIFF....WAVE */
	if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return 'wav';
	/* ....ftyp (MP4/M4A) */
	if (bytes.length >= o + 8) {
		const tag = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
		if (tag === 'ftyp') return 'mp4';
	}
	/* ADTS AAC */
	if (b0 === 0xff && b1 !== undefined && (b1 & 0xf6) === 0xf0) return 'aac';
	/* MPEG frame sync */
	if (hasMpegFrameSync(bytes.subarray(o))) return 'mp3';
	return 'unknown';
}

/**
 * @param {'mp3' | 'mp4' | 'flac' | 'ogg' | 'wav' | 'aac' | 'unknown'} kind
 */
export function mimeForAudioKind(kind) {
	if (kind === 'mp3') return 'audio/mpeg';
	if (kind === 'mp4' || kind === 'aac') return 'audio/mp4';
	if (kind === 'flac') return 'audio/flac';
	if (kind === 'ogg') return 'audio/ogg';
	if (kind === 'wav') return 'audio/wav';
	return 'application/octet-stream';
}

/**
 * Browser metadata probe — works for anything <audio> can decode.
 * @param {File | Blob} file
 * @returns {Promise<number | null>}
 */
export function probeDurationMs(file) {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const audio = new Audio();
		let settled = false;
		/** @param {number | null} ms */
		const finish = (ms) => {
			if (settled) return;
			settled = true;
			URL.revokeObjectURL(url);
			audio.removeAttribute('src');
			audio.load();
			resolve(ms);
		};
		audio.preload = 'metadata';
		audio.onloadedmetadata = () => {
			const d = audio.duration;
			finish(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null);
		};
		audio.onerror = () => finish(null);
		setTimeout(() => finish(null), 10000);
		audio.src = url;
	});
}

/**
 * @param {Uint8Array} bytes
 * @returns {{
 *   title?: string,
 *   artists?: string[],
 *   album?: string,
 *   track_no?: number | null,
 *   disc_no?: number | null,
 *   artwork?: { mime: string, bytes: Uint8Array } | null
 * } | null}
 */
function readId3v2(bytes) {
	if (bytes.length < 10) return null;
	if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null; // ID3
	const ver = bytes[3];
	if (ver < 2 || ver > 4) return null;
	const tagSize = synchsafe32(bytes, 6);
	const end = Math.min(bytes.length, 10 + tagSize);
	/** @type {Record<string, string>} */
	const frames = {};
	/** @type {{ mime: string, bytes: Uint8Array } | null} */
	let artwork = null;
	let off = 10;
	// skip extended header if present (v3/v4)
	if (bytes[5] & 0x40) {
		if (ver >= 4) {
			const size = synchsafe32(bytes, off);
			off += size;
		} else {
			const size = u32(bytes, off);
			off += 4 + size;
		}
	}
	while (off + 10 <= end) {
		let id;
		let size;
		let header = 10;
		if (ver === 2) {
			id = ascii(bytes, off, 3);
			size = (bytes[off + 3] << 16) | (bytes[off + 4] << 8) | (bytes[off + 5]);
			header = 6;
			if (!/^[A-Z0-9]{3}$/.test(id) || size <= 0) break;
		} else {
			id = ascii(bytes, off, 4);
			size = ver === 4 ? synchsafe32(bytes, off + 4) : u32(bytes, off + 4);
			header = 10;
			if (!/^[A-Z0-9]{4}$/.test(id) || size <= 0) break;
		}
		const dataStart = off + header;
		const dataEnd = dataStart + size;
		if (dataEnd > end) break;
		const payload = bytes.subarray(dataStart, dataEnd);
		if ((id === 'APIC' || id === 'PIC') && !artwork) {
			artwork = parseId3Picture(payload, ver);
		} else if (id !== 'APIC' && id !== 'PIC' && id !== 'PRIV' && id !== 'GEOB') {
			const text = decodeId3Text(payload, ver);
			if (text) frames[id] = text;
		}
		off = dataEnd;
	}

	const title = frames.TIT2 || frames.TT2;
	const artist = frames.TPE1 || frames.TP1 || frames.TPE2 || frames.TP2;
	const album = frames.TALB || frames.TAL;
	const track_no = parseTrackPart(frames.TRCK || frames.TRK);
	const disc_no = parseTrackPart(frames.TPOS || frames.TPA);
	if (!title && !artist && !album && track_no == null && !artwork) return null;
	return {
		title: title || undefined,
		artists: artist ? splitArtists(artist) : undefined,
		album: album || undefined,
		track_no,
		disc_no,
		artwork
	};
}

/**
 * @param {Uint8Array} data
 * @param {number} ver
 * @returns {{ mime: string, bytes: Uint8Array } | null}
 */
function parseId3Picture(data, ver) {
	if (data.length < 4) return null;
	const encoding = data[0];
	let o = 1;
	/** @type {string} */
	let mime;
	if (ver === 2) {
		// PIC: 3-char image format ("JPG", "PNG", …)
		const fmt = ascii(data, o, 3).toUpperCase();
		o += 3;
		mime = fmt === 'PNG' ? 'image/png' : fmt === 'JPG' || fmt === 'JPEG' ? 'image/jpeg' : `image/${fmt.toLowerCase()}`;
	} else {
		const nul = indexOfByte(data, 0, o);
		if (nul < 0) return null;
		mime = cleanText(new TextDecoder('latin1').decode(data.subarray(o, nul))).toLowerCase() || 'image/jpeg';
		o = nul + 1;
		if (mime === 'image/jpg') mime = 'image/jpeg';
		if (!mime.includes('/')) mime = `image/${mime}`;
	}
	if (o >= data.length) return null;
	o += 1; // picture type
	// description (encoding-terminated)
	const descEnd = skipId3EncodedString(data, o, encoding);
	if (descEnd < 0 || descEnd >= data.length) return null;
	const pic = data.subarray(descEnd);
	if (pic.length < 32) return null;
	return { mime, bytes: pic.slice() };
}

/**
 * @param {Uint8Array} data
 * @param {number} start
 * @param {number} encoding
 */
function skipId3EncodedString(data, start, encoding) {
	if (encoding === 0 || encoding === 3) {
		const nul = indexOfByte(data, 0, start);
		return nul < 0 ? -1 : nul + 1;
	}
	// UTF-16: terminated by 0x00 0x00
	for (let i = start; i + 1 < data.length; i += 2) {
		if (data[i] === 0 && data[i + 1] === 0) return i + 2;
	}
	return -1;
}

/**
 * @param {Uint8Array} data
 * @param {number} value
 * @param {number} from
 */
function indexOfByte(data, value, from) {
	for (let i = from; i < data.length; i++) {
		if (data[i] === value) return i;
	}
	return -1;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} ver
 */
function decodeId3Text(bytes, _ver) {
	if (!bytes.length) return '';
	const encoding = bytes[0];
	const raw = bytes.subarray(1);
	if (encoding === 1 || encoding === 2) {
		const dec = new TextDecoder(encoding === 2 ? 'utf-16be' : 'utf-16');
		return cleanText(dec.decode(raw));
	}
	if (encoding === 3) return cleanText(new TextDecoder('utf-8').decode(raw));
	return cleanText(new TextDecoder('latin1').decode(raw));
}

/**
 * Best-effort MP4/M4A iTunes tags from a prefix of the file.
 * @param {Uint8Array} bytes
 */
function readMp4Tags(bytes) {
	const atoms = findAtomPath(bytes, ['moov', 'udta', 'meta', 'ilst']);
	if (!atoms) return null;
	const ilst = atoms;
	/** @type {Record<string, string>} */
	const tags = {};
	/** @type {number | null} */
	let track_no = null;
	/** @type {number | null} */
	let disc_no = null;
	/** @type {{ mime: string, bytes: Uint8Array } | null} */
	let artwork = null;
	let off = 0;
	while (off + 8 <= ilst.length) {
		const size = u32(ilst, off);
		if (size < 8 || off + size > ilst.length) break;
		const typ = ascii(ilst, off + 4, 4);
		const payload = ilst.subarray(off + 8, off + size);
		if (typ === 'trkn') {
			track_no = readMp4IntPair(payload);
		} else if (typ === 'disk') {
			disc_no = readMp4IntPair(payload);
		} else if (typ === 'covr' && !artwork) {
			artwork = readMp4Cover(payload);
		} else {
			const text = readMp4DataAtom(payload);
			if (text) tags[typ] = text;
		}
		off += size;
	}
	const title = tags['©nam'] || tags.name;
	const artist = tags['©ART'] || tags.aART || tags['©art'];
	const album = tags['©alb'];
	if (!title && !artist && !album && track_no == null && !artwork) return null;
	return {
		title: title || undefined,
		artists: artist ? splitArtists(artist) : undefined,
		album: album || undefined,
		track_no,
		disc_no,
		artwork
	};
}

/**
 * @param {Uint8Array} payload
 * @returns {{ mime: string, bytes: Uint8Array } | null}
 */
function readMp4Cover(payload) {
	const data = findAtom(payload, 'data');
	if (!data || data.length < 8) return null;
	const type = u32(data, 0);
	const value = data.subarray(8);
	if (value.length < 32) return null;
	// 13 = JPEG, 14 = PNG (iTunes); some files use 0
	let mime = 'image/jpeg';
	if (type === 14 || (value[0] === 0x89 && value[1] === 0x50)) mime = 'image/png';
	else if (type === 13 || value[0] === 0xff) mime = 'image/jpeg';
	return { mime, bytes: value.slice() };
}

/**
 * iTunes trkn/disk: data atom with binary uint16 track (+ optional total).
 * @param {Uint8Array} payload
 * @returns {number | null}
 */
function readMp4IntPair(payload) {
	const data = findAtom(payload, 'data');
	if (!data || data.length < 16) return null;
	const value = data.subarray(8);
	// Common layout: 2 pad, uint16 number, uint16 of, 2 pad
	if (value.length >= 6) {
		const n = (value[2] << 8) | value[3];
		return n >= 1 ? n : null;
	}
	return null;
}

/**
 * Walk nested atoms; for `meta`, skip 4-byte version/flags after header.
 * @param {Uint8Array} bytes
 * @param {string[]} path
 */
function findAtomPath(bytes, path) {
	let cur = bytes;
	for (let i = 0; i < path.length; i++) {
		const name = path[i];
		const found = findAtom(cur, name);
		if (!found) return null;
		// meta has version/flags
		cur = name === 'meta' ? found.subarray(4) : found;
	}
	return cur;
}

/**
 * @param {Uint8Array} bytes
 * @param {string} type
 */
function findAtom(bytes, type) {
	let off = 0;
	while (off + 8 <= bytes.length) {
		let size = u32(bytes, off);
		const typ = ascii(bytes, off + 4, 4);
		let header = 8;
		if (size === 1 && off + 16 <= bytes.length) {
			// 64-bit size — treat as too large for our prefix slice
			return null;
		}
		if (size === 0) size = bytes.length - off;
		if (size < 8 || off + size > bytes.length) break;
		if (typ === type) return bytes.subarray(off + header, off + size);
		off += size;
	}
	return null;
}

/**
 * @param {Uint8Array} payload
 */
function readMp4DataAtom(payload) {
	const data = findAtom(payload, 'data');
	if (!data || data.length < 8) return null;
	// type indicator (4) + locale (4) + value
	const type = u32(data, 0);
	const value = data.subarray(8);
	if (type === 1 || type === 0) return cleanText(new TextDecoder('utf-8').decode(value));
	return null;
}

/**
 * @param {string} s
 */
function splitArtists(s) {
	return s
		.split(/\s*(?:\/|,|&|;|\band\b)\s*/i)
		.map((x) => x.trim())
		.filter(Boolean);
}

/**
 * @param {string} s
 */
function cleanText(s) {
	return s.replace(/\0+/g, '').trim();
}

/**
 * @param {Uint8Array} b
 * @param {number} o
 */
function u32(b, o) {
	return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | (b[o + 3])) >>> 0;
}

/**
 * @param {Uint8Array} b
 * @param {number} o
 */
function synchsafe32(b, o) {
	return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

/**
 * @param {Uint8Array} b
 * @param {number} o
 * @param {number} n
 */
function ascii(b, o, n) {
	let s = '';
	for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i]);
	return s;
}
