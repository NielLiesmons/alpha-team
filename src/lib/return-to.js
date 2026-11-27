/**
 * Player → Team → Player handoff.
 * Player opens Admin with ?return_to=<player origin>/ so after Drive + actor
 * cookies are written, Admin redirects back in the same tab (iOS Safari ITP-safe).
 */

import { parentDomain, serviceOrigin } from './space-host.js';

const RETURN_PARAM = 'return_to';
const STORAGE_KEY = 'alpha.admin.return_to.v1';

/**
 * @param {string} raw
 * @returns {string | null} normalized href or null if not an allowed Player origin
 */
export function sanitizeReturnTo(raw) {
	const s = String(raw || '').trim();
	if (!s) return null;
	let u;
	try {
		u = new URL(s);
	} catch {
		return null;
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
	if (u.username || u.password) return null;

	const allowed = new Set();
	const fromEnv = serviceOrigin(
		typeof import.meta !== 'undefined' ? import.meta.env?.PUBLIC_PLAYER_URL : '',
		'player'
	);
	if (fromEnv) {
		try {
			allowed.add(new URL(fromEnv).origin);
		} catch {
			/* ignore */
		}
	}
	const apex = parentDomain();
	if (apex) allowed.add(`https://player.${apex}`);
	// Local Player vite default
	allowed.add('http://localhost:5175');
	allowed.add('http://127.0.0.1:5175');

	if (!allowed.has(u.origin)) return null;
	// Keep path/query/hash so deep links survive the round-trip.
	return u.href;
}

/** Capture ?return_to= from the current URL into sessionStorage (survives WelcomeGate). */
export function absorbReturnToFromLocation() {
	if (typeof location === 'undefined' || typeof sessionStorage === 'undefined') return;
	try {
		const u = new URL(location.href);
		const raw = u.searchParams.get(RETURN_PARAM);
		if (!raw) return;
		const safe = sanitizeReturnTo(raw);
		if (!safe) return;
		sessionStorage.setItem(STORAGE_KEY, safe);
		u.searchParams.delete(RETURN_PARAM);
		const next = u.pathname + (u.search ? u.search : '') + u.hash;
		history.replaceState({}, '', next || '/');
	} catch {
		/* ignore */
	}
}

/** @returns {string | null} */
export function peekReturnTo() {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		return sanitizeReturnTo(sessionStorage.getItem(STORAGE_KEY) || '');
	} catch {
		return null;
	}
}

export function clearReturnTo() {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		/* ignore */
	}
}

/**
 * If a safe return_to is pending, navigate there (same tab).
 * Call only after Drive session + actor email are written to shared cookies.
 * @returns {boolean} true if navigation started
 */
export function redirectToReturnToIfAny() {
	const href = peekReturnTo();
	if (!href) return false;
	clearReturnTo();
	if (typeof location !== 'undefined') {
		location.assign(href);
		return true;
	}
	return false;
}
