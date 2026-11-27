/**
 * Pure helpers for Chat title-pill wave vs quiet tip catch-up.
 * Kept free of Svelte runes so node scripts can unit-test flag math.
 */

/** Away this long before visibility/pageshow shows the open catch-up wave again. */
export const CHAT_RESUME_AWAY_MS = 2_500;

/**
 * Title Metaball while a catch-up walk runs.
 * — quiet: tip-poll / receipt echo / live peer wake — never wave.
 * — catchUp: first open / resume after away — wave even with warm local cache.
 * — !settled: cold empty first paint still waves when not quiet.
 *
 * @param {{ quiet?: boolean, catchUp?: boolean, settled?: boolean }} [opts]
 */
export function shouldShowChatSyncWave(opts = {}) {
	if (opts.quiet === true) return false;
	return opts.catchUp === true || opts.settled !== true;
}

/**
 * Merge single-flight refresh intents: any non-quiet caller wins wave chrome;
 * catchUp OR tip from either caller is kept.
 *
 * @param {{ tip?: string, catchUp?: boolean, quiet?: boolean } | null | undefined} prev
 * @param {{ tip?: string, catchUp?: boolean, quiet?: boolean }} next
 */
export function mergeChatRefreshOpts(prev, next) {
	const base = prev && typeof prev === 'object' ? prev : {};
	const tip = String(next?.tip || base.tip || '').trim();
	return {
		quiet: base.quiet === true && next?.quiet === true,
		catchUp: Boolean(base.catchUp || next?.catchUp),
		...(tip ? { tip } : {})
	};
}

/**
 * Tab/PWA resume after background — wave once when away was meaningful.
 * Short blurs / tip polls must not trip this (lastHiddenAt=0 → false).
 *
 * @param {number} lastHiddenAt
 * @param {number} [now]
 * @param {number} [awayMs]
 */
export function resumeNeedsCatchUpWave(
	lastHiddenAt,
	now = Date.now(),
	awayMs = CHAT_RESUME_AWAY_MS
) {
	const hidden = Number(lastHiddenAt) || 0;
	if (hidden <= 0) return false;
	return now - hidden >= awayMs;
}
