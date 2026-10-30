/**
 * Profiles unlocked on *this device* via invite QR/code.
 * Switching only happens among these — not the full Drive member directory.
 */

import { actor, setActiveEmail } from './actor.svelte.js';

const KEY = 'alpha-admin-device-profiles.v1';

/**
 * @typedef {{ email: string, name: string, addedAt: string }} DeviceProfile
 */

/** @type {DeviceProfile[]} */
export const deviceProfiles = $state([]);

function persist() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, JSON.stringify(deviceProfiles));
	} catch {
		/* quota */
	}
}

export function loadDeviceProfiles() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) {
			migrateFromActor();
			return;
		}
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			migrateFromActor();
			return;
		}
		/** @type {DeviceProfile[]} */
		const next = [];
		for (const row of parsed) {
			const email = String(row?.email || '')
				.trim()
				.toLowerCase();
			if (!email.includes('@')) continue;
			next.push({
				email,
				name: String(row?.name || email.split('@')[0] || email),
				addedAt: String(row?.addedAt || new Date().toISOString())
			});
		}
		deviceProfiles.splice(0, deviceProfiles.length, ...next);
		migrateFromActor();
	} catch {
		migrateFromActor();
	}
}

/** Legacy: one actor email with no device-profile list → seed it. */
function migrateFromActor() {
	const email = (actor.email || '').trim().toLowerCase();
	if (!email.includes('@')) return;
	if (deviceProfiles.some((p) => p.email === email)) return;
	deviceProfiles.push({
		email,
		name: email.split('@')[0] || email,
		addedAt: new Date().toISOString()
	});
	persist();
}

/**
 * @param {{ email: string, name?: string }} input
 */
export function addDeviceProfile(input) {
	const email = String(input.email || '')
		.trim()
		.toLowerCase();
	if (!email.includes('@')) throw new Error('Invite is missing an email — ask for a new member invite.');
	const name = String(input.name || email.split('@')[0] || email).trim();
	const idx = deviceProfiles.findIndex((p) => p.email === email);
	const row = {
		email,
		name,
		addedAt: idx >= 0 ? deviceProfiles[idx].addedAt : new Date().toISOString()
	};
	if (idx >= 0) deviceProfiles[idx] = row;
	else deviceProfiles.push(row);
	persist();
	return row;
}

/**
 * @param {string} email
 */
export function switchDeviceProfile(email) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	const row = deviceProfiles.find((p) => p.email === e);
	if (!row) throw new Error('That profile is not on this device — add it with an invite code.');
	setActiveEmail(row.email);
	return row;
}

/**
 * Remove a profile from this device only (does not touch Drive members).
 * @param {string} email
 */
export function removeDeviceProfile(email) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	const idx = deviceProfiles.findIndex((p) => p.email === e);
	if (idx < 0) return;
	deviceProfiles.splice(idx, 1);
	persist();
	if (actor.email === e) {
		const next = deviceProfiles[0];
		if (next) setActiveEmail(next.email);
		else setActiveEmail('');
	}
}

/** @param {string} email */
export function hasDeviceProfile(email) {
	const e = String(email || '')
		.trim()
		.toLowerCase();
	return deviceProfiles.some((p) => p.email === e);
}
