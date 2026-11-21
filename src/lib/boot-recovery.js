/**
 * Recover from blank / stuck PWA shells (stale SW cache, failed chunk loads, hung boot).
 * Keeps Drive session + mailbox passwords unless `full` wipe is requested.
 */

import { clearLocalUiCache } from './ui-cache.js';

const RECOVER_FLAG = 'alpha.boot.recover.v1';

/**
 * @param {{ full?: boolean }} [opts]
 */
export async function recoverAppShell(opts = {}) {
	const full = Boolean(opts.full);
	try {
		await clearLocalUiCache();
	} catch {
		/* ignore */
	}

	if (typeof caches !== 'undefined') {
		try {
			const keys = await caches.keys();
			await Promise.all(keys.map((k) => caches.delete(k)));
		} catch {
			/* ignore */
		}
	}

	if ('serviceWorker' in navigator) {
		try {
			const regs = await navigator.serviceWorker.getRegistrations();
			await Promise.all(regs.map((r) => r.unregister()));
		} catch {
			/* ignore */
		}
	}

	if (full && typeof localStorage !== 'undefined') {
		try {
			const keep = new Set(['alpha-admin-theme.v1', 'alpha-admin-theme']);
			const doomed = [];
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (!k || keep.has(k)) continue;
				if (k.startsWith('alpha') || k.startsWith('alpha-')) doomed.push(k);
			}
			for (const k of doomed) localStorage.removeItem(k);
		} catch {
			/* ignore */
		}
	}

	try {
		sessionStorage.setItem(RECOVER_FLAG, String(Date.now()));
	} catch {
		/* ignore */
	}

	const url = new URL(typeof location !== 'undefined' ? location.href : '/');
	url.searchParams.delete('recover');
	url.searchParams.delete('reset');
	/* Bust any HTML shell still held by the HTTP cache. */
	url.searchParams.set('_recover', String(Date.now()));
	location.replace(url.pathname + url.search + url.hash);
}

/** True when this load followed a recovery bounce (skip auto-loop). */
export function justRecovered() {
	try {
		const at = Number(sessionStorage.getItem(RECOVER_FLAG) || 0);
		if (!at) return false;
		sessionStorage.removeItem(RECOVER_FLAG);
		return Date.now() - at < 60_000;
	} catch {
		return false;
	}
}
