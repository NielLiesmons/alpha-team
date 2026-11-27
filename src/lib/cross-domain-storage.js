/**
 * Shared session storage across Team ↔ Player on the same Space apex
 * (cookies with `Domain=.{apex}` + localStorage mirror).
 *
 * Cookie wins on read (cross-subdomain); write updates both.
 * On localhost, Domain is omitted (host-only cookie + LS).
 *
 * Keys:
 * - `alpha.drive.session.v1` — { url, token, rootKey }
 * - `alpha.actor.v1` — { email }
 *
 * Not HttpOnly — browser Drive client must read root key. Secure + SameSite=Lax.
 */

import { cookieDomainAttr as spaceCookieDomainAttr } from './space-host.js';

const MAX_AGE = 60 * 60 * 24 * 400; // ~13 months

/** @returns {string} */
function cookieDomainAttr() {
	return spaceCookieDomainAttr();
}

/** @returns {boolean} */
function useSecure() {
	return typeof location !== 'undefined' && location.protocol === 'https:';
}

/**
 * @param {string} name
 * @returns {string | null}
 */
export function readCookie(name) {
	if (typeof document === 'undefined') return null;
	const prefix = `${name}=`;
	const parts = document.cookie.split(';');
	for (const part of parts) {
		const s = part.trim();
		if (s.startsWith(prefix)) {
			try {
				return decodeURIComponent(s.slice(prefix.length));
			} catch {
				return s.slice(prefix.length);
			}
		}
	}
	return null;
}

/**
 * @param {string} name
 * @param {string} value
 * @param {number} [maxAge]
 */
export function writeCookie(name, value, maxAge = MAX_AGE) {
	if (typeof document === 'undefined') return;
	let s = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
	if (useSecure()) s += '; Secure';
	s += cookieDomainAttr();
	document.cookie = s;
}

/**
 * @param {string} name
 */
export function clearCookie(name) {
	if (typeof document === 'undefined') return;
	let s = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
	if (useSecure()) s += '; Secure';
	s += cookieDomainAttr();
	document.cookie = s;
}

/**
 * Prefer cookie (shared), then localStorage; migrate LS → cookie when needed.
 * @param {string} key
 * @param {string[]} [legacyKeys] older localStorage keys to migrate
 * @returns {string | null}
 */
export function readShared(key, legacyKeys = []) {
	const fromCookie = readCookie(key);
	if (fromCookie) return fromCookie;

	if (typeof localStorage === 'undefined') return null;
	try {
		const cur = localStorage.getItem(key);
		if (cur) {
			writeCookie(key, cur);
			return cur;
		}
		for (const legacy of legacyKeys) {
			const raw = localStorage.getItem(legacy);
			if (!raw) continue;
			localStorage.setItem(key, raw);
			localStorage.removeItem(legacy);
			writeCookie(key, raw);
			return raw;
		}
	} catch {
		/* ignore */
	}
	return null;
}

/**
 * @param {string} key
 * @param {string} value
 */
export function writeShared(key, value) {
	writeCookie(key, value);
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
	} catch {
		/* quota */
	}
}

/**
 * @param {string} key
 * @param {string[]} [legacyKeys]
 */
export function clearShared(key, legacyKeys = []) {
	clearCookie(key);
	try {
		if (typeof localStorage === 'undefined') return;
		localStorage.removeItem(key);
		for (const legacy of legacyKeys) localStorage.removeItem(legacy);
	} catch {
		/* ignore */
	}
}

export const DRIVE_SESSION_KEY = 'alpha.drive.session.v1';
export const ACTOR_KEY = 'alpha.actor.v1';
/** Pre-shared-session Team actor key (legacy name) */
export const ACTOR_LEGACY_KEYS = ['alpha-admin-actor.v1'];
