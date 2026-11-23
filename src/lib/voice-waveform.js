/**
 * Deterministic fake waveform bars (ported from alpha-chat WaveformBars.kt).
 * @param {string | number} seed
 * @param {number} [barCount]
 * @returns {number[]}
 */
export function generateWaveformBars(seed, barCount = 64) {
	let state = (typeof seed === 'number' ? seed : hashString(String(seed))) ^ 0x5deece66d;
	/** @type {number[]} */
	const out = [];
	for (let i = 0; i < barCount; i++) {
		state = Math.imul(state, 1103515245) + 12345;
		const sample = ((state >>> 16) & 0x7fff) / 32767;
		out.push(0.12 + sample * 0.88);
	}
	return out;
}

/** @param {string} s */
function hashString(s) {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	return h || 1;
}

/** @param {number} ms */
export function formatAudioDurationMs(ms) {
	const total = Math.max(0, Math.floor(Number(ms) / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}

/** Recording timer with tenths — matches Kotlin formatVoiceRecordTime. */
export function formatVoiceRecordTime(ms) {
	const n = Math.max(0, Number(ms) || 0);
	const tenths = Math.floor(n / 100) % 10;
	const totalSeconds = Math.floor(n / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

export const VOICE_SPEEDS = [1, 1.5, 2];

/** @param {number} speed */
export function nextVoiceSpeed(speed) {
	const i = VOICE_SPEEDS.indexOf(speed);
	return VOICE_SPEEDS[(i + 1) % VOICE_SPEEDS.length] || 1;
}

/** @param {number} speed */
export function formatVoiceSpeed(speed) {
	const n = Number(speed) || 1;
	return Number.isInteger(n) ? `${n}×` : `${n}×`;
}
