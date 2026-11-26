/**
 * Imported by the Workbox-generated service worker (vite-pwa).
 * Handles Web Push + notification taps for Home Screen PWAs (incl. iOS 16.4+).
 *
 * alpha-sw-boot: v8 — local-first boot (pages-v7) + push tip/mid handoff unchanged.
 */
/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
	event.waitUntil(handlePush(event));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const raw = event.notification?.data;
	const data = raw && typeof raw === 'object' ? raw : {};
	const tip = typeof data.tip === 'string' ? data.tip.trim() : '';
	const messageId = typeof data.messageId === 'string' ? data.messageId.trim() : '';
	const base = typeof data.url === 'string' && data.url ? data.url : '/chat';
	event.waitUntil(openOrFocus(base, { tip, messageId, fromClick: true }));
});

self.addEventListener('pushsubscriptionchange', (event) => {
	/* Subscription rotated by the browser — page will re-subscribe on next open. */
	event.waitUntil(Promise.resolve());
});

/**
 * @param {{ tip?: string, messageId?: string, fromClick?: boolean }} [meta]
 */
async function wakeClients(meta = {}) {
	const tip = typeof meta.tip === 'string' ? meta.tip.trim() : '';
	const messageId = typeof meta.messageId === 'string' ? meta.messageId.trim() : '';
	const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	for (const client of all) {
		try {
			client.postMessage({
				type: meta.fromClick ? 'push-open' : 'chat-wake',
				tip: tip || undefined,
				messageId: messageId || undefined
			});
		} catch {
			/* ignore */
		}
	}
}

/**
 * Build /chat deep link so cold starts still force an urgent mailbox pull.
 * @param {string} path
 * @param {{ tip?: string, messageId?: string }} meta
 */
function chatOpenUrl(path, meta = {}) {
	const u = new URL(path || '/chat', self.registration.scope);
	if (!u.pathname || u.pathname === '/') u.pathname = '/chat';
	u.searchParams.set('push', '1');
	if (meta.tip) u.searchParams.set('tip', meta.tip);
	if (meta.messageId) u.searchParams.set('mid', meta.messageId);
	return u.href;
}

async function handlePush(event) {
	/** @type {{ title?: string, body?: string, url?: string, tag?: string, tip?: string, messageId?: string, badge?: number | null }} */
	let payload = {
		title: 'Alpha',
		body: 'New activity',
		url: '/chat',
		tag: 'alpha-chat',
		tip: '',
		messageId: ''
	};

	try {
		if (event.data) {
			const text = event.data.text();
			try {
				const parsed = JSON.parse(text);
				if (parsed && typeof parsed === 'object') {
					/* Declarative Web Push (iOS 18.4+) nests under notification. */
					const n =
						parsed.notification && typeof parsed.notification === 'object'
							? parsed.notification
							: parsed;
					payload = {
						title: String(n.title || payload.title),
						body: String(n.body || n.message || payload.body),
						url: String(n.url || n.navigate || parsed.url || payload.url),
						tag: String(n.tag || parsed.tag || payload.tag),
						tip: String(n.tip || parsed.tip || ''),
						messageId: String(n.messageId || n.message_id || parsed.messageId || ''),
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

	const tip = String(payload.tip || '').trim();
	const messageId = String(payload.messageId || '').trim();
	/* Wake any already-running clients immediately (before the tap). */
	void wakeClients({ tip, messageId });

	const opts = {
		body: payload.body,
		tag: payload.tag,
		renotify: true,
		data: {
			url: payload.url || '/chat',
			tip,
			messageId
		},
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
 * @param {{ tip?: string, messageId?: string, fromClick?: boolean }} [meta]
 */
async function openOrFocus(path, meta = {}) {
	const tip = typeof meta.tip === 'string' ? meta.tip.trim() : '';
	const messageId = typeof meta.messageId === 'string' ? meta.messageId.trim() : '';
	const url = chatOpenUrl(path, { tip, messageId });
	const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	for (const client of all) {
		if ('focus' in client) {
			try {
				await client.focus();
			} catch {
				/* ignore */
			}
			try {
				client.postMessage({
					type: 'push-open',
					tip: tip || undefined,
					messageId: messageId || undefined,
					url
				});
			} catch {
				/* ignore */
			}
			/*
			 * Never client.navigate() on a warm window — that full-reloads the SPA
			 * and makes the user wait on boot while the message is already cached.
			 * tip/mid ride on postMessage → openChatFromPush → scrollToMessage.
			 */
			return;
		}
	}
	if (self.clients.openWindow) {
		await self.clients.openWindow(url);
	}
}
