/**
 * Pure mailbox feed integrity helpers (hole detection + walk mode).
 * Kept free of Drive I/O / Svelte so node scripts can unit-test.
 */

/**
 * True when a row's reply_to target is missing from the materialized feed.
 * Marks a non-contiguous cache (CAS-race poison, truncated IDB, remigrate gap).
 * Retracted parents also match — callers should accept holes after a genesis walk.
 *
 * @param {any[] | null | undefined} messages
 * @returns {boolean}
 */
export function mailboxFeedHasHoles(messages) {
	if (!Array.isArray(messages) || messages.length === 0) return false;
	/** @type {Set<string>} */
	const ids = new Set();
	for (const m of messages) {
		const id = String(m?.id || '').trim();
		if (id) ids.add(id);
	}
	for (const m of messages) {
		const parent = String(m?.reply_to || '').trim();
		if (parent && !ids.has(parent)) return true;
	}
	return false;
}

/**
 * Incremental tip→stopAt is safe only for a known-complete contiguous chain.
 * Open/resume catch-up still uses this fast path when the cache is healthy;
 * holes / incomplete / forceFull fall through to a deeper tip→prev walk.
 *
 * @param {{
 *   cachedTip?: string,
 *   complete?: boolean,
 *   hasHoles?: boolean,
 *   holesAccepted?: boolean,
 *   forceFull?: boolean
 * }} [opts]
 * @returns {boolean}
 */
export function canIncrementalMailboxCatchUp(opts = {}) {
	if (opts.forceFull === true) return false;
	if (!String(opts.cachedTip || '').trim()) return false;
	if (opts.complete !== true) return false;
	if (opts.hasHoles === true && opts.holesAccepted !== true) return false;
	return true;
}
