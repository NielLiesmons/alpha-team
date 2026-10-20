/**
 * Primary nav IA. Icons live in alpha-ui/icons (shared design system).
 */

/**
 * @typedef {{
 *   href: string,
 *   label: string,
 *   icon: string,
 *   countKey?: 'tasks' | 'projects' | 'notes' | 'ledger',
 *   createKind?: 'task' | 'project' | 'note' | 'newsletter' | 'ledger' | 'cost' | 'sales' | 'enterprise',
 *   children?: NavItem[]
 * }} NavItem
 */

/** Website subtree — desktop sidebar nests these; mobile uses /website hub. */
export const websiteChildren = [
	{ href: '/website/content', label: 'Content', icon: 'website' },
	{ href: '/website/shop', label: 'Shop', icon: 'shop' },
	{ href: '/publications', label: 'Publications', icon: 'publications', createKind: 'newsletter' }
];

/** @type {NavItem[]} */
export const primaryNav = [
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/mail', label: 'Mail', icon: 'mail' },
	{ href: '/drive', label: 'Drive', icon: 'drive' },
	{ href: '/projects', label: 'Projects', icon: 'projects', countKey: 'projects', createKind: 'project' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks', countKey: 'tasks', createKind: 'task' },
	{ href: '/notes', label: 'Notes', icon: 'notes', countKey: 'notes', createKind: 'note' },
	{
		href: '/entreprises',
		label: 'Entreprises',
		icon: 'accounting',
		countKey: 'ledger',
		createKind: 'enterprise'
	},
	{ href: '/planning', label: 'Planning', icon: 'calendar' },
	{ href: '/player', label: 'Player', icon: 'player' },
	{ href: '/website', label: 'Website', icon: 'website' }
];

/**
 * Horizontal mobile pill — Chat centered; Website hub owns Content/Shop/Publications.
 */
export const mobileNav = [
	{ href: '/website', label: 'Website', icon: 'website' },
	{ href: '/planning', label: 'Planning', icon: 'calendar' },
	{ href: '/entreprises', label: 'Entreprises', icon: 'accounting' },
	{ href: '/notes', label: 'Notes', icon: 'notes' },
	{ href: '/projects', label: 'Projects', icon: 'projects' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks' },
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/mail', label: 'Mail', icon: 'mail' },
	{ href: '/drive', label: 'Drive', icon: 'drive' },
	{ href: '/player', label: 'Player', icon: 'player' }
];

export const space = {
	name: 'Bley',
	description: 'Regenerative family farm in Saint-Nicodème.',
	siteUrl: 'https://bley.farm'
};
