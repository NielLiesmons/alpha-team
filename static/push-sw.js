/**
 * Imported by the Workbox-generated service worker (vite-pwa).
 * Handles Web Push + notification taps for Home Screen PWAs (incl. iOS 16.4+).
 *
 * alpha-sw-boot: v14 — seed alpha-pages-v11; adopt older pages caches; keep the
 * prior workbox precache so stale HTML still resolves hashed modules offline;
 * Cache-first immutable fallback across ALL caches (kills empty-pages /
 * module-mismatch “Still opening offline” loops).
 * Also seed + serve `/_app/env.js` (Kit writes it after Workbox glob — never
 * landed in precache; offline open blanked on that single dynamic import).
 * Serve `/icons/space-icon.png` from alpha-space-brand-v1 for iOS Add to Home.
 * Push tip/mid handoff unchanged.
 */
/* eslint-disable no-undef */

/** Must match vite.config.js workbox runtimeCaching cacheName. */
var PAGES_CACHE = 'alpha-pages-v11';
var SHELL_PATHS = ['/', '/chat'];
/** Kit runtime env + version — not in workbox precache; required for offline boot. */
var APP_META_PATHS = ['/_app/env.js', '/_app/version.json'];
var APP_META_CACHE = 'alpha-app-meta-v1';
/** Decrypted space brand PNG (written by space-brand.svelte.js). */
var SPACE_ICON_PATH = '/icons/space-icon.png';
var SPACE_ICON_CACHE = 'alpha-space-brand-v1';

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
			/* Higher version suffix first (v10 before v9). */
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
 * Keep the newest 2 workbox precaches so a pages HTML that still points at the
 * previous deploy’s hashes can resolve offline after skipWaiting + claim.
 * (cleanupOutdatedCaches is off in vite.config — we trim here instead.)
 */
async function trimOldPrecaches() {
	try {
		var names = await caches.keys();
		var precaches = names
			.filter(function (name) {
				return name.indexOf('workbox-precache') === 0;
			})
			.sort(function (a, b) {
				return b.localeCompare(a, undefined, { numeric: true });
			});
		/* Keep two generations; drop the rest. */
		for (var i = 2; i < precaches.length; i++) {
			try {
				await caches.delete(precaches[i]);
			} catch (e) {
				/* ignore */
			}
		}
	} catch (e) {
		/* ignore */
	}
}

/**
 * NetworkFirst only fills the pages cache after an online navigation. SW updates
 * bump the cache name → empty cache → offline open fails with Response.error().
 * Seed via network when online; if offline, adopt the last-good pages cache.
 */
async function seedAppMetaCache() {
	try {
		var cache = await caches.open(APP_META_CACHE);
		await Promise.all(
			APP_META_PATHS.map(async function (path) {
				try {
					var res = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
					if (res && res.ok) await cache.put(path, res.clone());
				} catch (e) {
					/* Offline SW update — keep prior meta if any. */
				}
			})
		);
	} catch (e) {
		/* never break install */
	}
}

async function seedPagesCache() {
	try {
		await seedAppMetaCache();
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
		await trimOldPrecaches();
	} catch (e) {
		/* never break install */
	}
}

/**
 * Hashed modules: search EVERY Cache API bucket (current + prior workbox
 * precache, runtime caches). Workbox precacheAndRoute only knows the active
 * manifest — after a deploy, cached HTML can still reference the previous
 * generation. Without this, airplane kill-reopen 404s → boot watchdog loop.
 */
async function matchImmutable(request) {
	var url = new URL(request.url);
	var pathname = url.pathname;
	var ignore = { ignoreSearch: true };
	var direct =
		(await caches.match(request, ignore)) || (await caches.match(pathname, ignore));
	if (direct) return direct;
	try {
		var names = await caches.keys();
		for (var i = 0; i < names.length; i++) {
			var cache = await caches.open(names[i]);
			var hit = (await cache.match(request, ignore)) || (await cache.match(pathname, ignore));
			if (hit) return hit;
			var keys = await cache.keys();
			for (var j = 0; j < keys.length; j++) {
				try {
					if (new URL(keys[j].url).pathname === pathname) {
						var res = await cache.match(keys[j]);
						if (res) return res;
					}
				} catch (e) {
					/* ignore */
				}
			}
		}
	} catch (e) {
		/* ignore */
	}
	try {
		return await fetch(request);
	} catch (e2) {
		return Response.error();
	}
}

self.addEventListener('install', function (event) {
	event.waitUntil(seedPagesCache());
});

self.addEventListener('activate', function (event) {
	event.waitUntil(seedPagesCache());
});

/*
 * Register before Workbox’s fetch listener (importScripts runs first). First
 * respondWith wins — we own /_app/immutable/* so prior precaches stay reachable.
 */
self.addEventListener('fetch', function (event) {
	var req = event.request;
	if (req.method !== 'GET') return;
	var url;
	try {
		url = new URL(req.url);
	} catch (e) {
		return;
	}
	if (url.origin !== self.location.origin) return;
	/* Space brand icon for iOS apple-touch / Add to Home (never blob:). */
	if (url.pathname === SPACE_ICON_PATH) {
		event.respondWith(
			(async function () {
				try {
					var cache = await caches.open(SPACE_ICON_CACHE);
					var hit =
						(await cache.match(req, { ignoreSearch: true })) ||
						(await cache.match(SPACE_ICON_PATH, { ignoreSearch: true })) ||
						(await cache.match(url.href, { ignoreSearch: true }));
					if (hit) return hit;
				} catch (e) {
					/* fall through */
				}
				try {
					return await fetch(req);
				} catch (e2) {
					return Response.error();
				}
			})()
		);
		return;
	}
	/* Kit env/version — CacheFirst across meta + any bucket (same as immutable). */
	if (APP_META_PATHS.indexOf(url.pathname) !== -1) {
		event.respondWith(matchImmutable(req));
		return;
	}
	if (url.pathname.indexOf('/_app/immutable/') !== 0) return;
	event.respondWith(matchImmutable(req));
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
