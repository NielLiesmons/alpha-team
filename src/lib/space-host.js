/**
 * Space hostname helpers — customer-agnostic.
 * Derive api/drive/mail/player URLs and project slug from the control-plane host
 * (team.{apex}; legacy admin.{apex} still recognized) or PUBLIC_* env overrides.
 * No hard-coded customer domains.
 */

/** Known product subdomain labels on {apex}. */
const PRODUCT_SUBS = new Set([
	'team',
	'admin', // legacy alias → redirect to team.*
	'player',
	'api',
	'drive',
	'mail',
	'www',
	'chat'
]);

/**
 * @returns {string} apex like `example.com` from `team.example.com`
 */
export function parentDomain() {
	if (typeof location === 'undefined') return '';
	const host = String(location.hostname || '')
		.trim()
		.toLowerCase();
	if (!host || host === 'localhost' || host.endsWith('.localhost')) return '';
	const parts = host.split('.').filter(Boolean);
	if (parts.length < 2) return host;
	if (PRODUCT_SUBS.has(parts[0]) && parts.length >= 3) return parts.slice(1).join('.');
	/* team.example.com → example.com; bare example.com → example.com */
	if (PRODUCT_SUBS.has(parts[0]) && parts.length === 2) return parts.slice(1).join('.');
	return parts.length > 2 ? parts.slice(-2).join('.') : host;
}

/** Cookie Domain attribute for cross-subdomain session (Admin ↔ Player). */
export function cookieDomainAttr() {
	const apex = parentDomain();
	if (!apex || apex.indexOf('.') < 0) return '';
	return `; Domain=.${apex}`;
}

/**
 * @param {string} [envVal]
 * @param {string} sub product subdomain (api, drive, mail, player)
 */
export function serviceOrigin(envVal, sub) {
	const fromEnv = String(envVal || '')
		.trim()
		.replace(/\/$/, '');
	if (fromEnv) return fromEnv;
	const apex = parentDomain();
	if (!apex || typeof location === 'undefined') return '';
	return `${location.protocol}//${sub}.${apex}`;
}

/** Public content API project slug (projects/{slug}/… on alpha-api). */
export function projectSlug() {
	const fromEnv =
		typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_ALPHA_PROJECT
			? String(import.meta.env.PUBLIC_ALPHA_PROJECT).trim()
			: '';
	if (fromEnv) return fromEnv;
	const apex = parentDomain();
	if (!apex) return 'site';
	return apex.split('.')[0] || 'site';
}

/** Mailbox domain for invites (local-part@domain). */
export function mailDomain() {
	const fromEnv =
		typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_MAIL_DOMAIN
			? String(import.meta.env.PUBLIC_MAIL_DOMAIN).trim().toLowerCase()
			: '';
	if (fromEnv) return fromEnv;
	return parentDomain() || 'example.com';
}
