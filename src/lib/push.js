/**
 * Web Push: subscribe this device, store subscription on Drive, fan-out via alpha-api relay.
 * Browsers cannot POST to APNs/FCM (CORS) — the Space api host encrypts + delivers.
 */

import { apiBase } from './mail-api.js';
import {
	listPushSubscriptions,
	removePushSubscription,
	upsertPushSubscription
} from './drive/entities.js';
import { activeSession } from './drive/session.svelte.js';

const DEVICE_KEY = 'alpha-admin-device-id';
const SUB_CACHE_KEY = 'alpha-admin-push-endpoint';

/** @returns {string} */
export function deviceId() {
	if (typeof localStorage === 'undefined') return 'unknown';
	let id = localStorage.getItem(DEVICE_KEY);
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem(DEVICE_KEY, id);
	}
	return id;
}

/** True when Notification / PushManager exist (Home Screen on iOS; Chrome anywhere). */
export function pushApiAvailable() {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		typeof Notification !== 'undefined'
	);
}

export function notificationPermission() {
	if (typeof Notification === 'undefined') return 'unsupported';
	return Notification.permission;
}

/**
 * @returns {Promise<string>} URL-safe base64 VAPID public key
 */
export async function fetchVapidPublicKey() {
	const res = await fetch(`${apiBase()}/v1/push/vapid-public-key`);
	if (!res.ok) throw new Error(`VAPID key unavailable (${res.status}) — is alpha-api running?`);
	const data = await res.json();
	const key = String(data?.publicKey || data?.public_key || '').trim();
	if (!key) throw new Error('Empty VAPID public key from API');
	return key;
}

/** @param {string} base64Url */
function urlBase64ToUint8Array(base64Url) {
	const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
	const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

/**
 * @returns {Promise<ServiceWorkerRegistration>}
 */
async function readyRegistration() {
	const reg = await navigator.serviceWorker.ready;
	if (!reg?.pushManager) throw new Error('Push manager missing — open Alpha from the Home Screen icon on iPhone');
	return reg;
}

/**
 * Request permission + subscribe + persist to Drive.
 * Must run from a user gesture on iOS.
 * @param {string} email
 */
export async function enablePushNotifications(email) {
	if (!pushApiAvailable()) {
		throw new Error(
			'Notifications need the Home Screen app on iPhone (Share → Add to Home Screen), then tap Enable again.'
		);
	}
	const who = String(email || '').trim().toLowerCase();
	if (!who.includes('@')) throw new Error('Pick who you are in Settings first');

	const perm = await Notification.requestPermission();
	if (perm !== 'granted') throw new Error('Notification permission denied');

	const vapid = await fetchVapidPublicKey();
	const reg = await readyRegistration();
	if (!reg.active) {
		throw new Error('Service worker not ready yet — wait a second and try again.');
	}
	const appKey = urlBase64ToUint8Array(vapid);
	let sub = await reg.pushManager.getSubscription();
	if (sub) {
		const existing = sub.options?.applicationServerKey;
		const sameKey =
			existing &&
			existing.byteLength === appKey.byteLength &&
			[...new Uint8Array(existing)].every((b, i) => b === appKey[i]);
		if (!sameKey) {
			await sub.unsubscribe();
			sub = null;
		}
	}
	try {
		if (!sub) {
			sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: appKey
			});
		}
	} catch (e) {
		const name = e instanceof Error ? e.name : '';
		const msg = e instanceof Error ? e.message : String(e);
		if (/push service error/i.test(msg) || name === 'AbortError') {
			throw new Error(
				'Push service unavailable on this device. On Android you need Google Play services and a normal network — then try again.'
			);
		}
		throw e instanceof Error ? e : new Error(msg);
	}

	const json = sub.toJSON();
	const endpoint = String(json.endpoint || '');
	const keys = json.keys || {};
	if (!endpoint || !keys.p256dh || !keys.auth) throw new Error('Incomplete push subscription');

	const session = activeSession();
	if (!session) throw new Error('Connect Drive first');

	const id = deviceId();
	await upsertPushSubscription(session, {
		id,
		email: who,
		endpoint,
		keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
		expirationTime: json.expirationTime ?? null,
		userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
	});

	try {
		localStorage.setItem(SUB_CACHE_KEY, endpoint);
	} catch {
		/* ignore */
	}

	if ('setAppBadge' in navigator) {
		try {
			await navigator.clearAppBadge?.();
		} catch {
			/* ignore */
		}
	}

	return { id, endpoint };
}

/** Unsubscribe this device and remove Drive leaf. */
export async function disablePushNotifications() {
	const reg = await navigator.serviceWorker?.ready;
	const sub = await reg?.pushManager?.getSubscription();
	if (sub) await sub.unsubscribe();

	const session = activeSession();
	const id = deviceId();
	if (session) {
		try {
			await removePushSubscription(session, id);
		} catch {
			/* ignore */
		}
	}
	try {
		localStorage.removeItem(SUB_CACHE_KEY);
	} catch {
		/* ignore */
	}
}

/**
 * @returns {Promise<boolean>}
 */
export async function isPushSubscribed() {
	if (!pushApiAvailable()) return false;
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		return Boolean(sub);
	} catch {
		return false;
	}
}

/**
 * Send one notification through alpha-api → APNs/FCM.
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {{ title: string, body: string, url?: string, tag?: string, badge?: number }} notification
 */
export async function relayPush(subscription, notification) {
	const res = await fetch(`${apiBase()}/v1/push/send`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			subscription: {
				endpoint: subscription.endpoint,
				keys: subscription.keys
			},
			notification: {
				title: notification.title,
				body: notification.body,
				url: notification.url || '/chat',
				tag: notification.tag || 'alpha-chat',
				badge: notification.badge ?? null
			}
		})
	});
	if (res.status === 410 || res.status === 404) {
		return { gone: true };
	}
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(text || `Push relay failed (${res.status})`);
	}
	return { gone: false };
}

/**
 * Fan-out chat alert to every Drive-registered device except the author.
 * Fire-and-forget safe — never blocks the chat send UX.
 * @param {{ authorEmail: string, authorName: string, body: string }} input
 */
export async function notifyChatRecipients(input) {
	const session = activeSession();
	if (!session) return;

	const author = String(input.authorEmail || '').trim().toLowerCase();
	const title = String(input.authorName || author.split('@')[0] || 'Alpha');
	const body = String(input.body || '').trim().slice(0, 140) || 'New message';

	let subs = [];
	try {
		subs = await listPushSubscriptions(session);
	} catch (e) {
		console.warn('push list failed', e);
		return;
	}

	const targets = subs.filter((s) => {
		const email = String(s.email || '').trim().toLowerCase();
		if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return false;
		if (email && email === author) return false;
		return true;
	});

	for (const sub of targets) {
		try {
			const result = await relayPush(
				{ endpoint: sub.endpoint, keys: sub.keys },
				{ title, body, url: '/chat', tag: 'alpha-chat' }
			);
			if (result.gone && sub.id) {
				void removePushSubscription(session, sub.id).catch(() => {});
			}
		} catch (e) {
			console.warn('push send failed', sub.email, e);
		}
	}
}
