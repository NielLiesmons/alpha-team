/**
 * Space brand icon — square PNG on Drive, used for welcome / favicon / PWA / nav.
 *
 * Layout:
 *   meta/brand.json       alpha.brand/1 — icon_path + optional name
 *   meta/space-icon.png   square PNG (512, transparency kept)
 */

import { getPath, putPaths } from './drive/client.js';
import { activeSession } from './drive/session.svelte.js';
import { getAttachmentObjectUrl } from './drive/media-cache.js';
import { parentDomain } from './space-host.js';
import { space, websites } from './sections.js';

export const BRAND_PATH = 'meta/brand.json';
export const SPACE_ICON_PATH = 'meta/space-icon.png';
export const SPACE_ICON_SIZE = 512;
export const DEFAULT_SPACE_ICON = '/icons/icon-192.png';

/**
 * @typedef {{
 *   iconUrl: string,
 *   iconPath: string,
 *   ready: boolean
 * }} SpaceBrandState
 */

/** @type {SpaceBrandState} */
export const spaceBrand = $state({
	iconUrl: DEFAULT_SPACE_ICON,
	iconPath: '',
	ready: false
});

/** @type {string | null} */
let manifestBlobUrl = null;

/**
 * Best-effort public icon before Drive brand loads (welcome / cold boot).
 */
export function defaultSpaceIconUrl() {
	const site = websites[0];
	const fav = String(site?.faviconUrl || '').trim();
	if (fav) return fav;
	const apex = parentDomain();
	if (apex) return `https://www.${apex}/favicon.ico`;
	return DEFAULT_SPACE_ICON;
}

/** Resolve display URL (Drive blob → public favicon → bundled icon). */
export function spaceIconUrl() {
	const custom = String(spaceBrand.iconUrl || '').trim();
	if (custom && custom !== DEFAULT_SPACE_ICON) return custom;
	if (custom) return custom;
	return defaultSpaceIconUrl();
}

/**
 * Center-crop to square PNG at SPACE_ICON_SIZE (keeps transparency).
 * @param {File | Blob} file
 * @param {number} [size]
 * @returns {Promise<Uint8Array>}
 */
export async function encodeSpaceIconPng(file, size = SPACE_ICON_SIZE) {
	/** @type {number} */
	let width;
	/** @type {number} */
	let height;
	/** @type {(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number, sx: number, sy: number, sw: number, sh: number) => void} */
	let draw;

	try {
		const bitmap = await createImageBitmap(file);
		width = bitmap.width;
		height = bitmap.height;
		draw = (ctx, dx, dy, dw, dh, sx, sy, sw, sh) => {
			ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
			bitmap.close();
		};
	} catch {
		const url = URL.createObjectURL(file);
		try {
			const img = await new Promise((resolve, reject) => {
				const el = new Image();
				el.onload = () => resolve(el);
				el.onerror = () => reject(new Error('Couldn’t read that image — try a square PNG'));
				el.src = url;
			});
			width = img.naturalWidth || img.width;
			height = img.naturalHeight || img.height;
			draw = (ctx, dx, dy, dw, dh, sx, sy, sw, sh) =>
				ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	if (!width || !height) throw new Error('Couldn’t read that image');
	const side = Math.min(width, height);
	const sx = Math.floor((width - side) / 2);
	const sy = Math.floor((height - side) / 2);
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Couldn’t process space icon');
	ctx.clearRect(0, 0, size, size);
	draw(ctx, 0, 0, size, size, sx, sy, side, side);

	const blob = await new Promise((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Couldn’t encode space icon PNG'))),
			'image/png'
		);
	});
	return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Update document favicon + apple-touch + dynamic web manifest icons.
 * @param {string} [url]
 */
export function applyDocumentIcons(url) {
	if (typeof document === 'undefined') return;
	const href = String(url || spaceIconUrl() || DEFAULT_SPACE_ICON).trim() || DEFAULT_SPACE_ICON;

	/** @param {string} rel @param {string} [sizes] @param {string} [type] */
	function upsertLink(rel, sizes, type = 'image/png') {
		let el =
			/** @type {HTMLLinkElement | null} */ (
				document.head.querySelector(`link[rel="${rel}"]${sizes ? `[sizes="${sizes}"]` : ''}`)
			) ||
			/** @type {HTMLLinkElement | null} */ (document.head.querySelector(`link[rel="${rel}"]`));
		if (!el) {
			el = document.createElement('link');
			el.rel = rel;
			document.head.appendChild(el);
		}
		if (sizes) el.sizes = sizes;
		el.type = type;
		el.href = href;
	}

	upsertLink('icon', '192x192');
	upsertLink('icon', '512x512');
	upsertLink('apple-touch-icon');

	const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
	const appName = document.querySelector('meta[name="application-name"]');
	const name = String(space.name || '').trim() || 'Alpha';
	if (appleTitle) appleTitle.setAttribute('content', name);
	if (appName) appName.setAttribute('content', name);

	try {
		const manifest = {
			name,
			short_name: name.slice(0, 12),
			description: 'Team space',
			lang: 'en',
			dir: 'ltr',
			start_url: '/',
			scope: '/',
			id: '/',
			display: 'standalone',
			display_override: ['standalone', 'minimal-ui'],
			orientation: 'any',
			background_color: '#090909',
			theme_color: '#090909',
			categories: ['productivity', 'social', 'utilities'],
			icons: [
				{ src: href, sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: href, sizes: '512x512', type: 'image/png', purpose: 'any' },
				{ src: href, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
			]
		};
		const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
		const next = URL.createObjectURL(blob);
		let link = /** @type {HTMLLinkElement | null} */ (
			document.head.querySelector('link[rel="manifest"]')
		);
		if (!link) {
			link = document.createElement('link');
			link.rel = 'manifest';
			document.head.appendChild(link);
		}
		link.href = next;
		if (manifestBlobUrl) URL.revokeObjectURL(manifestBlobUrl);
		manifestBlobUrl = next;
	} catch {
		/* ignore */
	}
}

/**
 * Prefill from host / bundled icon before Drive round-trip.
 */
export function syncSpaceBrandDefaults() {
	if (spaceBrand.iconPath) return;
	const next = defaultSpaceIconUrl();
	spaceBrand.iconUrl = next;
	space.iconUrl = next;
	applyDocumentIcons(next);
}

/**
 * @param {string} path
 * @param {{ localOnly?: boolean }} [opts]
 */
async function ensureIconObjectUrl(path, opts = {}) {
	const session = activeSession();
	if (!session || !path) return null;
	try {
		const res = await getAttachmentObjectUrl(
			session,
			{
				path,
				kind: 'image',
				content_type: 'image/png',
				name: 'space-icon.png'
			},
			{ localOnly: Boolean(opts.localOnly) }
		);
		return res?.url || null;
	} catch {
		return null;
	}
}

/**
 * Load meta/brand.json + icon blob after Drive session is up.
 * @param {import('./drive/client.js').DriveSession} [session]
 */
export async function loadSpaceBrand(session) {
	const s = session || activeSession();
	if (!s) {
		syncSpaceBrandDefaults();
		spaceBrand.ready = true;
		return;
	}
	try {
		const bytes = await getPath(s, BRAND_PATH);
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		const iconPath = String(doc?.icon_path || SPACE_ICON_PATH).trim();
		if (typeof doc?.name === 'string' && doc.name.trim()) {
			space.name = doc.name.trim();
		}
		spaceBrand.iconPath = iconPath;
		const url =
			(await ensureIconObjectUrl(iconPath)) ||
			(await ensureIconObjectUrl(SPACE_ICON_PATH)) ||
			defaultSpaceIconUrl();
		spaceBrand.iconUrl = url;
		space.iconUrl = url;
		applyDocumentIcons(url);
	} catch {
		/* No brand yet — keep host favicon / bundled default. */
		syncSpaceBrandDefaults();
	} finally {
		spaceBrand.ready = true;
	}
}

/**
 * Admin upload: square PNG → Drive + live document icons.
 * @param {File | Blob} file
 */
export async function setSpaceIcon(file) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive before setting a space icon.');
	const png = await encodeSpaceIconPng(file);
	if (!png.length) throw new Error('Empty space icon');
	const brand = {
		schema: 'alpha.brand/1',
		icon_path: SPACE_ICON_PATH,
		name: space.name || undefined,
		updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
	};
	await putPaths(session, [
		{ path: SPACE_ICON_PATH, kind: 'blob', plaintext: png },
		{ path: BRAND_PATH, kind: 'blob', plaintext: JSON.stringify(brand, null, 2) }
	]);
	spaceBrand.iconPath = SPACE_ICON_PATH;
	const url = await ensureIconObjectUrl(SPACE_ICON_PATH);
	const next = url || URL.createObjectURL(new Blob([png], { type: 'image/png' }));
	spaceBrand.iconUrl = next;
	space.iconUrl = next;
	applyDocumentIcons(next);
	return SPACE_ICON_PATH;
}
