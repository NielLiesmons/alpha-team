/**
 * Detect `@` / `:` typeahead triggers in a plain textarea (Zapstore-style).
 */

/**
 * @param {string} text
 * @param {number} cursor
 * @returns {{ trigger: '@' | ':', query: string, start: number, end: number } | null}
 */
export function detectComposerTrigger(text, cursor) {
	const value = String(text ?? '');
	const pos = Math.max(0, Math.min(Number(cursor) || 0, value.length));
	const before = value.slice(0, pos);
	const m = before.match(/([@:])([^\s@:]*)$/);
	if (!m) return null;
	/** Guard: don't open after email-like `word@` mid-token without boundary. */
	const start = pos - m[0].length;
	if (m[1] === '@' && start > 0) {
		const prev = before[start - 1];
		if (prev && /[A-Za-z0-9._-]/.test(prev)) return null;
	}
	return {
		trigger: /** @type {'@' | ':'} */ (m[1]),
		query: m[2] || '',
		start,
		end: pos
	};
}

/**
 * Replace the trigger range with `insert` (+ trailing space) and return next value + cursor.
 * @param {string} text
 * @param {{ start: number, end: number }} range
 * @param {string} insert
 */
export function applyComposerInsert(text, range, insert) {
	const value = String(text ?? '');
	const start = Math.max(0, range.start);
	const end = Math.max(start, range.end);
	const token = String(insert || '');
	const next = `${value.slice(0, start)}${token} ${value.slice(end)}`;
	const cursor = start + token.length + 1;
	return { value: next, cursor };
}
