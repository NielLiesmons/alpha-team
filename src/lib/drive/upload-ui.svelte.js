/**
 * AppShell plus → Drive page file picker.
 * Sets `pending`; the Drive route `$effect`s it and clicks the hidden input.
 */

export const driveUploadUi = $state({
	/** @type {number} */
	requestId: 0,
	pending: false
});

export function requestDriveUpload() {
	driveUploadUi.pending = true;
	driveUploadUi.requestId += 1;
}
