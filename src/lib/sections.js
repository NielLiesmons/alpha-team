/**
 * Primary nav IA. Icons live in alpha-ui/icons (shared design system).
 * Desktop + mobile IA for Admin.
 */

/**
 * @typedef {{
 *   href: string,
 *   label: string,
 *   icon: string,
 *   countKey?: 'tasks' | 'projects' | 'notes',
 *   createKind?: 'task' | 'project' | 'note'
 * }} NavItem
 */

/** @type {NavItem[]} */
export const primaryNav = [
	{ href: '/drive', label: 'Drive', icon: 'drive' },
	{ href: '/player', label: 'Player', icon: 'player' },
	{ href: '/mail', label: 'Mail', icon: 'mail' },
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/website', label: 'Website', icon: 'website' },
	{ href: '/publications', label: 'Publications', icon: 'publications' },
	{ href: '/projects', label: 'Projects', icon: 'projects', countKey: 'projects', createKind: 'project' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks', countKey: 'tasks', createKind: 'task' },
	{ href: '/notes', label: 'Notes', icon: 'notes', countKey: 'notes', createKind: 'note' },
	{ href: '/calendar', label: 'Calendar', icon: 'calendar' }
];

/**
 * Horizontal mobile pill — selection stays centered on the active item.
 * Left ← … Mail, Drive | Tasks | Projects, Chat, Notes … → Right
 */
export const mobileNav = [
	{ href: '/publications', label: 'Publications', icon: 'publications' },
	{ href: '/website', label: 'Website', icon: 'website' },
	{ href: '/calendar', label: 'Calendar', icon: 'calendar' },
	{ href: '/notes', label: 'Notes', icon: 'notes' },
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/mail', label: 'Mail', icon: 'mail' },
	{ href: '/player', label: 'Player', icon: 'player' },
	{ href: '/drive', label: 'Drive', icon: 'drive' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks' },
	{ href: '/projects', label: 'Projects', icon: 'projects' }
];

export const space = {
	name: 'Bley',
	description: 'Regenerative family farm in Saint-Nicodème.',
	siteUrl: 'https://bley.farm'
};
