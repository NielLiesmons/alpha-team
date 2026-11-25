/**
 * Mail folder (In / Out / Drafts / …) + triage category (Primary / New / …).
 */
import { t } from '$lib/i18n.svelte.js';

/** @typedef {'mailbox' | 'inbox' | 'sent' | 'drafts' | 'archive' | 'junk' | 'trash'} MailFolder */
/** @typedef {'primary' | 'new' | 'updates' | 'other'} MailCategory */

/** Nav folders — unified inbox+sent is `mailbox` (“In / Out”). */
export const MAIL_FOLDERS = /** @type {const} */ ([
	'mailbox',
	'drafts',
	'archive',
	'junk',
	'trash'
]);

/** i18n keys per folder — use mailFolderLabel() to translate. */
export const MAIL_FOLDER_LABEL_KEYS = {
	mailbox: 'mail.mailbox',
	inbox: 'mail.inbox',
	sent: 'mail.sent',
	drafts: 'mail.drafts',
	archive: 'mail.archive',
	junk: 'mail.junk',
	trash: 'mail.trash'
};

/** @param {string} folder */
export function mailFolderLabel(folder) {
	const key = /** @type {Record<string, string>} */ (MAIL_FOLDER_LABEL_KEYS)[folder];
	return key ? t(key) : folder;
}

/** JMAP Mailbox role for each folder. `mailbox` is inbox+sent (handled in refresh). */
export const MAIL_FOLDER_ROLES = {
	mailbox: 'inbox',
	inbox: 'inbox',
	sent: 'sent',
	drafts: 'drafts',
	archive: 'archive',
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
	folder: 'mailbox',
	/** @type {MailCategory} */
	category: 'primary'
});

/**
 * @param {MailFolder | string} folder
 */
export function setMailFolder(folder) {
	/* Legacy inbox/sent nav ids collapse into unified mailbox. */
	const next =
		folder === 'inbox' || folder === 'sent' ? 'mailbox' : folder;
	if (!MAIL_FOLDERS.includes(/** @type {typeof MAIL_FOLDERS[number]} */ (next))) return;
	mailView.folder = /** @type {MailFolder} */ (next);
}

/**
 * @param {MailCategory} category
 */
export function setMailCategory(category) {
	if (!MAIL_CATEGORIES.includes(category)) return;
	mailView.category = category;
}
