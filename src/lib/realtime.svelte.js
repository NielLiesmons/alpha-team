/**
 * Alpha realtime bus client (WebSocket now; same envelopes for QUIC/Iroh later).
 * @see alpha-docs/ADR-iroh-realtime.md
 */

import { actor } from './actor.svelte.js';
import { chatEphemeral } from './chat.svelte.js';
import { wakeChatFromTip } from './chat-sync.svelte.js';
import { apiBase } from './mail-api.js';

import { projectSlug } from './space-host.js';

const PING_MS = 25_000;
const RECONNECT_MIN_MS = 800;
const RECONNECT_MAX_MS = 20_000;
const CONNECT_TIMEOUT_MS = 8_000;

function realtimeToken() {
	if (typeof localStorage === 'undefined') return '';
	return (
		localStorage.getItem('alpha-realtime-token') ||
		(typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_ALPHA_REALTIME_TOKEN
			? String(import.meta.env.PUBLIC_ALPHA_REALTIME_TOKEN)
			: '') ||
		''
	);
}

/** @type {WebSocket | null} */
let sock = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pingTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let reconnectTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let connectTimer = null;
let wantOpen = false;
let backoff = RECONNECT_MIN_MS;
/** @type {ReturnType<typeof setTimeout> | null} */
let typingIdleTimer = null;
/** Tip wake that failed while WS was down — flush on open. */
let pendingTipWake = /** @type {string | null} */ (null);
let listenersBound = false;

export const realtimeUi = $state({
	connected: false,
	lastError: /** @type {string | null} */ (null),
	lastPublishedTip: /** @type {string | null} */ (null),
	lastReceivedTip: /** @type {string | null} */ (null),
	lastReceivedAt: 0
});

function spaceId() {
	return projectSlug();
}

function wsUrl() {
	const httpBase = apiBase();
	if (!httpBase) return '';
	const base = httpBase.replace(/^http/, 'ws');
	const params = new URLSearchParams({ space: spaceId() });
	const token = realtimeToken();
	if (token) params.set('token', token);
	const email = actor.email;
	if (email) params.set('actor', email);
	return `${base}/v1/realtime?${params}`;
}

function clearTimers() {
	if (pingTimer != null) {
		clearInterval(pingTimer);
		pingTimer = null;
	}
	if (reconnectTimer != null) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	if (connectTimer != null) {
		clearTimeout(connectTimer);
		connectTimer = null;
	}
}

/**
 * @param {Record<string, unknown>} envelope
 */
export function publishRealtime(envelope) {
	if (!sock || sock.readyState !== WebSocket.OPEN) return false;
	try {
		sock.send(JSON.stringify({ v: 1, space: spaceId(), ...envelope }));
		return true;
	} catch {
		return false;
	}
}

function flushPendingTipWake() {
	const t = pendingTipWake;
	if (!t) return;
	if (publishRealtime({ type: 'tip', tip: t })) {
		pendingTipWake = null;
		realtimeUi.lastPublishedTip = t;
	}
}

/** Tip-wake after a chat tip write. Queues if the socket is mid-reconnect. */
export function publishTipWake(tip) {
	const t = String(tip || '').trim();
	if (!t) return false;
	ensureRealtime();
	if (publishRealtime({ type: 'tip', tip: t })) {
		pendingTipWake = null;
		realtimeUi.lastPublishedTip = t;
		return true;
	}
	pendingTipWake = t;
	return false;
}

/**
 * Instant reaction fan-out (paint before mailbox pull). Tip wake still heals.
 * @param {{
 *   op: 'add' | 'remove',
 *   message_id: string,
 *   emoji: string,
 *   author: string,
 *   id?: string,
 *   tip?: string
 * }} payload
 */
export function publishReactionHint(payload) {
	if (!payload?.message_id || !payload?.emoji || !payload?.author) return false;
	ensureRealtime();
	return publishRealtime({
		type: 'reaction',
		...(payload.tip ? { tip: String(payload.tip) } : {}),
		reaction: {
			op: payload.op === 'remove' ? 'remove' : 'add',
			message_id: String(payload.message_id),
			emoji: String(payload.emoji),
			author: String(payload.author),
			...(payload.id ? { id: String(payload.id) } : {})
		}
	});
}

/**
 * @param {{ channel_id: string, state: string, label?: string, expires_at?: string }} input
 */
export function publishEphemeral(input) {
	const email = actor.email;
	if (!email) return false;
	const now = new Date();
	const expires = input.expires_at
		? input.expires_at
		: new Date(now.getTime() + 8_000).toISOString();
	return publishRealtime({
		type: 'ephemeral',
		ephemeral: {
			schema: 'alpha.chat_ephemeral/1',
			channel_id: String(input.channel_id || 'general'),
			actor: email,
			state: input.state,
			...(input.label ? { label: input.label } : {}),
			updated_at: now.toISOString(),
			expires_at: expires
		}
	});
}

/** @type {number} */
let lastTypingSent = 0;

/** Debounced typing for the open composer (throttle WS spam, refresh expiry). */
export function signalTyping(channelId) {
	const now = Date.now();
	/* Re-publish at most ~1.2s so peers refresh expires_at without flooding. */
	if (now - lastTypingSent > 1_200) {
		lastTypingSent = now;
		publishEphemeral({ channel_id: channelId, state: 'typing' });
	}
	if (typingIdleTimer != null) clearTimeout(typingIdleTimer);
	typingIdleTimer = setTimeout(() => {
		lastTypingSent = 0;
		publishEphemeral({ channel_id: channelId, state: 'idle' });
	}, 4_000);
}

export function signalRecording(channelId, on) {
	publishEphemeral({
		channel_id: channelId,
		state: on ? 'recording' : 'idle'
	});
}

/**
 * @param {any} ephemeral
 */
function applyEphemeral(ephemeral) {
	if (!ephemeral || typeof ephemeral !== 'object') return;
	const channelId = String(ephemeral.channel_id || '');
	const who = String(ephemeral.actor || '');
	if (!channelId || !who) return;
	/* Never paint our own row. */
	if (actor.email && who.toLowerCase() === String(actor.email).toLowerCase()) return;

	const state = String(ephemeral.state || 'idle');
	const idx = chatEphemeral.findIndex(
		(e) => e.channel_id === channelId && String(e.actor).toLowerCase() === who.toLowerCase()
	);
	if (state === 'idle') {
		if (idx >= 0) chatEphemeral.splice(idx, 1);
		return;
	}
	const row = {
		schema: 'alpha.chat_ephemeral/1',
		channel_id: channelId,
		actor: who,
		state,
		...(ephemeral.label ? { label: ephemeral.label } : {}),
		updated_at: ephemeral.updated_at || new Date().toISOString(),
		expires_at: ephemeral.expires_at || new Date(Date.now() + 6_000).toISOString()
	};
	if (idx >= 0) chatEphemeral[idx] = row;
	else chatEphemeral.push(row);
}

function pruneEphemeral() {
	const now = Date.now();
	for (let i = chatEphemeral.length - 1; i >= 0; i--) {
		const exp = Date.parse(String(chatEphemeral[i]?.expires_at || ''));
		if (Number.isFinite(exp) && exp < now) chatEphemeral.splice(i, 1);
	}
}

/**
 * @param {MessageEvent} ev
 */
function onMessage(ev) {
	let data;
	try {
		data = JSON.parse(String(ev.data || ''));
	} catch {
		return;
	}
	if (!data || typeof data !== 'object') return;
	const type = String(data.type || '');
	if (type === 'tip' && data.tip) {
		const tip = String(data.tip);
		realtimeUi.lastReceivedTip = tip;
		realtimeUi.lastReceivedAt = Date.now();
		try {
			void wakeChatFromTip(tip);
		} catch (e) {
			console.warn('tip-wake handler', e);
		}
		return;
	}
	if (type === 'reaction' && data.reaction) {
		try {
			void import('./chat.svelte.js').then(({ applyReactionHint }) => {
				applyReactionHint(data.reaction);
			});
		} catch (e) {
			console.warn('reaction hint', e);
		}
		/* Durable heal via tip when present; otherwise tip-poll catches up. */
		if (data.tip) {
			try {
				void wakeChatFromTip(String(data.tip));
			} catch {
				/* ignore */
			}
		}
		return;
	}
	if (type === 'ephemeral' && data.ephemeral) {
		applyEphemeral(data.ephemeral);
		return;
	}
	/* call signaling — UI later */
}

function scheduleReconnect() {
	if (!wantOpen || reconnectTimer != null) return;
	const wait = backoff;
	backoff = Math.min(RECONNECT_MAX_MS, Math.round(backoff * 1.6));
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		openSocket();
	}, wait);
}

function openSocket() {
	if (typeof WebSocket === 'undefined') return;
	if (!wantOpen) return;
	if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
		return;
	}
	const url = wsUrl();
	if (!url) {
		realtimeUi.lastError = 'no api base';
		scheduleReconnect();
		return;
	}
	clearTimers();
	try {
		sock = new WebSocket(url);
	} catch (e) {
		realtimeUi.lastError = e instanceof Error ? e.message : String(e);
		scheduleReconnect();
		return;
	}
	connectTimer = setTimeout(() => {
		connectTimer = null;
		if (sock && sock.readyState === WebSocket.CONNECTING) {
			realtimeUi.lastError = 'connect timeout';
			try {
				sock.close();
			} catch {
				/* close handler reconnects */
			}
		}
	}, CONNECT_TIMEOUT_MS);
	sock.addEventListener('open', () => {
		if (connectTimer != null) {
			clearTimeout(connectTimer);
			connectTimer = null;
		}
		realtimeUi.connected = true;
		realtimeUi.lastError = null;
		backoff = RECONNECT_MIN_MS;
		flushPendingTipWake();
		pingTimer = setInterval(() => {
			publishRealtime({ type: 'ping' });
			pruneEphemeral();
		}, PING_MS);
	});
	sock.addEventListener('message', onMessage);
	sock.addEventListener('close', () => {
		realtimeUi.connected = false;
		sock = null;
		clearTimers();
		if (wantOpen) scheduleReconnect();
	});
	sock.addEventListener('error', () => {
		realtimeUi.lastError = 'socket error';
	});
}

function onVisibility() {
	if (typeof document === 'undefined') return;
	if (document.visibilityState !== 'visible') return;
	/* iOS often kills WS in background — reconnect as soon as we're foreground again. */
	backoff = RECONNECT_MIN_MS;
	if (!sock || sock.readyState === WebSocket.CLOSED || sock.readyState === WebSocket.CLOSING) {
		openSocket();
	} else if (sock.readyState === WebSocket.CONNECTING) {
		/* hung connect — kick it */
		try {
			sock.close();
		} catch {
			/* ignore */
		}
	}
}

function onOnline() {
	if (!wantOpen) return;
	backoff = RECONNECT_MIN_MS;
	if (sock && sock.readyState === WebSocket.OPEN) {
		flushPendingTipWake();
		return;
	}
	try {
		sock?.close();
	} catch {
		/* ignore */
	}
	sock = null;
	openSocket();
}

function bindWindowListeners() {
	if (listenersBound || typeof window === 'undefined') return;
	listenersBound = true;
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('online', onOnline);
}

function unbindWindowListeners() {
	if (!listenersBound || typeof window === 'undefined') return;
	listenersBound = false;
	document.removeEventListener('visibilitychange', onVisibility);
	window.removeEventListener('online', onOnline);
}

/** Keep / reopen the bus when a Drive session exists (idempotent). */
export function ensureRealtime() {
	wantOpen = true;
	bindWindowListeners();
	openSocket();
}

/** Start from root layout once Drive is connected. */
export function startRealtime() {
	ensureRealtime();
	return () => stopRealtime();
}

export function stopRealtime() {
	wantOpen = false;
	unbindWindowListeners();
	clearTimers();
	if (typingIdleTimer != null) {
		clearTimeout(typingIdleTimer);
		typingIdleTimer = null;
	}
	/* Keep pendingTipWake across actor-driven reconnects; flush on next open. */
	try {
		sock?.close();
	} catch {
		/* ignore */
	}
	sock = null;
	realtimeUi.connected = false;
}
