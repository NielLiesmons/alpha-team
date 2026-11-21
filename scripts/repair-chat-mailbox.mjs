#!/usr/bin/env node
/**
 * One-shot: append Space chat/messages leaves missing from the chat mailbox.
 * Does not rewrite tip history — only appends missing ids (newest tip stays valid).
 *
 * Usage:
 *   ALPHA_DRIVE_URL=https://drive.bley.farm \
 *   ALPHA_DRIVE_TOKEN=… \
 *   ALPHA_DRIVE_ROOT_KEY=… \
 *   node scripts/repair-chat-mailbox.mjs
 */
import { webcrypto } from 'node:crypto';

const crypto = webcrypto;

function hexToBytes(hex) {
	const clean = hex.trim();
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}
function bytesToHex(bytes) {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(data) {
	return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}
async function derivePathKey(root, path) {
	const enc = new TextEncoder();
	const prefix = enc.encode('alpha-drive/v0/');
	const pathBytes = enc.encode(path);
	const joined = new Uint8Array(prefix.length + root.length + pathBytes.length);
	joined.set(prefix, 0);
	joined.set(root, prefix.length);
	joined.set(pathBytes, prefix.length + root.length);
	return new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
}
async function importAesKey(keyBytes) {
	return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function decrypt(root, path, ciphertext) {
	const keyBytes = await derivePathKey(root, path);
	const nonce = ciphertext.slice(0, 12);
	const ct = ciphertext.slice(12);
	const key = await importAesKey(keyBytes);
	return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
}
async function encryptWithRoot(root, path, plaintext) {
	const keyBytes = await derivePathKey(root, path);
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const key = await importAesKey(keyBytes);
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));
	const out = new Uint8Array(12 + ct.length);
	out.set(nonce, 0);
	out.set(ct, 12);
	return out;
}

const url = (process.env.ALPHA_DRIVE_URL || '').replace(/\/$/, '');
const token = process.env.ALPHA_DRIVE_TOKEN || '';
const rootKeyHex = process.env.ALPHA_DRIVE_ROOT_KEY || '';
if (!url || !token || !rootKeyHex) {
	console.error('Need ALPHA_DRIVE_URL, ALPHA_DRIVE_TOKEN, ALPHA_DRIVE_ROOT_KEY');
	process.exit(1);
}
const root = hexToBytes(rootKeyHex);
const headers = { Authorization: `Bearer ${token}` };
const CHAT_MAIL_AAD = 'chat/mail';

async function api(method, path, body, contentType) {
	const res = await fetch(`${url}${path}`, {
		method,
		headers: {
			...headers,
			...(contentType ? { 'Content-Type': contentType } : {}),
			...(body instanceof Uint8Array ? { 'Content-Type': 'application/octet-stream' } : {})
		},
		body: body instanceof Uint8Array ? body : body
	});
	return res;
}

async function getTip() {
	const res = await api('GET', '/v1/tip');
	if (!res.ok) throw new Error(`tip ${res.status}`);
	const j = await res.json();
	return String(j.root_hash || '');
}

async function getNamedTip(name) {
	const res = await api('GET', `/v1/tips/${encodeURIComponent(name)}`);
	if (res.status === 404) return '';
	if (!res.ok) throw new Error(`named tip ${res.status}`);
	const j = await res.json();
	return String(j.root_hash || '');
}

async function getBlock(hash) {
	const res = await api('GET', `/v1/blocks/${hash}`);
	if (!res.ok) throw new Error(`block ${hash.slice(0, 12)} ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

async function loadRootDir() {
	const tip = await getTip();
	const ct = await getBlock(tip);
	const pt = await decrypt(root, '', ct);
	return JSON.parse(new TextDecoder().decode(pt));
}

async function getPath(dir, logicalPath) {
	const child = dir.children?.[logicalPath];
	if (!child?.hash || !child?.wrapped_key) throw new Error(`missing ${logicalPath}`);
	const ct = await getBlock(child.hash);
	const pt = await decryptWithFileKey(hexToBytes(child.wrapped_key), ct);
	return pt;
}

async function decryptWithFileKey(fileKey, ciphertext) {
	const nonce = ciphertext.slice(0, 12);
	const ct = ciphertext.slice(12);
	const key = await importAesKey(fileKey);
	return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
}

async function walkMailbox(tip, limit = 5000) {
	/** @type {any[]} */
	const messages = [];
	/** @type {Set<string>} */
	const have = new Set();
	let hash = tip;
	let envelopes = 0;
	while (hash && messages.length < limit) {
		const ct = await getBlock(hash);
		const pt = await decrypt(root, CHAT_MAIL_AAD, ct);
		const doc = JSON.parse(new TextDecoder().decode(pt));
		envelopes += 1;
		const entry = doc?.entry;
		if (entry?.kind === 'message' && entry.message?.id) {
			const id = String(entry.message.id);
			if (!have.has(id)) {
				have.add(id);
				messages.push(entry.message);
			}
		}
		hash = doc?.prev ? String(doc.prev) : '';
	}
	return { messages, have, envelopes };
}

async function appendMessage(message, prevTip) {
	const envelope = {
		schema: 'alpha.chat_mail/1',
		prev: prevTip || null,
		at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
		entry: { kind: 'message', message }
	};
	const pt = new TextEncoder().encode(JSON.stringify(envelope));
	const ct = await encryptWithRoot(root, CHAT_MAIL_AAD, pt);
	const hash = await sha256Hex(ct);
	for (let attempt = 0; attempt < 6; attempt++) {
		const prev = attempt === 0 ? prevTip : await getNamedTip('chat');
		const env2 =
			attempt === 0
				? envelope
				: {
						...envelope,
						prev: prev || null
					};
		const pt2 =
			attempt === 0 ? pt : new TextEncoder().encode(JSON.stringify(env2));
		const ct2 = attempt === 0 ? ct : await encryptWithRoot(root, CHAT_MAIL_AAD, pt2);
		const hash2 = attempt === 0 ? hash : await sha256Hex(ct2);
		const res = await fetch(`${url}/v1/mailboxes/chat/append`, {
			method: 'PUT',
			headers: {
				...headers,
				'Content-Type': 'application/octet-stream',
				'x-alpha-hash': hash2,
				'x-alpha-prev': prev || ''
			},
			body: ct2
		});
		if (res.status === 204 || res.ok) return hash2;
		if (res.status === 409) continue;
		throw new Error(`append ${res.status} ${await res.text()}`);
	}
	throw new Error('append CAS exhausted');
}

function sortOldest(list) {
	return [...list].sort((a, b) => {
		const c = String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
		if (c) return c;
		return String(a?.id || '').localeCompare(String(b?.id || ''));
	});
}

const dir = await loadRootDir();
const feedBytes = await getPath(dir, 'chat/feed.json');
const feedDoc = JSON.parse(new TextDecoder().decode(feedBytes));
let ids = Array.isArray(feedDoc) ? feedDoc.map(String) : Array.isArray(feedDoc?.ids) ? feedDoc.ids.map(String) : [];
if (!ids.length) {
	ids = Object.keys(dir.children || {})
		.filter((p) => /^chat\/messages\/[^/]+\.json$/.test(p))
		.map((p) => p.replace(/^chat\/messages\//, '').replace(/\.json$/, ''));
}
ids = [...new Set(ids.filter(Boolean))];
console.log(`Space feed ids: ${ids.length}`);

const tip = await getNamedTip('chat');
console.log(`Mailbox tip: ${tip.slice(0, 16) || '(empty)'}…`);
const { messages, have, envelopes } = tip
	? await walkMailbox(tip)
	: { messages: [], have: new Set(), envelopes: 0 };
console.log(`Mailbox envelopes=${envelopes} messages=${messages.length}`);

const missing = ids.filter((id) => !have.has(id));
console.log(`Missing from mailbox: ${missing.length}`);
if (!missing.length) {
	console.log('Nothing to repair.');
	process.exit(0);
}

/** @type {any[]} */
const msgs = [];
for (const id of missing) {
	try {
		const bytes = await getPath(dir, `chat/messages/${id}.json`);
		const doc = JSON.parse(new TextDecoder().decode(bytes));
		if (doc?.id) msgs.push(doc);
	} catch (e) {
		console.warn(`skip ${id}: ${e.message || e}`);
	}
}
const ordered = sortOldest(msgs);
console.log(`Appending ${ordered.length} messages (oldest→newest)…`);

let prev = tip;
let n = 0;
for (const message of ordered) {
	prev = await appendMessage(message, prev);
	n += 1;
	if (n % 25 === 0 || n === ordered.length) {
		console.log(`  appended ${n}/${ordered.length}`);
	}
}

const tipAfter = await getNamedTip('chat');
const after = await walkMailbox(tipAfter);
console.log(
	`Done. Appended ${n}. Mailbox now messages=${after.messages.length} envelopes=${after.envelopes} tip=${tipAfter.slice(0, 16)}…`
);
const byKind = {};
for (const m of after.messages) byKind[m.kind] = (byKind[m.kind] || 0) + 1;
console.log('byKind', byKind);
