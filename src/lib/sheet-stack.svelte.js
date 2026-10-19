/**
 * Stacked CreateSheet layers (Zapstore-style nested modals).
 * Top sheet is interactive; sheets below scale down and darken.
 */

/** @type {string[]} */
export const sheetStack = $state([]);

/** @param {string} id */
export function sheetOpened(id) {
	if (!id) return;
	const i = sheetStack.indexOf(id);
	if (i >= 0) sheetStack.splice(i, 1);
	sheetStack.push(id);
}

/** @param {string} id */
export function sheetClosed(id) {
	if (!id) return;
	const i = sheetStack.indexOf(id);
	if (i >= 0) sheetStack.splice(i, 1);
}

/** @param {string} id */
export function sheetIndex(id) {
	return sheetStack.indexOf(id);
}

/** @param {string} id */
export function isSheetCovered(id) {
	const i = sheetStack.indexOf(id);
	return i >= 0 && i < sheetStack.length - 1;
}

/** @param {string} id */
export function isTopSheet(id) {
	return sheetStack.length > 0 && sheetStack[sheetStack.length - 1] === id;
}
