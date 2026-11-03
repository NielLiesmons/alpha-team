/**
 * Primary nav IA. Icons live in alpha-ui/icons (shared design system).
 */

/**
 * @typedef {{
 *   href: string,
 *   label: string,
 *   icon: string,
 *   countKey?: 'tasks' | 'projects' | 'notes' | 'enterprises' | 'ledger',
 *   createKind?: 'task' | 'project' | 'note' | 'newsletter' | 'ledger' | 'cost' | 'sales' | 'enterprise' | 'mail' | 'file',
 *   children?: NavItem[]
 * }} NavItem
 */

/**
 * Per-site surfaces (order fixed: Publications → Shop → Content).
 * Labels only — no icons in the website card links for now.
 */
export const websiteChildren = [
	{ href: '/publications', label: 'Publications', icon: 'publications', createKind: 'newsletter' },
	{ href: '/website/shop', label: 'Shop', icon: 'shop' },
	{ href: '/website/content', label: 'Content', icon: 'website' }
];

/** Sites shown as cards on /website — filled from Space brand / site config later. */
export const websites = [];

/** Shown for every signed-in profile. */
/** @type {NavItem[]} */
export const primaryNav = [
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/mail', label: 'Mail', icon: 'mail', createKind: 'mail' },
	{ href: '/drive', label: 'Drive', icon: 'drive', createKind: 'file' },
	{ href: '/projects', label: 'Projects', icon: 'projects', countKey: 'projects', createKind: 'project' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks', countKey: 'tasks', createKind: 'task' },
	{ href: '/notes', label: 'Notes', icon: 'notes', countKey: 'notes', createKind: 'note' },
	{
		href: '/entreprises',
		label: 'Entreprises',
		icon: 'enterprise',
		countKey: 'enterprises',
		createKind: 'enterprise'
	},
	{ href: '/planning', label: 'Planning', icon: 'planning' },
	{ href: '/website', label: 'Websites', icon: 'website' }
];

/**
 * Horizontal mobile pill — Chat centered; Websites hub owns Content/Shop/Publications.
 * Profile / invite management lives under Settings (Add Profile), not a separate Accounts tab.
 */
export const mobileNav = [
	{ href: '/website', label: 'Websites', icon: 'website' },
	{ href: '/planning', label: 'Planning', icon: 'planning' },
	{ href: '/entreprises', label: 'Entreprises', icon: 'enterprise' },
	{ href: '/notes', label: 'Notes', icon: 'notes' },
	{ href: '/projects', label: 'Projects', icon: 'projects' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks' },
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/mail', label: 'Mail', icon: 'mail', createKind: 'mail' },
	{ href: '/drive', label: 'Drive', icon: 'drive', createKind: 'file' },
	{ href: '/settings', label: 'Settings', icon: 'settings' }
];

/** @returns {NavItem[]} */
export function navForRole() {
	return primaryNav;
}

/** @returns {NavItem[]} */
export function mobileNavForRole() {
	return mobileNav;
}

/** Display labels for the signed-in Space — override from brand.json later. */
export const space = {
	name: 'Space',
	description: '',
	siteUrl: ''
};
