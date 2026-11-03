/**
 * Human-facing file / folder labels for the Files feed.
 * Encrypted content stays ciphertext; titles live as plaintext path segments
 * (+ optional display_name on the root-dir child) so the UI never shows hash soup.
 */

import { stringToColor } from './color.js';

/** Looks like a content-addressed or opaque id, not a human filename. */
const OPAQUE_RE = /^(?:[0-9a-f]{32,}|[A-Za-z0-9_-]{40,}|local-[0-9a-f-]+)$/i;

/**
 * @param {string} path
 */
export function fileBaseName(path) {
	const p = String(path || '').replace(/\/+$/, '');
	const i = p.lastIndexOf('/');
	return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Prefer stored display_name; else last path segment; never raw opaque hashes.
 * @param {{ path?: string, name?: string, display_name?: string | null, title?: string | null }} entry
 */
export function fileDisplayTitle(entry) {
	const explicit = String(entry?.display_name || entry?.title || '').trim();
	if (explicit) return explicit;
	const base = String(entry?.name || fileBaseName(entry?.path || '')).trim();
	if (!base) return 'Untitled';
	if (OPAQUE_RE.test(base)) {
		return `File ${base.slice(0, 6)}…`;
	}
	return base;
}

/**
 * Split "Report.txt" → { stem: "Report", ext: "txt", label: "TXT" }.
 * Folders / no-extension → ext empty.
 * @param {string} title
 * @param {{ isFolder?: boolean }} [opts]
 */
export function splitFileTitle(title, opts = {}) {
	const raw = String(title || '').trim() || 'Untitled';
	if (opts.isFolder) return { stem: raw, ext: '', label: '' };
	const dot = raw.lastIndexOf('.');
	if (dot <= 0 || dot === raw.length - 1) return { stem: raw, ext: '', label: '' };
	const ext = raw.slice(dot + 1).toLowerCase();
	if (!/^[a-z0-9]{1,8}$/i.test(ext)) return { stem: raw, ext: '', label: '' };
	return {
		stem: raw.slice(0, dot),
		ext,
		label: ext.toUpperCase()
	};
}

/**
 * Extension → ink + wash for the type square (same string→color as profile hues).
 * @param {string} ext
 * @returns {{ ink: string, wash: string }}
 */
export function fileTypeColors(ext) {
	const key = String(ext || 'file').toLowerCase();
	const { r, g, b } = stringToColor(key);
	return {
		ink: `rgb(${r}, ${g}, ${b})`,
		wash: `rgba(${r}, ${g}, ${b}, 0.14)`
	};
}
