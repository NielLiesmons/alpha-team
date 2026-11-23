/**
 * Browser MediaRecorder for chat voice notes — hold / lock / pause.
 */

const PREFERRED = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus',
	'audio/ogg'
];

/** @returns {string} */
export function pickVoiceMime() {
	if (typeof MediaRecorder === 'undefined') return '';
	for (const t of PREFERRED) {
		if (MediaRecorder.isTypeSupported(t)) return t;
	}
	return '';
}

/**
 * @returns {{
 *   start: () => Promise<void>,
 *   pause: () => void,
 *   resume: () => void,
 *   stop: () => Promise<{ file: File, blob: Blob, durationMs: number, bytes: number } | null>,
 *   cancel: () => void,
 *   isPaused: () => boolean,
 *   elapsedMs: () => number
 * }}
 */
export function createVoiceRecorder() {
	/** @type {MediaRecorder | null} */
	let recorder = null;
	/** @type {MediaStream | null} */
	let stream = null;
	/** @type {Blob[]} */
	let chunks = [];
	let mime = '';
	let paused = false;
	let startedAt = 0;
	let pausedAt = 0;
	let pausedTotal = 0;

	function elapsedMs() {
		if (!startedAt) return 0;
		const now = paused && pausedAt ? pausedAt : Date.now();
		return Math.max(0, now - startedAt - pausedTotal);
	}

	async function start() {
		cancel();
		mime = pickVoiceMime();
		if (!mime) throw new Error('voice.unsupported');
		stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true
			}
		});
		chunks = [];
		paused = false;
		pausedTotal = 0;
		pausedAt = 0;
		startedAt = Date.now();
		recorder = new MediaRecorder(stream, { mimeType: mime });
		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};
		recorder.start(250);
	}

	function pause() {
		if (!recorder || recorder.state !== 'recording') return;
		recorder.pause();
		paused = true;
		pausedAt = Date.now();
	}

	function resume() {
		if (!recorder || recorder.state !== 'paused') return;
		pausedTotal += Date.now() - pausedAt;
		pausedAt = 0;
		paused = false;
		recorder.resume();
	}

	function tearDownTracks() {
		try {
			stream?.getTracks().forEach((t) => t.stop());
		} catch {
			/* ignore */
		}
		stream = null;
	}

	function cancel() {
		try {
			if (recorder && recorder.state !== 'inactive') recorder.stop();
		} catch {
			/* ignore */
		}
		recorder = null;
		chunks = [];
		paused = false;
		startedAt = 0;
		pausedAt = 0;
		pausedTotal = 0;
		tearDownTracks();
	}

	/**
	 * @returns {Promise<{ file: File, blob: Blob, durationMs: number, bytes: number } | null>}
	 */
	function stop() {
		const rec = recorder;
		const durationMs = elapsedMs();
		if (!rec || rec.state === 'inactive') {
			tearDownTracks();
			recorder = null;
			return Promise.resolve(null);
		}
		return new Promise((resolve) => {
			rec.onstop = () => {
				const blob = new Blob(chunks, { type: mime || 'audio/webm' });
				chunks = [];
				recorder = null;
				tearDownTracks();
				paused = false;
				startedAt = 0;
				pausedAt = 0;
				pausedTotal = 0;
				if (!blob.size) {
					resolve(null);
					return;
				}
				const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
				const file = new File([blob], `voice-${Date.now()}.${ext}`, {
					type: blob.type || mime
				});
				resolve({ file, blob, durationMs, bytes: blob.size });
			};
			try {
				if (rec.state === 'paused') rec.resume();
				rec.stop();
			} catch {
				tearDownTracks();
				resolve(null);
			}
		});
	}

	return {
		start,
		pause,
		resume,
		stop,
		cancel,
		isPaused: () => paused,
		elapsedMs
	};
}
