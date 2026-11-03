/** UI-only sample posts for empty Spaces (generic placeholders). */

/** @typedef {'draft' | 'published' | 'sent'} PostStatus */

export const seedPosts = [
	{
		id: 'welcome',
		title: 'Welcome',
		slug: 'welcome',
		status: /** @type {PostStatus} */ ('published'),
		date: '2026-01-01',
		body: `Welcome to your Space.

Replace this letter with your own story when you are ready.`
	},
	{
		id: 'update',
		title: 'First update',
		slug: 'first-update',
		status: /** @type {PostStatus} */ ('draft'),
		date: '2026-02-01',
		body: `Draft update — publish when ready.`
	}
];
