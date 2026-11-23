/**
 * Shared chat voice playback — one clip at a time for bubbles + chrome pill.
 */

import { formatAudioDurationMs, nextVoiceSpeed } from './voice-waveform.js';

/** @typedef {'idle' | 'playing' | 'paused'} VoicePlayStatus */

export const chatVoicePlayer = $state({
	/** @type {string | null} */
	msgId: null,
	/** @type {string | null} */
	url: null,
	/** @type {string} */
	title: '',
	/** @type {string} */
	author: '',
	/** @type {VoicePlayStatus} */
	status: /** @type {VoicePlayStatus} */ ('idle'),
	positionMs: 0,
	durationMs: 0,
	speed: 1
});

/** @type {HTMLAudioElement | null} */
let audio = null;
/** @type {number | null} */
let raf = null;

function ensureAudio() {
	if (typeof Audio === 'undefined') return null;
	if (!audio) {
		audio = new Audio();
		audio.preload = 'metadata';
		audio.addEventListener('timeupdate', syncFromAudio);
		audio.addEventListener('loadedmetadata', syncFromAudio);
		audio.addEventListener('ended', () => {
			chatVoicePlayer.status = 'idle';
			chatVoicePlayer.positionMs = 0;
			stopRaf();
		});
		audio.addEventListener('pause', () => {
			if (chatVoicePlayer.status === 'playing') chatVoicePlayer.status = 'paused';
			stopRaf();
		});
		audio.addEventListener('play', () => {
			chatVoicePlayer.status = 'playing';
			startRaf();
		});
	}
	return audio;
}

function syncFromAudio() {
	if (!audio) return;
	chatVoicePlayer.positionMs = Math.round((audio.currentTime || 0) * 1000);
	if (Number.isFinite(audio.duration) && audio.duration > 0) {
		chatVoicePlayer.durationMs = Math.round(audio.duration * 1000);
	}
}

function startRaf() {
	stopRaf();
	const tick = () => {
		syncFromAudio();
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);
}

function stopRaf() {
	if (raf != null) {
		cancelAnimationFrame(raf);
		raf = null;
	}
}

/**
 * @param {{
 *   msgId: string,
 *   url: string,
 *   title?: string,
 *   author?: string,
 *   durationMs?: number
 * }} opts
 */
export async function playVoiceClip(opts) {
	const el = ensureAudio();
	if (!el || !opts?.url || !opts?.msgId) return;

	const same = chatVoicePlayer.msgId === opts.msgId && chatVoicePlayer.url === opts.url;
	if (same && chatVoicePlayer.status === 'playing') {
		el.pause();
		chatVoicePlayer.status = 'paused';
		return;
	}
	if (same && chatVoicePlayer.status === 'paused') {
		el.playbackRate = chatVoicePlayer.speed;
		await el.play().catch(() => {});
		return;
	}

	chatVoicePlayer.msgId = opts.msgId;
	chatVoicePlayer.url = opts.url;
	chatVoicePlayer.title = opts.title || 'Voice message';
	chatVoicePlayer.author = opts.author || '';
	chatVoicePlayer.durationMs = opts.durationMs || 0;
	chatVoicePlayer.positionMs = 0;
	chatVoicePlayer.status = 'playing';

	el.src = opts.url;
	el.playbackRate = chatVoicePlayer.speed;
	el.currentTime = 0;
	await el.play().catch(() => {
		chatVoicePlayer.status = 'idle';
	});
}

export function pauseVoiceClip() {
	audio?.pause();
	chatVoicePlayer.status = 'paused';
	stopRaf();
}

export function resumeVoiceClip() {
	const el = ensureAudio();
	if (!el || !chatVoicePlayer.url) return;
	el.playbackRate = chatVoicePlayer.speed;
	void el.play().catch(() => {});
}

export function stopVoiceClip() {
	if (audio) {
		audio.pause();
		audio.removeAttribute('src');
		audio.load();
	}
	stopRaf();
	chatVoicePlayer.msgId = null;
	chatVoicePlayer.url = null;
	chatVoicePlayer.title = '';
	chatVoicePlayer.author = '';
	chatVoicePlayer.status = 'idle';
	chatVoicePlayer.positionMs = 0;
	chatVoicePlayer.durationMs = 0;
}

/** @param {number} ms */
export function seekVoiceClip(ms) {
	const el = ensureAudio();
	if (!el || !chatVoicePlayer.url) return;
	const dur = chatVoicePlayer.durationMs || Math.round((el.duration || 0) * 1000);
	const t = Math.max(0, Math.min(dur, ms)) / 1000;
	el.currentTime = t;
	chatVoicePlayer.positionMs = Math.round(t * 1000);
}

export function cycleVoiceSpeed() {
	chatVoicePlayer.speed = nextVoiceSpeed(chatVoicePlayer.speed);
	if (audio) audio.playbackRate = chatVoicePlayer.speed;
}

/** @param {string} msgId */
export function isVoiceClipActive(msgId) {
	return Boolean(msgId) && chatVoicePlayer.msgId === msgId;
}

export function voicePlayerTimeLabel() {
	const { status, positionMs, durationMs } = chatVoicePlayer;
	if (status === 'playing' && durationMs > 0) {
		return formatAudioDurationMs(Math.max(0, durationMs - positionMs));
	}
	if (durationMs > 0) return formatAudioDurationMs(durationMs);
	return '0:00';
}
