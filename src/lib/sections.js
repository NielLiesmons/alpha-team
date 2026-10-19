/**
 * Primary nav IA. Icons live in alpha-ui/icons (shared design system).
 */

/**
 * @typedef {{
 *   href: string,
 *   label: string,
 *   icon: string,
 *   countKey?: 'tasks' | 'projects' | 'notes' | 'ledger',
 *   createKind?: 'task' | 'project' | 'note' | 'newsletter' | 'ledger'
 * }} NavItem
 */

/** @type {NavItem[]} */
export const primaryNav = [
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/mail', label: 'Mail', icon: 'mail' },
	{ href: '/drive', label: 'Drive', icon: 'drive' },
	{ href: '/projects', label: 'Projects', icon: 'projects', countKey: 'projects', createKind: 'project' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks', countKey: 'tasks', createKind: 'task' },
	{ href: '/notes', label: 'Notes', icon: 'notes', countKey: 'notes', createKind: 'note' },
	{
		href: '/accounting',
		label: 'Accounting',
		icon: 'accounting',
		countKey: 'ledger',
		createKind: 'ledger'
	},
	{ href: '/calendar', label: 'Calendar', icon: 'calendar' },
	{ href: '/website', label: 'Website', icon: 'website' },
	{
		href: '/publications',
		label: 'Publications',
		icon: 'publications',
		createKind: 'newsletter'
	},
	{ href: '/player', label: 'Player', icon: 'player' }
];

/**
 * Horizontal mobile pill — Chat centered; selection scrolls to active.
 */
export const mobileNav = [
	{ href: '/publications', label: 'Publications', icon: 'publications' },
	{ href: '/website', label: 'Website', icon: 'website' },
	{ href: '/calendar', label: 'Calendar', icon: 'calendar' },
	{ href: '/accounting', label: 'Accounting', icon: 'accounting' },
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
