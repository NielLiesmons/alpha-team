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
 * @param {{ subject: string, body: string, description?: string, image_url?: string }} input
 */
export function createCampaign(input) {
	return api(`/v1/projects/${project()}/campaigns`, {
		method: 'POST',
		body: JSON.stringify(input)
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
