/**
 * Drive sync progress — section-scoped title spinner (not global “Updating”).
 */

/** @typedef {import('./drive/change-summary.svelte.js').SyncSection} SyncSection */

/** @type {{ active: boolean, ratio: number | null, label: string, sections: Record<string, boolean> }} */
export const syncUi = $state({
	active: false,
	/** 0–1 when known; null = indeterminate */
	ratio: null,
	label: '',
	/** Per content-type spinner flags (tasks, notes, …) */
	sections: {}
});

/** @param {string} [label] @param {SyncSection | SyncSection[] | null} [sections] */
export function beginSync(label = '', sections = null) {
	syncUi.label = label;
	syncUi.ratio = null;
	if (sections == null) {
		/* Legacy callers without sections — do not paint global chrome. */
		syncUi.active = false;
		return;
	}
	const list = Array.isArray(sections) ? sections : [sections];
	const next = { ...syncUi.sections };
	for (const s of list) {
		if (s) next[s] = true;
	}
	syncUi.sections = next;
	syncUi.active = Object.values(next).some(Boolean);
}

/**
 * @param {number} done
 * @param {number} total
 */
export function setSyncRatio(done, total) {
	if (!(total > 0)) {
		syncUi.ratio = null;
		return;
	}
	syncUi.ratio = Math.max(0, Math.min(1, done / total));
}

/** @param {SyncSection | SyncSection[] | null} [sections] */
export function endSync(sections = null) {
	if (sections == null) {
		syncUi.sections = {};
		syncUi.active = false;
		syncUi.ratio = null;
		syncUi.label = '';
		return;
	}
	const list = Array.isArray(sections) ? sections : [sections];
	const next = { ...syncUi.sections };
	for (const s of list) {
		if (s) delete next[s];
	}
	syncUi.sections = next;
	syncUi.active = Object.values(next).some(Boolean);
	if (!syncUi.active) {
		syncUi.ratio = null;
		syncUi.label = '';
	}
}

/**
 * Title chrome: only spin when this section is actively refreshing.
 * @param {SyncSection | string | null | undefined} section
 */
export function isSectionSyncing(section) {
	if (!section) return false;
	return Boolean(syncUi.sections[section]);
}
