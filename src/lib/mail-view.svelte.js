/**
 * Mail folder (Inbox / Sent / …) + triage category (Primary / New / …).
 */
import { t } from '$lib/i18n.svelte.js';

/** @typedef {'inbox' | 'sent' | 'drafts' | 'junk' | 'trash'} MailFolder */
/** @typedef {'primary' | 'new' | 'updates' | 'other'} MailCategory */

export const MAIL_FOLDERS = /** @type {const} */ (['inbox', 'sent', 'drafts', 'junk', 'trash']);

/** i18n keys per folder — use mailFolderLabel() to translate. */
export const MAIL_FOLDER_LABEL_KEYS = {
	inbox: 'mail.inbox',
	sent: 'mail.sent',
	drafts: 'mail.drafts',
	junk: 'mail.junk',
	trash: 'mail.trash'
};

/** @param {string} folder */
export function mailFolderLabel(folder) {
	const key = /** @type {Record<string, string>} */ (MAIL_FOLDER_LABEL_KEYS)[folder];
	return key ? t(key) : folder;
}

/** JMAP Mailbox role for each folder. */
export const MAIL_FOLDER_ROLES = {
	inbox: 'inbox',
	sent: 'sent',
	drafts: 'drafts',
	junk: 'junk',
	trash: 'trash'
};

/** Triage categories — Primary is approved contacts only. Updates = newsletters / blogs / digests. */
export const MAIL_CATEGORIES = /** @type {const} */ (['primary', 'new', 'updates', 'other']);

/** i18n keys per category — use mailCategoryLabel() to translate. */
export const MAIL_CATEGORY_LABEL_KEYS = {
	primary: 'mail.primary',
	new: 'mail.new',
	updates: 'mail.updates',
	other: 'mail.other'
};

/** @param {string} category */
export function mailCategoryLabel(category) {
	const key = /** @type {Record<string, string>} */ (MAIL_CATEGORY_LABEL_KEYS)[category];
	return key ? t(key) : category;
}

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
