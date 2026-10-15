/**
 * Primary nav IA. Icons live in alpha-ui/icons (shared design system).
 * Desktop order: Dashboard first. Mobile pill order centers Dashboard.
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
	{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
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
 * Horizontal mobile pill: prominent items nearest Dashboard; selection stays centered.
 * Left ← … Mail, Drive, Tasks | Dashboard | Projects, Chat, Notes … → Right
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
	{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
	{ href: '/projects', label: 'Projects', icon: 'projects' }
];

export const space = {
	name: 'Bley',
	description: 'Regenerative family farm in Saint-Nicodème.',
	siteUrl: 'https://bley.farm'
};
