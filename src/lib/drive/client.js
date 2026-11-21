/**
 * Browser client for alpha-drive ciphertext API.
 * Root key stays in the browser; server never sees plaintext.
 */

import { idbDel, idbGet, idbSet } from '../local-db.js';
import {
	bytesToHex,
	decrypt,
	decryptWithKey,
	encrypt,
	encryptWithKey,
	encryptWithRoot,
	hexToBytes,
	parseRootKey,
	sha256Hex
} from './crypto.js';

/**
 * @typedef {{ url: string, token: string, rootKey: string }} DriveSession
 */

/** @type {{ key: string, tip: string, dir: any } | null} */
let rootDirCache = null;

/** Chat mailbox tip (named tip `chat`) — append-once chain, not a cryptree dir. */
/** @type {{ key: string, tip: string } | null} */
let mailboxTipCache = null;
/** @type {{ key: string, tip: string, messages: any[] } | null} */
let mailboxFeedCache = null;
/** Decrypted mailbox envelopes by ciphertext hash. */
/** @type {Map<string, any>} */
const mailboxEntryCache = new Map();

/** Coalesce concurrent GET /v1/tip — browsers only allow ~6 connections/host. */
/** @type {Map<string, Promise<string>>} */
const tipInflight = new Map();

/** @type {Map<string, Promise<string>>} */
const namedTipInflight = new Map();

/**
 * Serialize Space tip commits (cursors, entities, …). Chat mailbox uses its own chain.
 * @type {Promise<unknown>}
 */
let tipWriteChain = Promise.resolve();

/**
 * Serialize chat mailbox appends (messages, receipts, soft-deletes).
 * @type {Promise<unknown>}
 */
let chatTipWriteChainLocal = Promise.resolve();

/** Named tip for the chat mailbox head pointer. */
export const CHAT_TIP_NAME = 'chat';
/** AAD path for mailbox entry ciphertext (tip hash = sha256 of this blob). */
const CHAT_MAIL_AAD = 'chat/mail';
/**
 * @param {DriveSession} session
 */
function sessionCacheKey(session) {
	return `${session.url}\0${session.rootKey}`;
}

/**
 * Tip-inflight key (token distinguishes Spaces sharing a URL).
 * @param {DriveSession} session
 */
function tipCacheKey(session) {
	return `${session.url}|${String(session.token || '').slice(0, 16)}`;
}

function rootDirIdbKey(session) {
	return `alpha.drive.rootdir.v1:${sessionCacheKey(session)}`;
}

function mailboxFeedIdbKey(session) {
	return `alpha.drive.chatmail.v1:${sessionCacheKey(session)}`;
}

/**
 * In-memory tip from last successful load/put — no network.
 * @param {DriveSession} session
 */
export function peekCachedTip(session) {
	if (!session || !rootDirCache) return '';
	if (rootDirCache.key !== sessionCacheKey(session)) return '';
	return rootDirCache.tip || '';
}

/**
 * In-memory chat mailbox tip — no network.
 * @param {DriveSession} session
 */
export function peekCachedChatTip(session) {
	if (!session || !mailboxTipCache) return '';
	if (mailboxTipCache.key !== sessionCacheKey(session)) return '';
	return mailboxTipCache.tip || '';
}

/**
 * In-memory tip + root dir — no network. Used to skip a getTip RTT on chat send.
 * @param {DriveSession} session
 * @returns {{ tip: string, dir: any } | null}
 */
export function peekCachedRootDir(session) {
	if (!session || !rootDirCache) return null;
	if (rootDirCache.key !== sessionCacheKey(session)) return null;
	if (!rootDirCache.dir) return null;
	return {
		tip: rootDirCache.tip || '',
		dir: structuredClone(rootDirCache.dir)
	};
}

/**
 * @param {DriveSession} session
 * @param {string} tip
 */
function rememberMailboxTip(session, tip) {
	mailboxTipCache = { key: sessionCacheKey(session), tip: tip || '' };
}

/**
 * @param {DriveSession} session
 * @param {string} tip
 * @param {any[]} messages
 */
function rememberMailboxFeed(session, tip, messages) {
	rememberMailboxTip(session, tip);
	mailboxFeedCache = {
		key: sessionCacheKey(session),
		tip: tip || '',
		messages: Array.isArray(messages) ? messages.map((m) => structuredClone(m)) : []
	};
	void idbSet(mailboxFeedIdbKey(session), {
		at: Date.now(),
		tip: tip || '',
		messages: mailboxFeedCache.messages
	}).catch(() => {});
}

/**
 * Drop warm mailbox feed materialization so the next walk rebuilds from tip → prev.
 * Used after bulk remigrate / repair appends (append cache prepend order is not chronological).
 * @param {DriveSession} [session]
 */
export function invalidateMailboxFeedCache(session) {
	if (!session) {
		mailboxFeedCache = null;
		mailboxTipCache = null;
		return;
	}
	const key = sessionCacheKey(session);
	if (mailboxFeedCache?.key === key) mailboxFeedCache = null;
	if (mailboxTipCache?.key === key) mailboxTipCache = null;
	/* Delete — never persist tip+[] or a later stopAt===tip resume will poison the feed. */
	void idbDel(mailboxFeedIdbKey(session)).catch(() => {});
}

/**
 * Last known root dir (memory, then IDB) — never invent an empty tree on tip failure.
 * @param {DriveSession} session
 */
async function fallbackRootDir(session) {
	const cacheKey = sessionCacheKey(session);
	if (rootDirCache && rootDirCache.key === cacheKey && rootDirCache.dir) {
		return { tip: rootDirCache.tip || '', dir: structuredClone(rootDirCache.dir) };
	}
	try {
		const snap = await idbGet(rootDirIdbKey(session));
		if (snap?.dir && typeof snap.dir === 'object') {
			rememberRootDir(snap.dir, snap.tip || '', session);
			return { tip: snap.tip || '', dir: structuredClone(snap.dir) };
		}
	} catch {
		/* ignore */
	}
	return null;
}

/**
 * @param {string} path
 */
function normalizePath(path) {
	return path
		.split('/')
		.filter((s) => s.length > 0)
		.join('/');
}

/**
 * @param {DriveSession} session
 * @param {string} method
 * @param {string} path
 * @param {BodyInit} [body]
 * @param {string} [contentType]
 * @param {AbortSignal} [signal]
 */
async function api(session, method, path, body, contentType, signal) {
	const headers = { Authorization: `Bearer ${session.token}` };
	if (contentType) headers['Content-Type'] = contentType;
	const res = await fetch(`${session.url.replace(/\/$/, '')}${path}`, {
		method,
		headers,
		body,
		signal
	});
	if (!res.ok) {
		throw new Error(`${method} ${path}: ${res.status}`);
	}
	return res;
}

/**
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} tip hash, or '' when the Drive has never been initialized
 */
export async function getTip(session, signal) {
	const key = tipCacheKey(session);
	/* Abortable callers skip the shared promise (they own the lifetime). */
	if (!signal) {
		const pending = tipInflight.get(key);
		if (pending) return pending;
	}
	const headers = { Authorization: `Bearer ${session.token}` };
	const work = (async () => {
		const res = await fetch(`${session.url.replace(/\/$/, '')}/v1/tip`, {
			method: 'GET',
			headers,
			signal
		});
		/* Empty Drive — no tip yet (genesis). */
		if (res.status === 404) return '';
		if (!res.ok) throw new Error(`GET /v1/tip: ${res.status}`);
		const body = await res.json();
		return body.root_hash ?? '';
	})();
	if (!signal) {
		tipInflight.set(key, work);
		void work.finally(() => {
			if (tipInflight.get(key) === work) tipInflight.delete(key);
		});
	}
	return work;
}

/**
 * @param {DriveSession} session
 * @param {string} hash
 */
async function putTip(session, hash) {
	await api(session, 'PUT', '/v1/tip', JSON.stringify({ root_hash: hash }), 'application/json');
}

/**
 * @param {DriveSession} session
 * @param {string} [name]
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
export async function getNamedTip(session, name = CHAT_TIP_NAME, signal) {
	const tipName = String(name || CHAT_TIP_NAME);
	const key = `${tipCacheKey(session)}|named:${tipName}`;
	if (!signal) {
		const pending = namedTipInflight.get(key);
		if (pending) return pending;
	}
	const headers = { Authorization: `Bearer ${session.token}` };
	const work = (async () => {
		const res = await fetch(
			`${session.url.replace(/\/$/, '')}/v1/tips/${encodeURIComponent(tipName)}`,
			{ method: 'GET', headers, signal }
		);
		if (res.status === 404) return '';
		if (!res.ok) throw new Error(`GET /v1/tips/${tipName}: ${res.status}`);
		const body = await res.json();
		return body.root_hash ?? '';
	})();
	if (!signal) {
		namedTipInflight.set(key, work);
		void work.finally(() => {
			if (namedTipInflight.get(key) === work) namedTipInflight.delete(key);
		});
	}
	return work;
}

/**
 * @param {DriveSession} session
 * @param {string} hash
 * @param {string} [name]
 */
export async function putNamedTip(session, hash, name = CHAT_TIP_NAME) {
	const tipName = String(name || CHAT_TIP_NAME);
	await api(
		session,
		'PUT',
		`/v1/tips/${encodeURIComponent(tipName)}`,
		JSON.stringify({ root_hash: hash }),
		'application/json'
	);
}

/**
 * Encrypt plaintext under root+AAD, put block, advance a named tip to that hash.
 * Used for skinny signals (space-meta change-summary, person cursors) that must
 * not require rematerializing the fat Space root dir.
 * @param {DriveSession} session
 * @param {string} tipName
 * @param {string} aadPath
 * @param {Uint8Array | string} plaintext
 * @returns {Promise<string>} ciphertext hash (= named tip)
 */
export async function putNamedEncrypted(session, tipName, aadPath, plaintext) {
	const root = parseRootKey(session.rootKey);
	const bytes =
		typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
	const ct = await encryptWithRoot(root, aadPath, bytes);
	const hash = await sha256Hex(ct);
	await putBlock(session, hash, ct);
	await putNamedTip(session, hash, tipName);
	return hash;
}

/**
 * Read named tip → block → decrypt with root+AAD. Returns null on missing tip.
 * @param {DriveSession} session
 * @param {string} tipName
 * @param {string} aadPath
 * @param {AbortSignal} [signal]
 * @returns {Promise<Uint8Array | null>}
 */
export async function getNamedEncrypted(session, tipName, aadPath, signal) {
	const tip = await getNamedTip(session, tipName, signal);
	if (!tip) return null;
	const ct = await getBlock(session, tip, signal);
	const root = parseRootKey(session.rootKey);
	return decrypt(root, aadPath, ct);
}

/**
 * Decrypt one mailbox envelope by ciphertext hash.
 * @param {DriveSession} session
 * @param {Uint8Array} root
 * @param {string} hash
 * @param {AbortSignal} [signal]
 */
async function decryptMailboxEntry(session, root, hash, signal) {
	const hit = mailboxEntryCache.get(hash);
	if (hit) return hit;
	const ct = await getBlock(session, hash, signal);
	const pt = await decrypt(root, CHAT_MAIL_AAD, ct);
	const doc = JSON.parse(new TextDecoder().decode(pt));
	mailboxEntryCache.set(hash, doc);
	return doc;
}

/**
 * Fold mailbox envelopes (newest-first) into chat messages (newest-first).
 * Optional seedMessages = already-materialized older feed when walking only a tip prefix.
 * @param {{ hash: string, prev?: string | null, entry?: any }[]} newestFirst
 * @param {number} limit
 * @param {any[]} [seedMessages]
 */
function materializeMailboxMessages(newestFirst, limit, seedMessages = []) {
	/** @type {Map<string, any>} */
	const byId = new Map();
	for (const m of Array.isArray(seedMessages) ? seedMessages : []) {
		const id = String(m?.id || '');
		if (id) byId.set(id, { ...m });
	}
	/** @type {Set<string>} */
	const retracted = new Set();
	for (let i = newestFirst.length - 1; i >= 0; i--) {
		const entry = newestFirst[i]?.entry;
		if (!entry || typeof entry !== 'object') continue;
		const kind = String(entry.kind || '');
		if (kind === 'message' && entry.message?.id) {
			const id = String(entry.message.id);
			if (retracted.has(id)) continue;
			byId.set(id, { ...entry.message });
		} else if (kind === 'retract') {
			const id = String(entry.message_id || '');
			if (id) {
				retracted.add(id);
				byId.delete(id);
			}
		} else if (kind === 'tombstone') {
			const id = String(entry.message_id || '');
			if (!id) continue;
			const prev = byId.get(id) || {
				schema: 'alpha.chat_message/1',
				id,
				kind: 'chat',
				author: String(entry.author || ''),
				body: '',
				created_at: entry.deleted_at || '',
				channel_id: 'general',
				delivery: 'sent',
				read_by: []
			};
			byId.set(id, {
				...prev,
				body: '',
				deleted: true,
				deleted_at: entry.deleted_at || prev.deleted_at || '',
				author: String(entry.author || prev.author || '')
			});
		} else if (kind === 'receipts') {
			const reader = String(entry.reader || '')
				.trim()
				.toLowerCase();
			const ids = Array.isArray(entry.message_ids) ? entry.message_ids.map(String) : [];
			if (!reader || !ids.length) continue;
			for (const id of ids) {
				const msg = byId.get(id);
				if (!msg) continue;
				const readBy = Array.isArray(msg.read_by)
					? msg.read_by.map((e) => String(e).toLowerCase())
					: [];
				if (!readBy.includes(reader)) readBy.push(reader);
				byId.set(id, { ...msg, read_by: readBy, delivery: 'read' });
			}
		}
	}
	const out = [...byId.values()];
	out.sort((a, b) => {
		const c = String(b?.created_at || '').localeCompare(String(a?.created_at || ''));
		if (c) return c;
		return String(b?.id || '').localeCompare(String(a?.id || ''));
	});
	return out.slice(0, limit);
}

/**
 * Append-once mailbox entry + CAS tip advance in one Drive RTT.
 * @param {DriveSession} session
 * @param {any} entry — { kind:'message', message } | receipts | tombstone | retract
 * @param {{ prevTip?: string }} [opts]
 * @returns {Promise<string>} new tip hash
 */
export async function appendMailboxEntry(session, entry, opts = {}) {
	const root = parseRootKey(session.rootKey);
	const run = async () => {
		let prev =
			opts.prevTip != null ? String(opts.prevTip) : peekCachedChatTip(session) || '';
		let rtts = 0;
		const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
		for (let attempt = 0; attempt < 4; attempt++) {
			const envelope = {
				schema: 'alpha.chat_mail/1',
				prev: prev || null,
				at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
				entry
			};
			const pt = new TextEncoder().encode(JSON.stringify(envelope));
			const ct = await encryptWithRoot(root, CHAT_MAIL_AAD, pt);
			const hash = await sha256Hex(ct);
			const res = await fetch(
				`${session.url.replace(/\/$/, '')}/v1/mailboxes/${encodeURIComponent(CHAT_TIP_NAME)}/append`,
				{
					method: 'PUT',
					headers: {
						Authorization: `Bearer ${session.token}`,
						'Content-Type': 'application/octet-stream',
						'x-alpha-hash': hash,
						'x-alpha-prev': prev || ''
					},
					body: new Blob([ct])
				}
			);
			rtts += 1;
			if (res.status === 204 || res.ok) {
				mailboxEntryCache.set(hash, envelope);
				rememberMailboxTip(session, hash);
				/* Prepend message into warm feed cache when possible. */
				if (entry?.kind === 'message' && entry.message && mailboxFeedCache) {
					const key = sessionCacheKey(session);
					if (mailboxFeedCache.key === key) {
						const next = [
							structuredClone(entry.message),
							...mailboxFeedCache.messages.filter((m) => m?.id !== entry.message.id)
						];
						rememberMailboxFeed(session, hash, next);
					}
				} else if (mailboxFeedCache?.key === sessionCacheKey(session)) {
					/* Ops invalidate materialization — next pull rebuilds. */
					mailboxFeedCache = { ...mailboxFeedCache, tip: '' };
				}
				if (typeof console !== 'undefined' && console.debug) {
					console.debug('[chat-latency] appendMailbox', {
						ms: Math.round(
							(typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
						),
						rtts,
						tipBytes: ct.length,
						attempt,
						kind: String(entry?.kind || '')
					});
				}
				return hash;
			}
			if (res.status === 409) {
				let current = '';
				try {
					const body = await res.json();
					current = String(body?.root_hash || '');
				} catch {
					current = '';
				}
				prev = current;
				continue;
			}
			const text = await res.text().catch(() => '');
			throw new Error(`mailbox append: ${res.status} ${text}`.trim());
		}
		throw new Error('mailbox append CAS exhausted');
	};
	return /** @type {Promise<string>} */ (
		(chatTipWriteChainLocal = chatTipWriteChainLocal.then(run, run))
	);
}

/**
 * Walk chat mailbox from tip → prev until limit messages (or stopAt hash).
 * @param {DriveSession} session
 * @param {{
 *   limit?: number,
 *   stopAt?: string,
 *   tip?: string,
 *   signal?: AbortSignal,
 *   onPartial?: (rows: any[]) => void
 * }} [opts]
 * @returns {Promise<{ tip: string, messages: any[] }>}
 */
export async function loadMailboxMessages(session, opts = {}) {
	/* High ceiling: tip→prev must be able to surface full history after remigrate. */
	const limit = Math.max(1, Math.min(5000, Number(opts.limit) || 2000));
	const stopAt = String(opts.stopAt || '');
	const cacheKey = sessionCacheKey(session);
	const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
	/* Cold boot: rehydrate durable chatmail snapshot before any tip walk. */
	if (!mailboxFeedCache || mailboxFeedCache.key !== cacheKey) {
		try {
			const snap = await idbGet(mailboxFeedIdbKey(session));
			if (
				snap &&
				typeof snap === 'object' &&
				Array.isArray(snap.messages) &&
				snap.messages.length > 0
			) {
				mailboxFeedCache = {
					key: cacheKey,
					tip: String(snap.tip || ''),
					messages: snap.messages.map((m) => structuredClone(m))
				};
				if (mailboxFeedCache.tip) {
					mailboxTipCache = { key: cacheKey, tip: mailboxFeedCache.tip };
				}
			}
		} catch {
			/* ignore */
		}
	}
	let tip = opts.tip != null ? String(opts.tip) : '';
	if (!tip) {
		try {
			tip = await getNamedTip(session, CHAT_TIP_NAME, opts.signal);
		} catch (e) {
			if (e?.name === 'AbortError') throw e;
			if (
				mailboxFeedCache &&
				mailboxFeedCache.key === cacheKey &&
				mailboxFeedCache.messages.length > 0
			) {
				return {
					tip: mailboxFeedCache.tip || '',
					messages: mailboxFeedCache.messages.map((m) => structuredClone(m))
				};
			}
			throw e;
		}
	}
	const priorTip = peekCachedChatTip(session);
	const priorFeed =
		mailboxFeedCache &&
		mailboxFeedCache.key === cacheKey &&
		mailboxFeedCache.tip === (stopAt || priorTip) &&
		Array.isArray(mailboxFeedCache.messages) &&
		mailboxFeedCache.messages.length > 0
			? mailboxFeedCache.messages
			: null;

	rememberMailboxTip(session, tip);
	if (!tip) {
		rememberMailboxFeed(session, '', []);
		return { tip: '', messages: [] };
	}
	/*
	 * Warm hit only when we actually have rows. tip+[] is never authoritative —
	 * it happens when stopAt===tip with no priorFeed and would hide full history.
	 */
	if (
		mailboxFeedCache &&
		mailboxFeedCache.key === cacheKey &&
		mailboxFeedCache.tip === tip &&
		Array.isArray(mailboxFeedCache.messages) &&
		mailboxFeedCache.messages.length > 0
	) {
		return {
			tip,
			messages: mailboxFeedCache.messages.map((m) => structuredClone(m))
		};
	}

	const root = parseRootKey(session.rootKey);
	/** @type {{ hash: string, prev?: string | null, entry?: any }[]} */
	const newestFirst = [];
	/*
	 * Incremental tip→stopAt only when we can merge a non-empty prior feed.
	 * stopAt===tip with no priorFeed must full-walk (otherwise we cache []).
	 */
	let walkStop = stopAt || (priorFeed ? priorTip : '');
	if (walkStop && walkStop === tip && !priorFeed) walkStop = '';
	let hash = tip;
	let netFetches = 0;
	let msgCount = 0;
	while (hash && newestFirst.length < limit * 4) {
		if (walkStop && hash === walkStop) break;
		let doc;
		try {
			const cached = mailboxEntryCache.get(hash);
			if (!cached) netFetches += 1;
			doc = await decryptMailboxEntry(session, root, hash, opts.signal);
		} catch {
			break;
		}
		newestFirst.push({ hash, prev: doc?.prev ?? null, entry: doc?.entry });
		if (doc?.entry?.kind === 'message') msgCount += 1;
		if (!walkStop && msgCount >= limit) break;
		hash = doc?.prev ? String(doc.prev) : '';
		if (typeof opts.onPartial === 'function' && msgCount > 0 && msgCount % 12 === 0) {
			opts.onPartial(materializeMailboxMessages(newestFirst, limit, priorFeed || []));
		}
	}
	const messages = materializeMailboxMessages(newestFirst, limit, priorFeed || []);
	/*
	 * Never persist tip+[] from a truncated incremental walk — that becomes a
	 * permanent warm hit and hides remigrated history until hard cache wipe.
	 */
	if (messages.length > 0 || !walkStop) {
		rememberMailboxFeed(session, tip, messages);
	}
	if (typeof opts.onPartial === 'function') opts.onPartial(messages);
	if (typeof console !== 'undefined' && console.debug) {
		console.debug('[chat-latency] listFeed', {
			ms: Math.round(
				(typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
			),
			ids: messages.length,
			netFetches,
			tip: tip.slice(0, 12)
		});
	}
	return { tip, messages: messages.map((m) => structuredClone(m)) };
}

/**
 * @deprecated cryptree chat tip — mailbox cutover. Returns empty dir shape for any stray caller.
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 */
export async function loadChatDirWithTip(session, signal) {
	const tip = await getNamedTip(session, CHAT_TIP_NAME, signal).catch(() => peekCachedChatTip(session));
	return { tip: tip || '', dir: { schema: 'alpha.dir/1', children: {} } };
}

/** @deprecated */
export function peekCachedChatDir(session) {
	const tip = peekCachedChatTip(session);
	if (!tip) return null;
	return { tip, dir: { schema: 'alpha.dir/1', children: {} } };
}

/**
 * @param {DriveSession} session
 * @param {string} hash
 * @param {Uint8Array} ciphertext
 */
export async function putBlock(session, hash, ciphertext) {
	// Blob body is more reliable than raw Uint8Array across browsers/servers.
	const body =
		ciphertext instanceof Uint8Array
			? new Blob([ciphertext])
			: ciphertext;
	await api(session, 'PUT', `/v1/blocks/${hash}`, body);
}

/**
 * @param {DriveSession} session
 * @param {string} hash
 * @param {AbortSignal} [signal]
 */
export async function getBlock(session, hash, signal) {
	const res = await api(session, 'GET', `/v1/blocks/${hash}`, undefined, undefined, signal);
	return new Uint8Array(await res.arrayBuffer());
}

/**
 * @param {any} dir
 * @param {string} tip
 * @param {DriveSession} session
 */
function rememberRootDir(dir, tip, session) {
	rootDirCache = {
		key: sessionCacheKey(session),
		tip,
		dir: structuredClone(dir)
	};
	void idbSet(rootDirIdbKey(session), {
		at: Date.now(),
		tip: tip || '',
		dir: structuredClone(dir)
	}).catch(() => {});
}

/**
 * Load tip + decrypted root dir once per tip (cached in memory + IDB).
 * Offline / tip failure returns the last good dir — never an empty wipe.
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ tip: string, dir: any }>}
 */
export async function loadRootDirWithTip(session, signal) {
	const root = parseRootKey(session.rootKey);
	const cacheKey = sessionCacheKey(session);
	let tip;
	try {
		tip = await getTip(session, signal);
	} catch (e) {
		if (e?.name === 'AbortError') throw e;
		const local = await fallbackRootDir(session);
		if (local) return local;
		throw new Error('Drive unreachable and no local directory cache');
	}
	if (!tip) {
		const local = await fallbackRootDir(session);
		if (local) return local;
		/* Brand-new Space: no tip on server and no device cache — empty root for genesis writes. */
		const empty = { schema: 'alpha.dir/1', children: {} };
		return { tip: '', dir: empty };
	}

	if (rootDirCache && rootDirCache.key === cacheKey && rootDirCache.tip === tip) {
		return { tip, dir: structuredClone(rootDirCache.dir) };
	}

	try {
		const ct = await getBlock(session, tip, signal);
		const pt = await decrypt(root, '', ct);
		const dir = JSON.parse(new TextDecoder().decode(pt));
		rememberRootDir(dir, tip, session);
		return { tip, dir: structuredClone(dir) };
	} catch (e) {
		if (e?.name === 'AbortError') throw e;
		const local = await fallbackRootDir(session);
		if (local) return local;
		throw e instanceof Error ? e : new Error(String(e));
	}
}

/**
 * @param {DriveSession} session
 * @param {AbortSignal} [signal]
 */
export async function loadRootDir(session, signal) {
	const { dir } = await loadRootDirWithTip(session, signal);
	return dir;
}

/**
 * Decrypt a path using an already-loaded root dir (no tip round-trip).
 * @param {DriveSession} session
 * @param {any} dir
 * @param {string} logicalPath
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ bytes: Uint8Array, fileKeyHex: string }>}
 */
export async function getPathFromDir(session, dir, logicalPath, signal) {
	const name = normalizePath(logicalPath);
	const child = dir.children?.[name];
	if (!child) throw new Error(`path not found: ${logicalPath}`);
	const ciphertext = await getBlock(session, child.hash, signal);
	if (!child.wrapped_key) throw new Error('missing wrapped_key on entry');
	const bytes = await decryptWithKey(hexToBytes(child.wrapped_key), ciphertext);
	return { bytes, fileKeyHex: child.wrapped_key };
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {string} kind
 * @param {Uint8Array | string} plaintext
 */
export async function putPath(session, logicalPath, kind, plaintext) {
	await putPaths(session, [{ path: logicalPath, kind, plaintext }]);
}

/**
 * Write many logical paths with a single tip update (encrypt + putBlock in parallel).
 * Retries if tip moved between load and commit. Pass `rematerialize` for index docs
 * (e.g. chat/feed.json) so concurrent writers re-merge instead of clobbering ids.
 * @param {DriveSession} session
 * @param {{ path: string, kind: string, plaintext: Uint8Array | string, display_name?: string }[]} entries
 * @param {{
 *   mergeFirst?: boolean,
 *   skipTipProbe?: boolean,
 *   baseTip?: string,
 *   baseDir?: any,
 *   prePrepared?: Record<string, { hash: string, wrapped_key: string, kind: string, display_name?: string }>,
 *   rematerialize?: (
 *     dir: any,
 *     entries: { path: string, kind: string, plaintext: Uint8Array | string, display_name?: string }[]
 *   ) => Promise<{ path: string, kind: string, plaintext: Uint8Array | string, display_name?: string }[]>
 * }} [opts]
 */
export async function putPaths(session, entries, opts = {}) {
	if (!entries?.length) return;
	const run = () => putPathsUnlocked(session, entries, opts);
	return /** @type {Promise<string | void>} */ (
		(tipWriteChain = tipWriteChain.then(run, run))
	);
}

/**
 * @param {DriveSession} session
 * @param {{ path: string, kind: string, plaintext: Uint8Array | string, display_name?: string }[]} entries
 * @param {{
 *   mergeFirst?: boolean,
 *   skipTipProbe?: boolean,
 *   baseTip?: string,
 *   baseDir?: any,
 *   prePrepared?: Record<string, { hash: string, wrapped_key: string, kind: string, display_name?: string }>,
 *   rematerialize?: (
 *     dir: any,
 *     entries: { path: string, kind: string, plaintext: Uint8Array | string, display_name?: string }[]
 *   ) => Promise<{ path: string, kind: string, plaintext: Uint8Array | string, display_name?: string }[]>
 * }} [opts]
 */
async function putPathsUnlocked(session, entries, opts = {}) {
	const root = parseRootKey(session.rootKey);
	/** @type {{ path: string, kind: string, plaintext: Uint8Array | string }[]} */
	let current = entries;
	/** Reuse ciphertext across tip-conflict retries when plaintext unchanged (chat leaf). */
	/** @type {Map<string, { ptKey: string, row: { name: string, kind: string, hash: string, wrapped_key: string } }>} */
	const preparedByName = new Map();
	if (opts.prePrepared) {
		for (const [path, row] of Object.entries(opts.prePrepared)) {
			const name = normalizePath(path);
			if (!name || !row?.hash || !row?.wrapped_key) continue;
			preparedByName.set(name, {
				ptKey: '\0pre',
				row: { name, kind: row.kind || 'blob', hash: row.hash, wrapped_key: row.wrapped_key }
			});
		}
	}

	let dir = /** @type {any} */ (null);
	let dirHash = '';
	let casRetries = 0;
	const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
	for (let attempt = 0; attempt < 3; attempt++) {
		let tipAtLoad = '';
		let fresh = /** @type {any} */ (null);
		/*
		 * Chat send already resolved tip+dir — reuse on attempt 0 to skip a getTip RTT
		 * (~400–700ms on admin.bley.farm). Retries always re-load.
		 */
		if (
			attempt === 0 &&
			opts.baseTip &&
			opts.baseDir &&
			typeof opts.baseDir === 'object' &&
			peekCachedTip(session) === opts.baseTip
		) {
			tipAtLoad = String(opts.baseTip);
			fresh = structuredClone(opts.baseDir);
		} else {
			({ tip: tipAtLoad, dir: fresh } = await loadRootDirWithTip(session));
		}
		if ((attempt > 0 || opts.mergeFirst) && typeof opts.rematerialize === 'function') {
			current = await opts.rematerialize(fresh, current);
		}

		/** @type {{ name: string, kind: string, hash: string, wrapped_key: string }[]} */
		const prepared = await Promise.all(
			current.map(async (entry) => {
				const name = normalizePath(entry.path);
				if (!name) throw new Error('empty path');
				const bytes =
					typeof entry.plaintext === 'string'
						? new TextEncoder().encode(entry.plaintext)
						: entry.plaintext;
				const ptKey =
					typeof entry.plaintext === 'string'
						? entry.plaintext
						: await sha256Hex(bytes);
				const prev = preparedByName.get(name);
				/* prePrepared rows keep '\0pre' until plaintext changes on rematerialize. */
				if (prev && (prev.ptKey === ptKey || prev.ptKey === '\0pre')) {
					if (prev.ptKey === '\0pre') preparedByName.set(name, { ptKey, row: prev.row });
					return prev.row;
				}
				const { ciphertext, fileKeyHex } = await encrypt(root, name, bytes);
				const hash = await sha256Hex(ciphertext);
				await putBlock(session, hash, ciphertext);
				const row = {
					name,
					kind: entry.kind,
					hash,
					wrapped_key: fileKeyHex,
					...(entry.display_name ? { display_name: String(entry.display_name) } : {})
				};
				preparedByName.set(name, { ptKey, row });
				return row;
			})
		);

		dir = fresh;
		dir.schema = 'alpha.dir/1';
		dir.children = dir.children ?? {};
		for (const row of prepared) {
			const prev = dir.children[row.name];
			const display_name = row.display_name || prev?.display_name || undefined;
			dir.children[row.name] = {
				hash: row.hash,
				kind: row.kind,
				wrapped_key: row.wrapped_key,
				...(display_name ? { display_name: String(display_name) } : {})
			};
		}

		const dirBytes = new TextEncoder().encode(JSON.stringify(dir));
		const dirCt = await encryptWithRoot(root, '', dirBytes);
		dirHash = await sha256Hex(dirCt);
		await putBlock(session, dirHash, dirCt);

		/* Tip moved under us — rematerialize indexes and retry. */
		if (attempt < 2 && !opts.skipTipProbe) {
			let tipNow = tipAtLoad;
			try {
				tipNow = await getTip(session);
			} catch {
				/* proceed */
			}
			if (tipNow && tipAtLoad && tipNow !== tipAtLoad) {
				casRetries += 1;
				continue;
			}
		}

		await putTip(session, dirHash);
		break;
	}
	if (typeof console !== 'undefined' && console.debug) {
		const ms = Math.round(
			(typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
		);
		console.debug('[chat-latency] putPaths', { ms, casRetries, children: Object.keys(dir?.children || {}).length });
	}

	rememberRootDir(dir, dirHash, session);
	try {
		const { markTipApplied } = await import('./tip-gate.js');
		markTipApplied(session, dirHash);
	} catch {
		/* ignore */
	}

	/* Warm leaf cache so the next refresh skips re-download of what we just wrote. */
	try {
		const { putCachedLeaf } = await import('./leaf-cache.js');
		for (const entry of current) {
			const name = normalizePath(entry.path);
			const hash = dir.children?.[name]?.hash;
			if (!hash) continue;
			const doc =
				typeof entry.plaintext === 'string'
					? JSON.parse(entry.plaintext)
					: JSON.parse(new TextDecoder().decode(entry.plaintext));
			void putCachedLeaf(hash, doc);
		}
	} catch {
		/* non-JSON blobs (media) — ignore */
	}

	/* Skinny space-meta watermarks — peers get ASAP badges without fat rematerialize. */
	try {
		const { bumpChangeSummaryFromPuts } = await import('./change-summary.svelte.js');
		void bumpChangeSummaryFromPuts(session, current);
	} catch {
		/* ignore */
	}

	return dirHash;
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {AbortSignal} [signal]
 */
export async function getPath(session, logicalPath, signal) {
	const { bytes } = await getPathWithKey(session, logicalPath, signal);
	return bytes;
}

/**
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ bytes: Uint8Array, fileKeyHex: string }>}
 */
export async function getPathWithKey(session, logicalPath, signal) {
	const dir = await loadRootDir(session, signal);
	return getPathFromDir(session, dir, logicalPath, signal);
}

/**
 * Remove logical paths from the root dir tip (orphan ciphertext may remain).
 * @param {DriveSession} session
 * @param {string | string[]} logicalPaths
 */
export async function deletePaths(session, logicalPaths) {
	const list = (Array.isArray(logicalPaths) ? logicalPaths : [logicalPaths])
		.map((p) => normalizePath(p))
		.filter(Boolean);
	if (!list.length) return;

	const root = parseRootKey(session.rootKey);
	const dir = await loadRootDir(session);
	dir.schema = 'alpha.dir/1';
	dir.children = dir.children ?? {};
	let removed = 0;
	for (const name of list) {
		if (dir.children[name]) {
			delete dir.children[name];
			removed += 1;
		}
	}
	if (!removed) return;

	const dirBytes = new TextEncoder().encode(JSON.stringify(dir));
	const dirCt = await encryptWithRoot(root, '', dirBytes);
	const dirHash = await sha256Hex(dirCt);
	await putBlock(session, dirHash, dirCt);
	await putTip(session, dirHash);
	rememberRootDir(dir, dirHash, session);
	try {
		const { markTipApplied } = await import('./tip-gate.js');
		markTipApplied(session, dirHash);
	} catch {
		/* ignore */
	}
}

/**
 * Encrypt under a caller-supplied file key (media manifest shares key with chunks).
 * @param {DriveSession} session
 * @param {string} logicalPath
 * @param {string} kind
 * @param {Uint8Array | string} plaintext
 * @param {Uint8Array} fileKey 32 bytes
 */
export async function putPathWithKey(session, logicalPath, kind, plaintext, fileKey) {
	const root = parseRootKey(session.rootKey);
	const bytes =
		typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
	const ciphertext = await encryptWithKey(fileKey, bytes);
	const hash = await sha256Hex(ciphertext);
	await putBlock(session, hash, ciphertext);

	const dir = await loadRootDir(session);
	const name = normalizePath(logicalPath);
	if (!name) throw new Error('empty path');
	dir.schema = 'alpha.dir/1';
	dir.children = dir.children ?? {};
	dir.children[name] = {
		hash,
		kind,
		wrapped_key: bytesToHex(fileKey)
	};

	const dirBytes = new TextEncoder().encode(JSON.stringify(dir));
	const dirCt = await encryptWithRoot(root, '', dirBytes);
	const dirHash = await sha256Hex(dirCt);
	await putBlock(session, dirHash, dirCt);
	await putTip(session, dirHash);
	rememberRootDir(dir, dirHash, session);
	try {
		const { markTipApplied } = await import('./tip-gate.js');
		markTipApplied(session, dirHash);
	} catch {
		/* ignore */
	}
	return hash;
}

/**
 * @param {DriveSession} session
 */
export async function health(session) {
	const res = await fetch(`${session.url.replace(/\/$/, '')}/health`);
	if (!res.ok) throw new Error(`health: ${res.status}`);
	return (await res.text()).trim();
}
