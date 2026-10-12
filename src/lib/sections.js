/**
 * Primary nav IA. Icons live in alpha-ui/icons (shared design system).
 * Desktop order: Dashboard first. Mobile pill order centers Dashboard.
 */

/** @type {{ href: string, label: string, icon: string }[]} */
export const primaryNav = [
	{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
	{ href: '/drive', label: 'Drive', icon: 'drive' },
	{ href: '/mail', label: 'Mail', icon: 'mail' },
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/publications', label: 'Publications', icon: 'publications' },
	{ href: '/projects', label: 'Projects', icon: 'projects' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks' },
	{ href: '/notes', label: 'Notes', icon: 'notes' },
	{ href: '/calendar', label: 'Calendar', icon: 'calendar' }
];

/**
 * Horizontal mobile pill: prominent items nearest Dashboard; selection stays centered.
 * Left ← … Mail, Drive, Tasks | Dashboard | Projects, Chat, Notes … → Right
 */
export const mobileNav = [
	{ href: '/publications', label: 'Publications', icon: 'publications' },
	{ href: '/calendar', label: 'Calendar', icon: 'calendar' },
	{ href: '/notes', label: 'Notes', icon: 'notes' },
	{ href: '/chat', label: 'Chat', icon: 'chat' },
	{ href: '/mail', label: 'Mail', icon: 'mail' },
	{ href: '/drive', label: 'Drive', icon: 'drive' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks' },
	{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
	{ href: '/projects', label: 'Projects', icon: 'projects' }
];

export const space = {
	name: 'Bley',
	host: 'admin.bley.farm'
};
