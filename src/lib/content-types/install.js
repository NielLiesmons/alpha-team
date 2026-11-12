/**
 * Space-installed content-type packages under meta/content_types/{package_id}/.
 * First-party types ship in registry.js; this layer is for team / public packages.
 *
 * Layout on Drive:
 *   meta/content_types/{id}/manifest.json
 *   meta/content_types/{id}/chat.json
 *   meta/content_types/{id}/schema.json   (optional)
 *   meta/content_types/{id}/app/…         (frame entry when open.mode=frame)
 */

import { getPath, loadRootDir, putPath } from '../drive/client.js';
import { FIRST_PARTY_CONTENT_TYPES } from './registry.js';

const ROOT = 'meta/content_types';

/**
 * @param {Uint8Array} bytes
 */
function bytesToText(bytes) {
	return new TextDecoder().decode(bytes);
}

/**
 * @param {import('../drive/client.js').DriveSession} session
 * @param {string} packageId
 * @returns {Promise<{ manifest: any, chat: any } | null>}
 */
export async function loadInstalledPackage(session, packageId) {
	const id = String(packageId || '').trim();
	if (!id) return null;
	try {
		const manifest = JSON.parse(
			bytesToText(await getPath(session, `${ROOT}/${id}/manifest.json`))
		);
		const chat = JSON.parse(bytesToText(await getPath(session, `${ROOT}/${id}/chat.json`)));
		if (manifest?.schema !== 'alpha.content_type_manifest/1') return null;
		if (chat?.schema !== 'alpha.content_type_chat/1') return null;
		return { manifest, chat };
	} catch {
		return null;
	}
}

/**
 * List package ids installed on this Space (dirs under meta/content_types/).
 * @param {import('../drive/client.js').DriveSession} session
 * @returns {Promise<string[]>}
 */
export async function listInstalledPackageIds(session) {
	try {
		const dir = await loadRootDir(session);
		const ids = new Set();
		const prefix = `${ROOT}/`;
		for (const path of Object.keys(dir.children ?? {})) {
			if (!path.startsWith(prefix)) continue;
			const rest = path.slice(prefix.length);
			const id = rest.split('/')[0];
			if (id) ids.add(id);
		}
		return [...ids].sort();
	} catch {
		return [];
	}
}

/**
 * Install or replace a package folder (manifest + chat required; app/ optional for frame).
 * Refuses to overwrite first-party ids.
 * @param {import('../drive/client.js').DriveSession} session
 * @param {{ manifest: any, chat: any, appFiles?: { path: string, body: string | Uint8Array }[] }} pkg
 */
export async function installContentTypePackage(session, pkg) {
	const manifest = pkg?.manifest;
	const chat = pkg?.chat;
	const id = String(manifest?.id || '').trim();
	if (!id) throw new Error('manifest.id required');
	if (FIRST_PARTY_CONTENT_TYPES.some((p) => p.id === id)) {
		throw new Error(`Refusing to overwrite first-party package ${id}`);
	}
	if (manifest.schema !== 'alpha.content_type_manifest/1') {
		throw new Error('manifest.schema must be alpha.content_type_manifest/1');
	}
	if (chat?.schema !== 'alpha.content_type_chat/1') {
		throw new Error('chat.schema must be alpha.content_type_chat/1');
	}
	if (!chat.type_name || !chat.icon || !chat.title_path) {
		throw new Error('chat.json needs type_name, icon, title_path');
	}

	await putPath(
		session,
		`${ROOT}/${id}/manifest.json`,
		'blob',
		JSON.stringify(manifest, null, 2)
	);
	await putPath(session, `${ROOT}/${id}/chat.json`, 'blob', JSON.stringify(chat, null, 2));

	for (const f of pkg.appFiles || []) {
		const rel = String(f.path || '').replace(/^\/+/, '');
		if (!rel || rel.includes('..')) continue;
		await putPath(session, `${ROOT}/${id}/${rel}`, 'blob', f.body);
	}
	return id;
}

/**
 * Frame entry path on Drive for an installed package.
 * @param {string} packageId
 * @param {string} [entry]
 */
export function installedFrameEntryPath(packageId, entry = 'app/index.html') {
	const id = String(packageId || '').trim();
	const rel = String(entry || 'app/index.html').replace(/^\/+/, '');
	return `${ROOT}/${id}/${rel}`;
}
