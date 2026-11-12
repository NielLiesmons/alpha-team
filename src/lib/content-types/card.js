/**
 * Resolve declarative chat cards from content-type packages.
 * Output is data only — host UI renders icon + type name + title (+ summary).
 * Packages never supply bubble JS/CSS.
 */

import { getContentType } from './registry.js';

/**
 * @param {unknown} obj
 * @param {string} path dot path
 * @returns {unknown}
 */
export function getByPath(obj, path) {
	if (!obj || !path) return undefined;
	const parts = String(path).split('.').filter(Boolean);
	let cur = obj;
	for (const p of parts) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = /** @type {Record<string, unknown>} */ (cur)[p];
	}
	return cur;
}

/**
 * @typedef {{
 *   packageId: string,
 *   entitySchema: string,
 *   icon: string,
 *   typeName: string,
 *   title: string,
 *   summary: string,
 *   open: { mode: 'native' | 'frame', href?: string }
 * }} ContentTypeCard
 */

/**
 * Build a feed card model for an entity (or file-like object).
 * @param {Record<string, unknown> | null | undefined} entity
 * @param {{ packageId?: string, path?: string } | null} [opts]
 * @returns {ContentTypeCard | null}
 */
export function resolveContentTypeCard(entity, opts = null) {
	const schema = String(entity?.schema || opts?.packageId || '').trim();
	const pkg = getContentType(schema) || (opts?.packageId ? getContentType(opts.packageId) : null);
	if (!pkg) return null;

	const titleRaw = getByPath(entity || {}, pkg.chat.title_path);
	const summaryRaw = pkg.chat.summary_path
		? getByPath(entity || {}, pkg.chat.summary_path)
		: undefined;

	const id = String(entity?.id || '').trim();
	const path = String(opts?.path || entity?.path || '').trim();
	const webUrl = String(entity?.web_url || entity?.remote_url || '').trim();
	const href = expandOpenRoute(pkg.open.native_route, {
		id,
		path,
		web_url: webUrl,
		remote_url: String(entity?.remote_url || '').trim()
	});

	return {
		packageId: pkg.id,
		entitySchema: pkg.entity_schema,
		icon: pkg.chat.icon,
		typeName: pkg.chat.type_name,
		title: String(titleRaw ?? '').trim() || pkg.chat.type_name,
		summary: summaryRaw == null ? '' : String(summaryRaw).trim(),
		open: {
			mode: pkg.open.mode,
			href: href || webUrl || undefined
		}
	};
}

/**
 * Quiet activity line from package templates.
 * @param {string} kind create | update | comment | …
 * @param {{ actor?: string, title?: string, entity?: Record<string, unknown>, packageId?: string }} ctx
 * @returns {string}
 */
export function formatContentTypeActivity(kind, ctx = {}) {
	const schema = String(ctx.entity?.schema || ctx.packageId || '').trim();
	const pkg = getContentType(schema);
	if (!pkg) return '';
	const template = pkg.chat.activity?.[kind] || pkg.chat.activity?.update;
	if (!template) return '';
	const title =
		ctx.title ||
		String(getByPath(ctx.entity || {}, pkg.chat.title_path) ?? '').trim() ||
		pkg.chat.type_name;
	return template
		.replaceAll('{actor}', String(ctx.actor || 'Someone').trim() || 'Someone')
		.replaceAll('{title}', title)
		.replaceAll('{type_name}', pkg.chat.type_name);
}

/**
 * @param {string | undefined} route
 * @param {{ id?: string, path?: string, web_url?: string, remote_url?: string }} vars
 */
export function expandOpenRoute(route, vars) {
	if (!route) return '';
	const raw = String(route);
	/* Absolute URL templates (git forge) — do not encode the whole URL. */
	if (raw === '{web_url}' || raw === '{remote_url}') {
		return String(vars.web_url || vars.remote_url || '').trim();
	}
	return raw
		.replaceAll('{id}', encodeURIComponent(vars.id || ''))
		.replaceAll('{path}', encodeURIComponent(vars.path || ''))
		.replaceAll('{web_url}', vars.web_url || '')
		.replaceAll('{remote_url}', vars.remote_url || '');
}
