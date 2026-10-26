/**
 * Mail folder chrome — AppShell top bar (same pattern as Planning zoom).
 */

/** @typedef {'inbox' | 'sent' | 'drafts' | 'junk' | 'trash'} MailFolder */

export const MAIL_FOLDERS = /** @type {const} */ (['inbox', 'sent', 'drafts', 'junk', 'trash']);

export const MAIL_FOLDER_LABELS = {
	inbox: 'Inbox',
	sent: 'Sent',
	drafts: 'Drafts',
	junk: 'Junk',
	trash: 'Trash'
};

/** JMAP Mailbox role for each folder. */
export const MAIL_FOLDER_ROLES = {
	inbox: 'inbox',
	sent: 'sent',
	drafts: 'drafts',
	junk: 'junk',
	trash: 'trash'
};

export const mailView = $state({
	/** @type {MailFolder} */
	folder: 'inbox'
});

/**
 * @param {MailFolder} folder
 */
export function setMailFolder(folder) {
	if (!MAIL_FOLDERS.includes(folder)) return;
	mailView.folder = folder;
}
