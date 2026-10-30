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

/** Sites shown as cards on /website (expand when multi-site). */
export const websites = [
	{
		id: 'bley',
		name: 'Bley',
		tagline: 'bley.farm',
		siteUrl: 'https://bley.farm',
		/** Open Graph / cover — matches bley site.js ogImage */
		ogImage: 'https://bley.farm/media/og.jpg'
	}
];

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
	{ href: '/player', label: 'Player', icon: 'player' },
	{ href: '/website', label: 'Websites', icon: 'website' }
];

/** Owner/admin only — Drive member directory + invites. */
/** @type {NavItem} */
export const accountsNavItem = {
	href: '/accounts',
	label: 'Accounts',
	icon: 'profile'
};

/**
 * Horizontal mobile pill — Chat centered; Websites hub owns Content/Shop/Publications.
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
	{ href: '/player', label: 'Player', icon: 'player' },
	{ href: '/settings', label: 'Settings', icon: 'settings' }
];

/**
 * @param {boolean} showAccounts
 * @returns {NavItem[]}
 */
export function navForRole(showAccounts) {
	if (!showAccounts) return primaryNav;
	return [...primaryNav, accountsNavItem];
}

/**
 * @param {boolean} showAccounts
 * @returns {NavItem[]}
 */
export function mobileNavForRole(showAccounts) {
	if (!showAccounts) return mobileNav;
	const out = [...mobileNav];
	const settingsIdx = out.findIndex((i) => i.href === '/settings');
	const item = accountsNavItem;
	if (settingsIdx >= 0) out.splice(settingsIdx, 0, item);
	else out.push(item);
	return out;
}

export const space = {
	name: 'Bley',
	description: 'Regenerative family farm in Saint-Nicodème.',
	siteUrl: 'https://bley.farm'
};
