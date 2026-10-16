/**
 * alpha-api mail / campaigns client (Bley project).
 * Token: localStorage `alpha-admin-api-token` or PUBLIC_ALPHA_API_TOKEN.
 */

const PROJECT = 'bley';

export function apiBase() {
	const fromEnv =
		typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_ALPHA_API_URL
			? String(import.meta.env.PUBLIC_ALPHA_API_URL).replace(/\/$/, '')
			: '';
	return fromEnv || 'https://api.bley.farm';
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
	const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
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
	return api(`/v1/projects/${PROJECT}/mail`);
}

/**
 * @param {{ from?: string, welcome?: object }} patch
 */
export function saveMailSettings(patch) {
	return api(`/v1/projects/${PROJECT}/mail`, {
		method: 'PUT',
		body: JSON.stringify(patch)
	});
}

export function fetchCampaigns() {
	return api(`/v1/projects/${PROJECT}/campaigns`);
}

/**
 * @param {{ subject: string, body: string }} input
 */
export function createCampaign(input) {
	return api(`/v1/projects/${PROJECT}/campaigns`, {
		method: 'POST',
		body: JSON.stringify(input)
	});
}

/**
 * @param {string} id
 */
export function sendCampaign(id) {
	return api(`/v1/projects/${PROJECT}/campaigns/${encodeURIComponent(id)}/send`, {
		method: 'POST'
	});
}
