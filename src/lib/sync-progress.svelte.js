/**
 * Shared Drive sync progress — drives title shimmer on list/detail chrome.
 */

/** @type {{ active: boolean, ratio: number | null, label: string }} */
export const syncUi = $state({
	active: false,
	/** 0–1 when known; null = indeterminate shimmer */
	ratio: null,
	label: ''
});

/** @param {string} [label] */
export function beginSync(label = '') {
	syncUi.active = true;
	syncUi.ratio = null;
	syncUi.label = label;
}

/**
 * @param {number} done
 * @param {number} total
 */
export function setSyncRatio(done, total) {
	syncUi.active = true;
	if (!(total > 0)) {
		syncUi.ratio = null;
		return;
	}
	syncUi.ratio = Math.max(0, Math.min(1, done / total));
}

export function endSync() {
	syncUi.active = false;
	syncUi.ratio = null;
	syncUi.label = '';
}
