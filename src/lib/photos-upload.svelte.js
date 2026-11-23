/**
 * AppShell plus → Photos page file picker.
 */

export const photosUploadUi = $state({
	/** @type {number} */
	requestId: 0,
	pending: false
});

export function requestPhotosUpload() {
	photosUploadUi.pending = true;
	photosUploadUi.requestId += 1;
}
