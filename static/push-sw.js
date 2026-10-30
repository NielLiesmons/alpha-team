/**
 * Imported by the Workbox-generated service worker (vite-pwa).
 * Handles Web Push + notification taps for Home Screen PWAs (incl. iOS 16.4+).
 */
/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
	event.waitUntil(handlePush(event));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const raw = event.notification?.data;
	const data = raw && typeof raw === 'object' ? raw : {};
	const target = typeof data.url === 'string' && data.url ? data.url : '/chat';
	event.waitUntil(openOrFocus(target));
});

self.addEventListener('pushsubscriptionchange', (event) => {
	/* Subscription rotated by the browser — page will re-subscribe on next open. */
	event.waitUntil(Promise.resolve());
});

/**
 * @param {PushEvent} event
 */
async function handlePush(event) {
	/** @type {{ title?: string, body?: string, url?: string, tag?: string, badge?: number | null }} */
	let payload = {
		title: 'Alpha',
		body: 'New activity',
		url: '/chat',
		tag: 'alpha-chat'
	};

	try {
		if (event.data) {
			const text = event.data.text();
			try {
				const parsed = JSON.parse(text);
				if (parsed && typeof parsed === 'object') {
					/* Declarative Web Push (iOS 18.4+) nests under notification. */
					const n = parsed.notification && typeof parsed.notification === 'object'
						? parsed.notification
						: parsed;
					payload = {
						title: String(n.title || payload.title),
						body: String(n.body || n.message || payload.body),
						url: String(n.url || n.navigate || parsed.url || payload.url),
						tag: String(n.tag || parsed.tag || payload.tag),
						badge:
							typeof n.app_badge === 'number'
								? n.app_badge
								: typeof parsed.badge === 'number'
									? parsed.badge
									: null
					};
				} else if (text) {
					payload.body = text;
				}
			} catch {
				if (text) payload.body = text;
			}
		}
	} catch {
		/* keep defaults */
	}

	const opts = {
		body: payload.body,
		tag: payload.tag,
		renotify: true,
		data: { url: payload.url },
		icon: '/icons/icon-192.png',
		badge: '/icons/icon-192.png'
	};

	const show = self.registration.showNotification(payload.title, opts);
	const badge =
		typeof payload.badge === 'number' && 'setAppBadge' in navigator
			? navigator.setAppBadge(payload.badge).catch(() => {})
			: Promise.resolve();

	await Promise.all([show, badge]);
}

/**
 * @param {string} path
 */
async function openOrFocus(path) {
	const url = new URL(path, self.registration.scope).href;
	const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	for (const client of all) {
		if ('focus' in client) {
			await client.focus();
			if ('navigate' in client && client.url !== url) {
				try {
					await client.navigate(url);
				} catch {
					/* older WebKit */
				}
			}
			return;
		}
	}
	if (self.clients.openWindow) {
		await self.clients.openWindow(url);
	}
}
