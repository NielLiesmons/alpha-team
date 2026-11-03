/** Settings list ↔ detail bridge. */
export const settingsUi = $state({
	/** Profile section target (may differ from signed-in actor). */
	profileTargetEmail: ''
});

/** @param {string} email */
export function setProfileTarget(email) {
	settingsUi.profileTargetEmail = String(email || '')
		.trim()
		.toLowerCase();
}

export function clearProfileTarget() {
	settingsUi.profileTargetEmail = '';
}
