/**
 * Clear local UI caches so hard-refresh / Settings → Storage can pick up fresh Drive data
 * and new frontend builds without fighting stale feed / leaf / workspace snapshots.
 */

import { chatFeed, chatUi } from './chat.svelte.js';

const LOCAL_KEYS = [
	'alpha.chat.feed.v1',
	'alpha.mail.list.v1',
	'alpha.workspace.cache.v1',
	'alpha.tracks.cache.v1',
	'alpha.player.cache.v1'
];

/**
 * Drop IndexedDB leaf plaintext cache (alpha.drive.leaf.v1).
 */
export async function clearLeafIdb() {
	if (typeof indexedDB === 'undefined') return;
	await new Promise((resolve) => {
		try {
			const req = indexedDB.deleteDatabase('alpha.drive.leaf.v1');
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		} catch {
			resolve();
		}
	});
}

/**
 * Clear UI-facing caches. Keeps session, actor, device profiles, mailbox passwords, theme.
 * @returns {Promise<{ clearedKeys: string[], leafDb: boolean }>}
 */
export async function clearLocalUiCache() {
	/** @type {string[]} */
	const clearedKeys = [];
	if (typeof localStorage !== 'undefined') {
		for (const key of LOCAL_KEYS) {
			try {
				if (localStorage.getItem(key) != null) {
					localStorage.removeItem(key);
					clearedKeys.push(key);
				}
			} catch {
				/* ignore */
			}
		}
		/* Also sweep unknown alpha.* cache keys (not secrets). */
		try {
			const skip = new Set([
				'alpha-admin-actor.v1',
				'alpha-admin-device-profiles.v1',
				'alpha-admin-drive.v1',
				'alpha-admin-theme.v1',
				'alpha-admin-mailbox.v1',
				'alpha-admin-api-token.v1',
				'alpha.mail.approved.v1'
			]);
			for (let i = localStorage.length - 1; i >= 0; i--) {
				const k = localStorage.key(i);
				if (!k || skip.has(k)) continue;
				if (
					k.startsWith('alpha.') &&
					(k.includes('cache') ||
						k.includes('feed') ||
						k.includes('workspace') ||
						k.includes('track') ||
						k.includes('mail.list') ||
						k.startsWith('alpha.members.v1:'))
				) {
					localStorage.removeItem(k);
					clearedKeys.push(k);
				}
			}
		} catch {
			/* ignore */
		}
	}

	chatFeed.splice(0, chatFeed.length);
	chatUi.settled = false;
	chatUi.loading = false;
	chatUi.error = null;

	await clearLeafIdb();
	return { clearedKeys, leafDb: true };
}
