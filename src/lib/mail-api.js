/**
 * alpha-api mail / campaigns client for the current Space project.
 * Token: localStorage `alpha-admin-api-token` or PUBLIC_ALPHA_API_TOKEN.
 */

import { projectSlug, serviceOrigin } from './space-host.js';

function project() {
	return projectSlug();
}

export function apiBase() {
	const fromEnv =
		typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_ALPHA_API_URL
			? String(import.meta.env.PUBLIC_ALPHA_API_URL).replace(/\/$/, '')
			: '';
	return (
		fromEnv ||
		serviceOrigin('', 'api') ||
		(typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 'http://127.0.0.1:8788' : '')
	);
}

export function getAdminToken() {
	if (typeof localStorage === 'undefined') return '';
	return (
		localStorage.getItem('alpha-admin-api-token') ||
		(typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_ALPHA_API_TOKEN
			? String(import.meta.env.PUBLIC_ALPHA_API_TOKEN)
			: '') ||
		''
	);
}

export function setAdminToken(token) {
	localStorage.setItem('alpha-admin-api-token', token.trim());
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function api(path, init = {}) {
	const headers = new Headers(init.headers || {});
	if (!headers.has('content-type') && init.body) {
		headers.set('content-type', 'application/json');
	}
	const token = getAdminToken();
	if (token) headers.set('authorization', `Bearer ${token}`);
	const base = apiBase();
	if (!base) throw new Error('API base URL is not configured');
	const res = await fetch(`${base}${path}`, { ...init, headers });
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = { error: text || res.statusText };
	}
	if (!res.ok) {
		const msg = data?.error || data?.message || res.statusText || `HTTP ${res.status}`;
		throw new Error(msg);
	}
	return data;
}

export function fetchMailSettings() {
	return api(`/v1/projects/${project()}/mail`);
}

/**
 * @param {{ from?: string, welcome?: object }} patch
 */
export function saveMailSettings(patch) {
	return api(`/v1/projects/${project()}/mail`, {
		method: 'PUT',
		body: JSON.stringify(patch)
	});
}

export function fetchCampaigns() {
	return api(`/v1/projects/${project()}/campaigns`);
}

/** Public site posts / letters / events (no admin token required). */
export function fetchPosts() {
	return api(`/v1/projects/${project()}/posts`);
}

/** Full post detail including body_markdown. */
export function fetchPost(idOrSlug) {
	return api(`/v1/projects/${project()}/posts/${encodeURIComponent(idOrSlug)}`);
}

/**
 * Update website post (sets updated_at). Does not re-email subscribers.
 * @param {string} idOrSlug
 * @param {{ title?: string, summary?: string, body_html?: string, body_markdown?: string, kind?: string, clear_summary?: boolean }} patch
 */
export function updatePost(idOrSlug, patch) {
	return api(`/v1/projects/${project()}/posts/${encodeURIComponent(idOrSlug)}`, {
		method: 'PATCH',
		body: JSON.stringify(patch)
	});
}

/**
 * @param {string} idOrSlug
 */
export function deletePost(idOrSlug) {
	return api(`/v1/projects/${project()}/posts/${encodeURIComponent(idOrSlug)}`, {
		method: 'DELETE'
	});
}

/**
 * @param {{
 *   subject: string,
 *   body: string,
 *   description?: string,
 *   image_url?: string,
 *   publisher_email?: string,
 *   publisher_name?: string,
 *   audience_id?: string
 * }} input
 */
export function createCampaign(input) {
	return api(`/v1/projects/${project()}/campaigns`, {
		method: 'POST',
		body: JSON.stringify(input)
	});
}

/**
 * @param {string} id
 * @param {{
 *   subject?: string,
 *   body?: string,
 *   description?: string,
 *   image_url?: string,
 *   publisher_email?: string,
 *   publisher_name?: string,
 *   audience_id?: string,
 *   scheduled_at?: string | null
 * }} patch
 */
export function patchCampaign(id, patch) {
	return api(`/v1/projects/${project()}/campaigns/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		body: JSON.stringify(patch)
	});
}

/**
 * @param {string} id
 */
export function sendCampaign(id) {
	return api(`/v1/projects/${project()}/campaigns/${encodeURIComponent(id)}/send`, {
		method: 'POST'
	});
}

/**
 * @param {string} id
 * @param {string} scheduledAt ISO datetime
 */
export function scheduleCampaign(id, scheduledAt) {
	return api(`/v1/projects/${project()}/campaigns/${encodeURIComponent(id)}/schedule`, {
		method: 'POST',
		body: JSON.stringify({ scheduled_at: scheduledAt })
	});
}

/**
 * @param {string} id
 * @param {{ deletePost?: boolean }} [opts]
 */
export function deleteCampaign(id, opts = {}) {
	const q = opts.deletePost === false ? '?delete_post=false' : '';
	return api(`/v1/projects/${project()}/campaigns/${encodeURIComponent(id)}${q}`, {
		method: 'DELETE'
	});
}

export function fetchModerationComments() {
	return api(`/v1/projects/${project()}/comments/moderation`);
}

export function fetchAudiences() {
	return api(`/v1/projects/${project()}/audiences`);
}

/**
 * @param {{ title: string, description?: string }} input
 */
export function createAudience(input) {
	return api(`/v1/projects/${project()}/audiences`, {
		method: 'POST',
		body: JSON.stringify(input)
	});
}

/**
 * @param {string} id
 * @param {{ title?: string, description?: string }} patch
 */
export function patchAudience(id, patch) {
	return api(`/v1/projects/${project()}/audiences/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		body: JSON.stringify(patch)
	});
}

/** @param {string} id */
export function deleteAudience(id) {
	return api(`/v1/projects/${project()}/audiences/${encodeURIComponent(id)}`, {
		method: 'DELETE'
	});
}

/**
 * @param {string} id
 * @param {{ all?: boolean }} [opts]
 */
export function fetchAudienceMembers(id, opts = {}) {
	const q = opts.all ? '?all=1' : '';
	return api(`/v1/projects/${project()}/audiences/${encodeURIComponent(id)}/subscribers${q}`);
}

/**
 * @param {string} id
 * @param {{ email: string, name?: string }} input
 */
export function addAudienceMember(id, input) {
	return api(`/v1/projects/${project()}/audiences/${encodeURIComponent(id)}/subscribers`, {
		method: 'POST',
		body: JSON.stringify(input)
	});
}

/**
 * @param {string} id
 * @param {string} csv
 */
export function importAudienceCsv(id, csv) {
	return api(`/v1/projects/${project()}/audiences/${encodeURIComponent(id)}/import`, {
		method: 'POST',
		body: JSON.stringify({ csv })
	});
}

/**
 * First-party cookieless analytics summary (chart-ready series).
 * @param {number} [days=30]
 */
export function fetchAnalyticsSummary(days = 30) {
	const n = Math.max(1, Math.min(90, Number(days) || 30));
	return api(`/v1/projects/${project()}/analytics/summary?days=${n}`);
}

/** @param {string} id */
export function approveComment(id) {
	return api(`/v1/projects/${project()}/comments/${encodeURIComponent(id)}/approve`, {
		method: 'POST'
	});
}

/** @param {string} id */
export function rejectComment(id) {
	return api(`/v1/projects/${project()}/comments/${encodeURIComponent(id)}/reject`, {
		method: 'POST'
	});
}

/** @param {string} id */
export function banComment(id) {
	return api(`/v1/projects/${project()}/comments/${encodeURIComponent(id)}/ban`, {
		method: 'POST'
	});
}
