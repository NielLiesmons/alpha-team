/**
 * Deep-link sync for Entreprises (static-host safe query params).
 * Prefers stable keys (enterprise.key / table.key / metric.key) so URLs stay readable.
 * Uses history.replaceState — never goto — so AppShell section effects don't wipe selection.
 *
 *   /entreprises
 *   /entreprises?e=eggs
 *   /entreprises?e=eggs&t=egg_params
 *   /entreprises?e=eggs&m=eggs.gross_total
 *   /entreprises?e=eggs&v=<viewId|title-slug>
 *   /entreprises?e=eggs&f=<formId>
 */
import {
	captureForms,
	dataTables,
	dataViews,
	enterprises,
	metrics,
	selectEntity,
	ui
} from '$lib/workspace.svelte.js';

/** @param {string} title */
function slugify(title) {
	return String(title || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * @param {any} ent
 * @returns {string}
 */
export function enterpriseUrlKey(ent) {
	if (!ent) return '';
	if (ent.key) return String(ent.key);
	const slug = slugify(ent.title);
	return slug || String(ent.id);
}

/**
 * @param {string} ref
 */
function resolveEnterprise(ref) {
	if (!ref) return null;
	return (
		enterprises.find((x) => String(x.id) === ref) ||
		enterprises.find((x) => String(x.key) === ref) ||
		enterprises.find((x) => enterpriseUrlKey(x) === ref) ||
		null
	);
}

/**
 * @param {string} ref
 * @param {string | null} [enterpriseId]
 */
function resolveTable(ref, enterpriseId = null) {
	if (!ref) return null;
	const byId = dataTables.find((x) => String(x.id) === ref);
	if (byId) return byId;
	const candidates = dataTables.filter((x) => String(x.key) === ref);
	if (enterpriseId) {
		return candidates.find((x) => String(x.enterprise_id) === String(enterpriseId)) || candidates[0] || null;
	}
	return candidates[0] || null;
}

/**
 * @param {string} ref
 * @param {string | null} [enterpriseId]
 */
function resolveMetric(ref, enterpriseId = null) {
	if (!ref) return null;
	const byId = metrics.find((x) => String(x.id) === ref);
	if (byId) return byId;
	const candidates = metrics.filter((x) => String(x.key) === ref);
	if (enterpriseId) {
		return candidates.find((x) => String(x.enterprise_id) === String(enterpriseId)) || candidates[0] || null;
	}
	return candidates[0] || null;
}

/**
 * @param {string} ref
 * @param {string | null} [enterpriseId]
 */
function resolveView(ref, enterpriseId = null) {
	if (!ref) return null;
	const byId = dataViews.find((x) => String(x.id) === ref);
	if (byId) return byId;
	const candidates = dataViews.filter(
		(x) => slugify(x.title) === ref || String(x.title) === ref
	);
	if (enterpriseId) {
		return candidates.find((x) => String(x.enterprise_id) === String(enterpriseId)) || candidates[0] || null;
	}
	return candidates[0] || null;
}

/**
 * @param {string} ref
 * @param {string | null} [enterpriseId]
 */
function resolveForm(ref, enterpriseId = null) {
	if (!ref) return null;
	const byId = captureForms.find((x) => String(x.id) === ref);
	if (byId) return byId;
	const candidates = captureForms.filter((x) => slugify(x.title) === ref);
	if (enterpriseId) {
		return candidates.find((x) => String(x.enterprise_id) === String(enterpriseId)) || candidates[0] || null;
	}
	return candidates[0] || null;
}

/**
 * @param {{ kind: string, id: string } | null} sel
 * @returns {string}
 */
export function entreprisesHrefForSelection(sel) {
	if (!sel) return '/entreprises';
	const params = new URLSearchParams();
	if (sel.kind === 'enterprise') {
		const ent = enterprises.find((x) => String(x.id) === String(sel.id));
		params.set('e', ent ? enterpriseUrlKey(ent) : sel.id);
	} else if (sel.kind === 'table') {
		const t = dataTables.find((x) => String(x.id) === String(sel.id));
		if (t?.enterprise_id) {
			const ent = enterprises.find((x) => String(x.id) === String(t.enterprise_id));
			if (ent) params.set('e', enterpriseUrlKey(ent));
			else params.set('e', String(t.enterprise_id));
		}
		params.set('t', t?.key || sel.id);
	} else if (sel.kind === 'metric') {
		const m = metrics.find((x) => String(x.id) === String(sel.id));
		if (m?.enterprise_id) {
			const ent = enterprises.find((x) => String(x.id) === String(m.enterprise_id));
			if (ent) params.set('e', enterpriseUrlKey(ent));
			else params.set('e', String(m.enterprise_id));
		}
		params.set('m', m?.key || sel.id);
	} else if (sel.kind === 'view') {
		const v = dataViews.find((x) => String(x.id) === String(sel.id));
		if (v?.enterprise_id) {
			const ent = enterprises.find((x) => String(x.id) === String(v.enterprise_id));
			if (ent) params.set('e', enterpriseUrlKey(ent));
			else params.set('e', String(v.enterprise_id));
		}
		params.set('v', v ? slugify(v.title) || sel.id : sel.id);
	} else if (sel.kind === 'form') {
		const f = captureForms.find((x) => String(x.id) === String(sel.id));
		if (f?.enterprise_id) {
			const ent = enterprises.find((x) => String(x.id) === String(f.enterprise_id));
			if (ent) params.set('e', enterpriseUrlKey(ent));
			else params.set('e', String(f.enterprise_id));
		}
		params.set('f', f ? slugify(f.title) || sel.id : sel.id);
	} else {
		return '/entreprises';
	}
	const q = params.toString();
	return q ? `/entreprises?${q}` : '/entreprises';
}

/** Sync URL to selection without SvelteKit navigation (avoids wiping detail). */
export function syncEntreprisesUrl() {
	if (typeof location === 'undefined') return;
	if (!location.pathname.startsWith('/entreprises')) return;
	const href = entreprisesHrefForSelection(ui.selection);
	if (location.pathname + location.search === href) return;
	history.replaceState(history.state ?? {}, '', href);
}

/**
 * Apply query params → selection. Safe to call on mount / popstate / after hydrate.
 * Resolves keys once lists are present; no-ops if refs not loaded yet.
 * @param {URL} [url]
 */
export function applyEntreprisesUrl(url) {
	const u = url ?? (typeof location !== 'undefined' ? new URL(location.href) : null);
	if (!u || !u.pathname.startsWith('/entreprises')) return;
	const eRef = u.searchParams.get('e');
	const t = u.searchParams.get('t');
	const m = u.searchParams.get('m');
	const v = u.searchParams.get('v');
	const f = u.searchParams.get('f');
	const ent = eRef ? resolveEnterprise(eRef) : null;
	const enterpriseId = ent?.id ?? null;

	if (t) {
		const table = resolveTable(t, enterpriseId);
		if (table) selectEntity('table', table.id);
		return;
	}
	if (m) {
		const metric = resolveMetric(m, enterpriseId);
		if (metric) selectEntity('metric', metric.id);
		return;
	}
	if (v) {
		const view = resolveView(v, enterpriseId);
		if (view) selectEntity('view', view.id);
		return;
	}
	if (f) {
		const form = resolveForm(f, enterpriseId);
		if (form) selectEntity('form', form.id);
		return;
	}
	if (ent) {
		selectEntity('enterprise', ent.id);
	}
}

/**
 * @param {{ kind: string, id: string } | null} sel
 */
export function parentEnterpriseId(sel) {
	if (!sel) return null;
	if (sel.kind === 'enterprise') return null;
	if (sel.kind === 'table') return dataTables.find((x) => x.id === sel.id)?.enterprise_id ?? null;
	if (sel.kind === 'metric') return metrics.find((x) => x.id === sel.id)?.enterprise_id ?? null;
	if (sel.kind === 'view') return dataViews.find((x) => x.id === sel.id)?.enterprise_id ?? null;
	if (sel.kind === 'form') return captureForms.find((x) => x.id === sel.id)?.enterprise_id ?? null;
	return null;
}

/**
 * Select + sync URL in one step (use from Entreprises UI).
 * @param {'enterprise' | 'table' | 'metric' | 'view' | 'form'} kind
 * @param {string} id
 */
export function openEntreprisesEntity(kind, id) {
	selectEntity(kind, String(id));
	syncEntreprisesUrl();
}
