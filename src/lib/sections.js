/**
 * Primary nav IA. Icons live in alpha-ui/icons (shared design system).
 */

import { parentDomain } from './space-host.js';

/**
 * @typedef {{
 *   href: string,
 *   label: string,
 *   icon?: string,
 *   faviconUrl?: string,
 *   spaceBrand?: boolean,
 *   countKey?: 'chat' | 'tasks' | 'projects' | 'notes' | 'enterprises' | 'ledger',
 *   createKind?: 'task' | 'project' | 'note' | 'newsletter' | 'ledger' | 'cost' | 'sales' | 'enterprise' | 'mail' | 'file' | 'photo',
 *   children?: NavItem[],
 *   active?: boolean
 * }} NavItem
 */

/**
 * @typedef {{
 *   type: 'group',
 *   id: string,
 *   label: string,
 *   creatable?: boolean,
 *   createKind?: string,
 *   items: NavItem[]
 * }} NavGroup
 */

/**
 * Per-site surfaces (order fixed: Publications → Activity → Shop → Content).
 * Opened via selectEntity('pubs', selectionId) into the detail column — never
 * by navigating the list pane away from /website.
 * @type {{ href: string, selectionId: string, labelKey: string, icon: string, createKind?: string }[]}
 */
export const websiteChildren = [
	{
		href: '/website',
		selectionId: 'hub',
		labelKey: 'nav.publications',
		icon: 'publications',
		createKind: 'newsletter'
	},
	{ href: '/website', selectionId: 'audiences', labelKey: 'nav.audiences', icon: 'mail' },
	{ href: '/website', selectionId: 'activity', labelKey: 'nav.activity', icon: 'chat' },
	{ href: '/website', selectionId: 'shop', labelKey: 'nav.shop', icon: 'shop' },
	{ href: '/website', selectionId: 'content', labelKey: 'nav.content', icon: 'website' }
];

/**
 * Sites shown under the WEBSITES nav eyebrow.
 * @type {{
 *   id: string,
 *   host: string,
 *   siteUrl: string,
 *   faviconUrl: string,
 *   isDefault: boolean
 * }[]}
 */
export const websites = [];

/** Display labels for the signed-in Space — brand icon from meta/brand.json. */
export const space = {
	name: 'Space',
	description: '',
	siteUrl: '',
	/** Object URL or https/path for welcome / favicon / PWA / nav. */
	iconUrl: '/icons/icon-192.png',
	/** Active website id in Admin (default www). */
	activeSiteId: 'www'
};

/** @returns {{ id: string, host: string, siteUrl: string, faviconUrl: string, isDefault: boolean } | null} */
export function activeWebsite() {
	return websites.find((w) => w.id === space.activeSiteId) || websites[0] || null;
}

/**
 * Derive Space name + default www.{apex} site from `team.{apex}`.
 * Later: users can add more sites on the same apex; www stays the default one.
 */
export function syncSpaceFromHost() {
	const apex = parentDomain();
	if (!apex) {
		websites.length = 0;
		space.siteUrl = '';
		return;
	}
	const label = apex.split('.')[0] || apex;
	space.name = label.charAt(0).toUpperCase() + label.slice(1);
	const host = `www.${apex}`;
	const siteUrl = `https://${host}`;
	space.siteUrl = siteUrl;
	space.activeSiteId = 'www';
	const existing = websites.find((w) => w.id === 'www');
	if (existing) {
		existing.host = host;
		existing.siteUrl = siteUrl;
		existing.faviconUrl = `${siteUrl}/favicon.ico`;
		existing.isDefault = true;
		return;
	}
	websites.length = 0;
	websites.push({
		id: 'www',
		host,
		siteUrl,
		faviconUrl: `${siteUrl}/favicon.ico`,
		isDefault: true
	});
	/* Prefill from public site favicon until Drive brand loads. */
	if (!space.iconUrl || space.iconUrl === '/icons/icon-192.png') {
		space.iconUrl = `${siteUrl}/favicon.ico`;
	}
}

/**
 * Nav entries — flat sections plus optional WEBSITES group at the end.
 * @returns {(NavItem | NavGroup)[]}
 */
export function navForRole() {
	/** @type {(NavItem | NavGroup)[]} */
	const items = [
		{ href: '/chat', label: 'Chat', icon: 'chat', countKey: 'chat' },
		{ href: '/mail', label: 'Mail', icon: 'mail', createKind: 'mail' },
		{ href: '/drive', label: 'Files', icon: 'folder', createKind: 'file' },
		{ href: '/photos', label: 'Photos', icon: 'photos', createKind: 'photo' },
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
		{ href: '/planning', label: 'Planning', icon: 'planning' }
	];

	/*
	 * Space brand icon (Settings → Appearance / meta/brand) for Website rows.
	 * Prefer space.iconUrl (synced from spaceBrand); fall back to site favicon /
	 * bundled PWA icon — always an <img>, never stroke NavIcon/globe.
	 * UiShell renders spaceBrand with round + thin stroke.
	 */
	const brandIcon =
		String(space.iconUrl || '').trim() ||
		String(websites[0]?.faviconUrl || '').trim() ||
		'/icons/icon-192.png';
	if (websites.length > 0) {
		items.push({
			type: 'group',
			id: 'websites',
			label: 'Websites',
			creatable: true,
			createKind: 'website',
			items: websites.map((w) => ({
				href: '/website',
				label: w.host,
				faviconUrl: brandIcon,
				spaceBrand: true,
				icon: 'website',
				id: w.id
			}))
		});
	} else {
		items.push({
			href: '/website',
			label: 'Websites',
			icon: 'website',
			faviconUrl: brandIcon,
			spaceBrand: true
		});
	}

	return items;
}

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
	{ href: '/drive', label: 'Files', icon: 'folder', createKind: 'file' },
	{ href: '/photos', label: 'Photos', icon: 'photos', createKind: 'photo' },
	{ href: '/settings', label: 'Settings', icon: 'settings' }
];

/** @returns {(NavItem | NavGroup)[]} */
export function mobileNavForRole() {
	return navForRole();
}
