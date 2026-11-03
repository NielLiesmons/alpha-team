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
let wantOpen = false;
let backoff = RECONNECT_MIN_MS;
/** @type {ReturnType<typeof setTimeout> | null} */
let typingIdleTimer = null;

export const realtimeUi = $state({
	connected: false,
	lastError: /** @type {string | null} */ (null)
});

function spaceId() {
	return projectSlug();
}

function wsUrl() {
	const base = apiBase().replace(/^http/, 'ws');
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

/** Tip-wake after a chat tip write. */
export function publishTipWake(tip) {
	const t = String(tip || '').trim();
	if (!t) return false;
	return publishRealtime({ type: 'tip', tip: t });
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
		: new Date(now.getTime() + 6_000).toISOString();
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

/** Debounced typing for the open composer. */
export function signalTyping(channelId) {
	publishEphemeral({ channel_id: channelId, state: 'typing' });
	if (typingIdleTimer != null) clearTimeout(typingIdleTimer);
	typingIdleTimer = setTimeout(() => {
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
		void wakeChatFromTip(String(data.tip));
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
	if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
		return;
	}
	clearTimers();
	try {
		sock = new WebSocket(wsUrl());
	} catch (e) {
		realtimeUi.lastError = e instanceof Error ? e.message : String(e);
		scheduleReconnect();
		return;
	}
	sock.addEventListener('open', () => {
		realtimeUi.connected = true;
		realtimeUi.lastError = null;
		backoff = RECONNECT_MIN_MS;
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
	if (!sock || sock.readyState === WebSocket.CLOSED || sock.readyState === WebSocket.CLOSING) {
		backoff = RECONNECT_MIN_MS;
		openSocket();
	}
}

/** Start from root layout once signed in. */
export function startRealtime() {
	wantOpen = true;
	openSocket();
	if (typeof document !== 'undefined') {
		document.addEventListener('visibilitychange', onVisibility);
	}
	return () => stopRealtime();
}

export function stopRealtime() {
	wantOpen = false;
	if (typeof document !== 'undefined') {
		document.removeEventListener('visibilitychange', onVisibility);
	}
	clearTimers();
	if (typingIdleTimer != null) {
		clearTimeout(typingIdleTimer);
		typingIdleTimer = null;
	}
	try {
		sock?.close();
	} catch {
		/* ignore */
	}
	sock = null;
	realtimeUi.connected = false;
}
