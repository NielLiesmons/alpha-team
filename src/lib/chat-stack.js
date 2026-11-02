/**
 * Message stacking — same author + direction, within 10 minutes (alpha-chat rules, 10m window).
 */

export const CHAT_STACK_GAP_MS = 10 * 60 * 1000;

/**
 * @param {any} a
 * @param {any} b
 * @param {string} meEmail
 */
export function continuesChatStack(a, b, meEmail) {
	if (!a || !b) return false;
	if (a.kind === 'event' || b.kind === 'event') return false;
	if (a.kind === 'reaction' || b.kind === 'reaction') return false;
	const me = String(meEmail || '')
		.trim()
		.toLowerCase();
	const aa = String(a.author || '')
		.trim()
		.toLowerCase();
	const ba = String(b.author || '')
		.trim()
		.toLowerCase();
	if (!aa || aa !== ba) return false;
	const aMine = Boolean(me && aa === me);
	const bMine = Boolean(me && ba === me);
	if (aMine !== bMine) return false;
	const at = Date.parse(a.created_at || '');
	const bt = Date.parse(b.created_at || '');
	if (!Number.isFinite(at) || !Number.isFinite(bt)) return false;
	const gap = Math.abs(bt - at);
	return gap >= 0 && gap <= CHAT_STACK_GAP_MS;
}

/**
 * @param {any[]} chronological oldest → newest
 * @param {string} meEmail
 * @returns {Map<string, { isFirst: boolean, isLast: boolean }>}
 */
export function chatStackFlags(chronological, meEmail) {
	/** @type {Map<string, { isFirst: boolean, isLast: boolean }>} */
	const flags = new Map();
	const list = chronological || [];
	for (let i = 0; i < list.length; i++) {
		const msg = list[i];
		const id = String(msg?.id || '');
		if (!id) continue;
		const older = i > 0 ? list[i - 1] : null;
		const newer = i < list.length - 1 ? list[i + 1] : null;
		const isFirst = !older || !continuesChatStack(older, msg, meEmail);
		const isLast = !newer || !continuesChatStack(msg, newer, meEmail);
		flags.set(id, { isFirst, isLast });
	}
	return flags;
}
