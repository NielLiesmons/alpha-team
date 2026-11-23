/**
 * Keeps WelcomeGate mounted through invite warm so the paste → progress morph
 * is not interrupted by the signed-in shell.
 */

/** @type {{ active: boolean, progress: number, label: string }} */
export const inviteFlow = $state({
	active: false,
	progress: 0,
	label: ''
});

/** @param {number} pct @param {string} [label] */
export function setInviteProgress(pct, label) {
	inviteFlow.progress = Math.max(0, Math.min(100, Math.round(pct)));
	if (label != null) inviteFlow.label = label;
}

export function beginInviteFlow() {
	inviteFlow.active = true;
	inviteFlow.progress = 0;
	inviteFlow.label = '';
}

export function endInviteFlow() {
	inviteFlow.active = false;
	inviteFlow.progress = 100;
}
