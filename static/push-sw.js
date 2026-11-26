/**
 * Imported by the Workbox-generated service worker (vite-pwa).
 * Handles Web Push + notification taps for Home Screen PWAs (incl. iOS 16.4+).
 *
 * alpha-sw-boot: v11 — seed alpha-pages-v10; offline activate copies prior
 * pages caches so kill-reopen never hits Response.error() after a SW bump.
 * Push tip/mid handoff unchanged.
 */
/* eslint-disable no-undef */

/** Must match vite.config.js workbox runtimeCaching cacheName. */
var PAGES_CACHE = 'alpha-pages-v10';
var SHELL_PATHS = ['/', '/chat'];

/**
 * Copy shell entries from older alpha-pages-* caches into the current one.
 * Used when install/activate runs offline (fetch seed fails) so NetworkFirst
 * still has HTML instead of Response.error().
 * @param {Cache} dest
 * @returns {Promise<boolean>}
 */
async function adoptFromOlderPagesCaches(dest) {
	try {
		var names = await caches.keys();
		var older = names
			.filter(function (name) {
				return name.indexOf('alpha-pages-') === 0 && name !== PAGES_CACHE;
			})
			/* Higher version suffix first (v9 before v8). */
			.sort(function (a, b) {
				return b.localeCompare(a, undefined, { numeric: true });
			});
		for (var i = 0; i < older.length; i++) {
			var src = await caches.open(older[i]);
			var keys = await src.keys();
			if (!keys || !keys.length) continue;
			await Promise.all(
				keys.map(async function (req) {
					try {
						var res = await src.match(req);
						if (res) await dest.put(req, res.clone());
					} catch (e) {
						/* ignore single key */
					}
				})
			);
			var now = await dest.keys();
			if (now && now.length) return true;
		}
	} catch (e) {
		/* ignore */
	}
	return false;
}

/**
 * NetworkFirst only fills the pages cache after an online navigation. SW updates
 * bump the cache name → empty cache → offline open fails with Response.error().
 * Seed via network when online; if offline, adopt the last-good pages cache.
 */
async function seedPagesCache() {
	try {
		var cache = await caches.open(PAGES_CACHE);
		var fetchedFresh = false;
		await Promise.all(
			SHELL_PATHS.map(async function (path) {
				try {
					var res = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
					if (res && res.ok) {
						fetchedFresh = true;
						await cache.put(path, res.clone());
						/* Navigation requests often include the full URL — mirror under that key too. */
						try {
							await cache.put(new Request(path, { mode: 'navigate' }), res.clone());
						} catch (e2) {
							/* ignore — Request mode navigate may be restricted */
						}
					}
				} catch (e) {
					/* Offline SW update — keep whatever is already in the cache. */
				}
			})
		);
		var seeded = await cache.keys();
		if (!seeded || !seeded.length) {
			await adoptFromOlderPagesCaches(cache);
			seeded = await cache.keys();
		}
		/*
		 * Only drop older pages caches after a FRESH network seed. If we merely
		 * adopted stale shells (offline bump), keep prior generations so
		 * handlerDidError can still fall back.
		 */
		if (fetchedFresh && seeded && seeded.length) {
			var names = await caches.keys();
			await Promise.all(
				names.map(function (name) {
					if (name.indexOf('alpha-pages-') === 0 && name !== PAGES_CACHE) {
						return caches.delete(name);
					}
					return Promise.resolve();
				})
			);
		}
	} catch (e) {
		/* never break install */
	}
}

self.addEventListener('install', function (event) {
	event.waitUntil(seedPagesCache());
});

self.addEventListener('activate', function (event) {
	event.waitUntil(seedPagesCache());
});

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
