/**
 * Message stacking — same author + direction, within 10 minutes (alpha-chat rules, 10m window).
 * Publication panels are barriers: plain chat never stacks with a task/note/… comment,
 * and comments on different entities never stack with each other.
 */

export const CHAT_STACK_GAP_MS = 10 * 60 * 1000;

/**
 * Same key as chatPublicationRefKey — kept local so this util stays import-light.
 * Must stay in sync with chat.svelte.js `chatPublicationRefKey` (ADR §3c barrier).
 * @param {any} msg
 * @returns {string}
 */
function stackContextKey(msg) {
	const ref = msg?.ref;
	if (!ref?.type || !ref?.id) return '';
	if (ref.type === 'chat' || ref.type === 'reaction') return '';
	if (
		ref.type !== 'task' &&
		ref.type !== 'note' &&
		ref.type !== 'project' &&
		ref.type !== 'enterprise' &&
		ref.type !== 'mail' &&
		ref.type !== 'sheet' &&
		ref.type !== 'table' &&
		ref.type !== 'ai_thread' &&
		ref.type !== 'git_repo' &&
		ref.type !== 'file'
	) {
		return '';
	}
	return `${ref.type}:${ref.id}`;
}

/**
 * @param {any} a
 * @param {any} b
 * @param {string} meEmail
 */
export function continuesChatStack(a, b, meEmail) {
	if (!a || !b) return false;
	if (a.kind === 'event' || b.kind === 'event') return false;
	if (a.kind === 'reaction' || b.kind === 'reaction') return false;
	/* Publication tip / comment panel acts as a hard grouping barrier. */
	if (stackContextKey(a) !== stackContextKey(b)) return false;
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
