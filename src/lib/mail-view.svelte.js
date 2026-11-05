/**
 * Mail folder (Inbox / Sent / …) + triage category (Primary / New / …).
 */

/** @typedef {'inbox' | 'sent' | 'drafts' | 'junk' | 'trash'} MailFolder */
/** @typedef {'primary' | 'new' | 'news' | 'other'} MailCategory */

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

/** Triage categories — Primary is approved contacts only. */
export const MAIL_CATEGORIES = /** @type {const} */ (['primary', 'new', 'news', 'other']);

export const MAIL_CATEGORY_LABELS = {
	primary: 'Primary',
	new: 'New',
	news: 'News',
	other: 'Other'
};

export const mailView = $state({
	/** @type {MailFolder} */
	folder: 'inbox',
	/** @type {MailCategory} */
	category: 'primary'
});

/**
 * @param {MailFolder} folder
 */
export function setMailFolder(folder) {
	if (!MAIL_FOLDERS.includes(folder)) return;
	mailView.folder = folder;
}

/**
 * @param {MailCategory} category
 */
export function setMailCategory(category) {
	if (!MAIL_CATEGORIES.includes(category)) return;
	mailView.category = category;
}
