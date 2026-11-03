/**
 * Shared Files list state so the detail column can browse folders offline-friendly.
 */

/** @type {{ entries: { path: string, kind: string, display_name?: string | null }[], loading: boolean, error: string }} */
export const filesView = $state({
	entries: [],
	loading: false,
	error: ''
});
