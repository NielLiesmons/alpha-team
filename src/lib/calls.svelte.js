/**
 * Chat A/V calls — LiveKit media + realtime bus signaling (ADR-chat-calls).
 */

import { Room, RoomEvent, Track } from 'livekit-client';
import { actor, displayNameFromEmail } from './actor.svelte.js';
import { chatUi } from './chat.svelte.js';
import { apiBase, getAdminToken } from './mail-api.js';
import { publishRealtime } from './realtime.svelte.js';
import { projectSlug } from './space-host.js';

/** @typedef {'idle' | 'setup' | 'connecting' | 'in_call'} CallPhase */
/** @typedef {'audio' | 'video'} CallKind */

/**
 * @typedef {{
 *   identity: string,
 *   name: string,
 *   audioEnabled: boolean,
 *   videoEnabled: boolean,
 *   isLocal: boolean
 * }} CallPeer
 */

export const callUi = $state({
	/** @type {CallPhase} */
	phase: 'idle',
	/** @type {CallKind} */
	kind: 'audio',
	channelId: 'general',
	callId: /** @type {string | null} */ (null),
	roomName: /** @type {string | null} */ (null),
	micOn: true,
	camOn: false,
	error: /** @type {string | null} */ (null),
	/** Incoming invite from bus (another member started a call). */
	incoming: /** @type {null | { callId: string, channelId: string, kind: CallKind, from: string, room?: string }} */ (
		null
	),
	/** @type {CallPeer[]} */
	peers: [],
	connecting: false
});

/** @type {Room | null} */
let room = null;
/** @type {MediaStream | null} */
let previewStream = null;

function spaceId() {
	return projectSlug();
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function callsApi(path, init = {}) {
	const headers = new Headers(init.headers || {});
	if (!headers.has('content-type') && init.body) {
		headers.set('content-type', 'application/json');
	}
	const token = getAdminToken();
	if (token) headers.set('authorization', `Bearer ${token}`);
	const base = apiBase();
	if (!base) throw new Error('API base URL is not configured');
	const res = await fetch(`${base}${path}`, { ...init, headers });
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = { error: text || res.statusText };
	}
	if (!res.ok) {
		const msg = data?.message || data?.error || res.statusText || `HTTP ${res.status}`;
		throw new Error(msg);
	}
	return data;
}

export function openCallSetup(/** @type {CallKind} */ kind = 'audio') {
	const channelId = chatUi.activeChannelId || 'general';
	if (callUi.phase === 'in_call' || callUi.phase === 'connecting') return;
	callUi.phase = 'setup';
	callUi.kind = kind;
	callUi.channelId = channelId;
	callUi.micOn = true;
	callUi.camOn = kind === 'video';
	callUi.error = null;
	callUi.callId = null;
	callUi.roomName = null;
	void refreshPreview();
}

export function closeCallSetup() {
	if (callUi.phase === 'in_call' || callUi.phase === 'connecting') return;
	stopPreview();
	callUi.phase = 'idle';
	callUi.error = null;
}

/** @param {HTMLVideoElement | null} el */
export function bindLocalPreview(el) {
	if (!el) return;
	if (previewStream) {
		el.srcObject = previewStream;
		void el.play().catch(() => {});
	}
}

async function refreshPreview() {
	stopPreview();
	if (callUi.phase !== 'setup' || !callUi.camOn) return;
	try {
		previewStream = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: { facingMode: 'user' }
		});
	} catch (e) {
		callUi.error = e instanceof Error ? e.message : String(e);
		callUi.camOn = false;
	}
}

function stopPreview() {
	if (previewStream) {
		for (const t of previewStream.getTracks()) t.stop();
		previewStream = null;
	}
}

export async function setMicOn(on) {
	callUi.micOn = Boolean(on);
	if (room) {
		try {
			await room.localParticipant.setMicrophoneEnabled(callUi.micOn);
		} catch (e) {
			callUi.error = e instanceof Error ? e.message : String(e);
		}
	}
	syncLocalPeerFlags();
}

export async function setCamOn(on) {
	callUi.camOn = Boolean(on);
	if (callUi.phase === 'setup') {
		if (callUi.camOn) {
			callUi.kind = 'video';
			await refreshPreview();
		} else {
			stopPreview();
		}
		return;
	}
	if (room) {
		try {
			await room.localParticipant.setCameraEnabled(callUi.camOn);
		} catch (e) {
			callUi.error = e instanceof Error ? e.message : String(e);
			callUi.camOn = false;
		}
	}
	syncLocalPeerFlags();
}

function syncLocalPeerFlags() {
	const me = actor.email || 'local';
	const idx = callUi.peers.findIndex((p) => p.isLocal);
	if (idx >= 0) {
		callUi.peers[idx] = {
			...callUi.peers[idx],
			audioEnabled: callUi.micOn,
			videoEnabled: callUi.camOn,
			identity: me,
			name: displayNameFromEmail(me)
		};
	}
}

/**
 * @param {any} call
 */
export function onCallBusMessage(call) {
	if (!call || typeof call !== 'object') return;
	const action = String(call.action || '');
	const from = String(call.from || '');
	const me = (actor.email || '').toLowerCase();
	if (from && me && from.toLowerCase() === me) return;

	const channelId = String(call.channel_id || 'general');
	const callId = String(call.call_id || '');
	const kind = call.kind === 'video' ? 'video' : 'audio';

	if (action === 'invite' && callId) {
		callUi.incoming = {
			callId,
			channelId,
			kind,
			from,
			room: call.room ? String(call.room) : undefined
		};
		return;
	}
	if (action === 'hangup') {
		if (callUi.incoming?.callId && callId && callUi.incoming.callId === callId) {
			callUi.incoming = null;
		}
		if (callUi.callId && callId && callUi.callId === callId && callUi.phase !== 'idle') {
			void leaveCall({ notify: false });
		}
	}
}

export async function acceptIncoming() {
	const inv = callUi.incoming;
	if (!inv) return;
	callUi.incoming = null;
	callUi.channelId = inv.channelId;
	callUi.kind = inv.kind;
	callUi.micOn = true;
	callUi.camOn = inv.kind === 'video';
	callUi.callId = inv.callId;
	await launchCall({ joinCallId: inv.callId });
}

export function dismissIncoming() {
	const inv = callUi.incoming;
	if (inv) {
		publishRealtime({
			type: 'call',
			call: {
				schema: 'alpha.chat_call/1',
				channel_id: inv.channelId,
				action: 'reject',
				from: actor.email || 'local',
				call_id: inv.callId,
				kind: inv.kind
			}
		});
	}
	callUi.incoming = null;
}

/**
 * @param {{ joinCallId?: string | null }} [opts]
 */
export async function launchCall(opts = {}) {
	const identity = (actor.email || '').trim() || 'local';
	const name = displayNameFromEmail(identity);
	const channelId = callUi.channelId || chatUi.activeChannelId || 'general';
	callUi.connecting = true;
	callUi.phase = 'connecting';
	callUi.error = null;
	stopPreview();

	try {
		const body = {
			space: spaceId(),
			channel_id: channelId,
			kind: callUi.camOn ? 'video' : callUi.kind || 'audio',
			identity,
			name,
			...(opts.joinCallId || callUi.callId
				? { call_id: opts.joinCallId || callUi.callId }
				: {})
		};
		const res = await callsApi('/v1/calls', {
			method: 'POST',
			body: JSON.stringify(body)
		});
		callUi.callId = String(res.call_id);
		callUi.roomName = String(res.room);
		callUi.channelId = String(res.channel_id || channelId);
		callUi.kind = res.kind === 'video' ? 'video' : 'audio';

		if (!res.created && opts.joinCallId) {
			publishRealtime({
				type: 'call',
				call: {
					schema: 'alpha.chat_call/1',
					channel_id: callUi.channelId,
					action: 'accept',
					from: identity,
					call_id: callUi.callId,
					kind: callUi.kind,
					room: callUi.roomName
				}
			});
		}

		await connectLiveKit(String(res.livekit_url), String(res.token));
		callUi.phase = 'in_call';
	} catch (e) {
		callUi.error = e instanceof Error ? e.message : String(e);
		callUi.phase = 'setup';
		await refreshPreview();
	} finally {
		callUi.connecting = false;
	}
}

/**
 * @param {string} url
 * @param {string} token
 */
async function connectLiveKit(url, token) {
	await disconnectRoom();
	const r = new Room({
		adaptiveStream: true,
		dynacast: true
	});
	room = r;

	r.on(RoomEvent.ParticipantConnected, () => rebuildPeers());
	r.on(RoomEvent.ParticipantDisconnected, () => rebuildPeers());
	r.on(RoomEvent.TrackSubscribed, () => rebuildPeers());
	r.on(RoomEvent.TrackUnsubscribed, () => rebuildPeers());
	r.on(RoomEvent.LocalTrackPublished, () => rebuildPeers());
	r.on(RoomEvent.LocalTrackUnpublished, () => rebuildPeers());
	r.on(RoomEvent.TrackMuted, () => rebuildPeers());
	r.on(RoomEvent.TrackUnmuted, () => rebuildPeers());
	r.on(RoomEvent.Disconnected, () => {
		if (callUi.phase === 'in_call' || callUi.phase === 'connecting') {
			callUi.phase = 'idle';
			callUi.peers = [];
		}
	});

	await r.connect(url, token);
	await r.localParticipant.setMicrophoneEnabled(callUi.micOn);
	await r.localParticipant.setCameraEnabled(callUi.camOn);
	rebuildPeers();
}

function rebuildPeers() {
	if (!room) {
		callUi.peers = [];
		return;
	}
	/** @type {CallPeer[]} */
	const next = [];
	const local = room.localParticipant;
	callUi.micOn = local.isMicrophoneEnabled;
	callUi.camOn = local.isCameraEnabled;
	next.push({
		identity: local.identity,
		name: local.name || displayNameFromEmail(local.identity),
		audioEnabled: local.isMicrophoneEnabled,
		videoEnabled: local.isCameraEnabled,
		isLocal: true
	});
	for (const p of room.remoteParticipants.values()) {
		next.push({
			identity: p.identity,
			name: p.name || displayNameFromEmail(p.identity),
			audioEnabled: p.isMicrophoneEnabled,
			videoEnabled: p.isCameraEnabled,
			isLocal: false
		});
	}
	callUi.peers = next;
}

/**
 * Attach LiveKit video/audio for a peer identity to DOM nodes.
 * @param {string} identity
 * @param {HTMLVideoElement | null} videoEl
 * @param {HTMLAudioElement | null} audioEl
 */
export function attachPeerMedia(identity, videoEl, audioEl) {
	if (!room) return;
	const isLocal = room.localParticipant.identity === identity;
	const participant = isLocal
		? room.localParticipant
		: room.remoteParticipants.get(identity);
	if (!participant) return;

	for (const pub of participant.trackPublications.values()) {
		if (!pub.track) continue;
		if (pub.kind === Track.Kind.Video && videoEl) {
			pub.track.attach(videoEl);
		}
		if (pub.kind === Track.Kind.Audio && audioEl && !isLocal) {
			pub.track.attach(audioEl);
		}
	}
}

/**
 * @param {{ notify?: boolean }} [opts]
 */
export async function leaveCall(opts = {}) {
	const notify = opts.notify !== false;
	const callId = callUi.callId;
	const channelId = callUi.channelId;
	const kind = callUi.kind;
	const from = actor.email || 'local';

	await disconnectRoom();
	stopPreview();
	callUi.phase = 'idle';
	callUi.peers = [];
	callUi.callId = null;
	callUi.roomName = null;
	callUi.error = null;
	callUi.connecting = false;

	if (notify && callId) {
		publishRealtime({
			type: 'call',
			call: {
				schema: 'alpha.chat_call/1',
				channel_id: channelId,
				action: 'hangup',
				from,
				call_id: callId,
				kind
			}
		});
		try {
			await callsApi(`/v1/calls/${encodeURIComponent(callId)}/hangup`, {
				method: 'POST',
				body: JSON.stringify({ from })
			});
		} catch {
			/* bus hangup is enough for peers */
		}
	}
}

async function disconnectRoom() {
	if (!room) return;
	const r = room;
	room = null;
	try {
		await r.disconnect(true);
	} catch {
		/* ignore */
	}
}

export function callViewOpenFor(channelId) {
	const cid = String(channelId || 'general');
	return (
		callUi.channelId === cid &&
		(callUi.phase === 'setup' || callUi.phase === 'connecting' || callUi.phase === 'in_call')
	);
}
