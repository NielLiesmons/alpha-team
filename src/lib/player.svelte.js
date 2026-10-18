/**
 * Player library + now-playing state (Drive-backed when connected).
 */

import { getPath } from './drive/client.js';
import {
	addTracksToPlaylist as addTracksToPlaylistOnDrive,
	createPlaylist as createPlaylistOnDrive,
	deleteTracks as deleteTracksOnDrive,
	listPlaylists,
	listTracks,
	patchTracks,
	uploadTrack
} from './drive/entities.js';
import {
	loadMediaManifest,
	mediaSourceCtor,
	mseMimeForContentType,
	streamMediaChunks
} from './drive/media.js';
import { hasMpegFrameSync } from './drive/audio-meta.js';
import { pushRecentlyPlayed, readRecentlyPlayed } from './player-cache.js';
import { actor } from './actor.svelte.js';
import { activeSession, driveSession } from './drive/session.svelte.js';

/** @type {Map<string, string>} cover_path → object URL */
const coverUrlCache = new Map();
/** In-flight cover fetches (dedupe). */
const coverInflight = new Map();
/** Cap parallel decrypts — mass cover hydrate froze Firefox. */
const COVER_CONCURRENCY = 2;
let coverActive = 0;
/** @type {(() => void)[]} */
const coverWait = [];

function acquireCoverSlot() {
	if (coverActive < COVER_CONCURRENCY) {
		coverActive++;
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		coverWait.push(() => {
			coverActive++;
			resolve();
		});
	});
}

function releaseCoverSlot() {
	coverActive = Math.max(0, coverActive - 1);
	const next = coverWait.shift();
	if (next) next();
}

/** @type {any[]} */
export const tracks = $state([]);
/** @type {any[]} */
export const playlists = $state([]);
/** Bumps when recently-played history changes (for list reactivity). */
export const recentPlayedRev = $state({ n: 0 });

/** Browse selection for list column → detail column. */
export const playerBrowse = $state({
	/** @type {'songs' | 'artists' | 'albums' | 'recent' | 'played' | 'playlist'} */
	mode: 'songs',
	/** @type {string | null} */
	playlistId: null,
	/** @type {string | null} artist name when drilling in from Artists */
	artist: null,
	/** @type {string | null} album title when drilling in from Albums */
	album: null,
	/** Mobile: slide detail over the browse list. Desktop always shows detail. */
	detailOpen: true
});

export const playerUi = $state({
	/** @type {'idle' | 'loading' | 'ready' | 'error'} */
	status: 'idle',
	/** @type {string | null} */
	currentId: null,
	/** @type {string | null} object URL for <audio> */
	objectUrl: null,
	/** 0..1 bytes downloaded / total — only source for the loaded scrubber lane */
	bufferRatio: 0,
	/** Playback clock (seconds), owned by PlayerEngine */
	currentTime: 0,
	/** Reliable full-track duration (0 while unknown / first-chunk-only) */
	duration: 0,
	playing: false,
	/** Explicit play intent — survives src soft-swaps; pause clears this. */
	wantsPlay: false,
	/** Mobile now-playing bottom sheet */
	nowPlayingOpen: false,
	/** @type {string[]} track ids open in edit modal (1 = single, many = bulk) */
	editingIds: [],
	/** @type {string[]} multi-select in Songs / playlist lists */
	selectedIds: [],
	/** When set, plays after the current track ends (instead of list-next). */
	/** @type {string | null} */
	upNextId: null,
	/** New playlist create sheet */
	playlistCreateOpen: false,
	/** Track ids to add after creating a playlist from the ⋯ menu */
	/** @type {string[]} */
	pendingAddTrackIds: [],
	error: '',
	uploading: false,
	uploadLabel: ''
});

/** Upload job UI — modal can close while work continues. */
export const uploadUi = $state({
	open: false,
	active: false,
	/** @type {{ id: string, name: string, status: 'queued' | 'uploading' | 'done' | 'error' | 'canceled', progress: number, error?: string }[]} */
	items: []
});

/** @type {AbortController | null} */
let uploadAbort = null;

function isMobileViewport() {
	return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/** Bumps on every play/stop so stale fetches never win. */
let playGeneration = 0;
/** @type {AbortController | null} */
let playAbort = null;
/** @type {HTMLAudioElement | null} */
let boundAudio = null;
/** @type {MediaSource | null} */
let activeMediaSource = null;
/** Background MSE buffering (must not block playTrack). */
/** @type {Promise<void> | null} */
let bufferTail = null;
/**
 * Blob progressive: called when the early truncated file stalls/ends before full download.
 * @type {null | (() => void)}
 */
let onProgressiveStall = null;

/**
 * If progressive blob ran out before the full file arrived, grow/swap instead of skipping tracks.
 * @returns {boolean} true if handled
 */
export function handleProgressiveStall() {
	if (playerUi.bufferRatio >= 0.999) return false;
	if (!onProgressiveStall) return false;
	onProgressiveStall();
	return true;
}

/**
 * @param {HTMLAudioElement | null} el
 */
export function bindPlayerAudio(el) {
	boundAudio = el;
}

function revokeUrl() {
	if (playerUi.objectUrl) {
		URL.revokeObjectURL(playerUi.objectUrl);
		playerUi.objectUrl = null;
	}
	activeMediaSource = null;
	bufferTail = null;
}

function cancelInFlightPlay() {
	playGeneration += 1;
	if (playAbort) {
		playAbort.abort();
		playAbort = null;
	}
	bufferTail = null;
	if (activeMediaSource && activeMediaSource.readyState === 'open') {
		try {
			activeMediaSource.endOfStream();
		} catch {
			/* ignore */
		}
	}
}

/**
 * @param {any[]} list
 */
function replaceTracks(list) {
	tracks.splice(0, tracks.length, ...list);
}

/**
 * @param {any[]} list
 */
function replacePlaylists(list) {
	playlists.splice(0, playlists.length, ...list);
}

export async function refreshTracks() {
	const session = activeSession();
	if (!session) {
		replaceTracks([]);
		replacePlaylists([]);
		playerUi.status = 'idle';
		return;
	}
	driveSession.loading = tracks.length === 0;
	try {
		const [list, pls] = await Promise.all([listTracks(session), listPlaylists(session)]);
		replaceTracks(list);
		replacePlaylists(pls);
	} catch (e) {
		playerUi.error = e instanceof Error ? e.message : String(e);
	} finally {
		driveSession.loading = false;
	}
}

/**
 * @param {'songs' | 'artists' | 'albums' | 'recent' | 'played' | 'playlist'} mode
 * @param {{ playlistId?: string | null, artist?: string | null, album?: string | null }} [opts]
 */
export function setPlayerBrowse(mode, opts = {}) {
	playerBrowse.mode = mode;
	playerBrowse.playlistId = opts.playlistId ?? null;
	playerBrowse.artist = opts.artist ?? null;
	playerBrowse.album = opts.album ?? null;
	playerBrowse.detailOpen = true;
	playerUi.selectedIds = [];
}

export function closePlayerDetail() {
	playerBrowse.detailOpen = false;
}

/**
 * @param {string | string[]} [trackIds] optional tracks to add after create
 */
export function openPlaylistCreate(trackIds) {
	playerUi.pendingAddTrackIds = trackIds
		? Array.isArray(trackIds)
			? [...trackIds]
			: [trackIds]
		: [];
	playerUi.playlistCreateOpen = true;
}

export function closePlaylistCreate() {
	playerUi.playlistCreateOpen = false;
	playerUi.pendingAddTrackIds = [];
}

/**
 * @param {string} title
 */
export async function createPlaylist(title) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	let pl = await createPlaylistOnDrive(session, { title });
	const pending = [...playerUi.pendingAddTrackIds];
	playerUi.pendingAddTrackIds = [];
	if (pending.length) {
		pl = await addTracksToPlaylistOnDrive(session, pl, pending);
	}
	const idx = playlists.findIndex((p) => p.id === pl.id);
	if (idx >= 0) playlists[idx] = pl;
	else playlists.push(pl);
	playlists.sort((a, b) => String(a.title).localeCompare(String(b.title)));
	playerUi.playlistCreateOpen = false;
	setPlayerBrowse('playlist', { playlistId: pl.id });
	return pl;
}

/**
 * @param {string} playlistId
 * @param {string | string[]} trackIds
 */
export async function addTracksToPlaylist(playlistId, trackIds) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	const pl = playlists.find((p) => p.id === playlistId);
	if (!pl) throw new Error('Playlist not found');
	const next = await addTracksToPlaylistOnDrive(session, pl, trackIds);
	const idx = playlists.findIndex((p) => p.id === playlistId);
	if (idx >= 0) playlists[idx] = next;
	else playlists.push(next);
	return next;
}

export function openUploadModal() {
	uploadUi.open = true;
}

export function closeUploadModal() {
	uploadUi.open = false;
}

/** Cancel the whole upload batch (in-flight + queued). */
export function cancelUploadJob() {
	uploadAbort?.abort();
	for (const item of uploadUi.items) {
		if (item.status === 'queued' || item.status === 'uploading') {
			item.status = 'canceled';
		}
	}
}

/**
 * @param {FileList | File[]} files
 */
export async function uploadAudioFiles(files) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	const list = [...files];
	if (!list.length) return;

	// Don't start a second batch while one is running
	if (uploadUi.active) throw new Error('An upload is already in progress');

	uploadAbort = new AbortController();
	const signal = uploadAbort.signal;
	const stamp = Date.now();
	uploadUi.items = list.map((file, i) => ({
		id: `${stamp}-${i}`,
		name: file.name,
		status: /** @type {'queued'} */ ('queued'),
		progress: 0
	}));
	uploadUi.open = true;
	uploadUi.active = true;
	playerUi.uploading = true;
	playerUi.error = '';
	playerUi.uploadLabel = '';

	try {
		for (let i = 0; i < list.length; i++) {
			if (signal.aborted) break;
			const item = uploadUi.items[i];
			const file = list[i];
			item.status = 'uploading';
			item.progress = 0;
			try {
				await uploadTrack(session, file, {
					signal,
					onProgress: (phase, done, total) => {
						if (phase === 'upload' && total > 0) {
							item.progress = Math.min(100, Math.round((done / total) * 100));
						} else if (phase === 'index') {
							item.progress = 100;
						}
					}
				});
				if (signal.aborted) {
					item.status = 'canceled';
					break;
				}
				item.status = 'done';
				item.progress = 100;
			} catch (e) {
				if (e?.name === 'AbortError' || signal.aborted) {
					item.status = 'canceled';
					break;
				}
				item.status = 'error';
				item.error = e instanceof Error ? e.message : String(e);
			}
		}
		await refreshTracks();
	} finally {
		uploadUi.active = false;
		playerUi.uploading = false;
		playerUi.uploadLabel = '';
		uploadAbort = null;
		for (const item of uploadUi.items) {
			if (item.status === 'queued') item.status = 'canceled';
		}
	}
}

/**
 * @param {SourceBuffer} sb
 * @param {BufferSource} data
 * @param {AbortSignal} signal
 */
function appendBuffer(sb, data, signal) {
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			const err = new Error('Aborted');
			err.name = 'AbortError';
			reject(err);
		};
		const cleanup = () => {
			signal.removeEventListener('abort', onAbort);
			sb.removeEventListener('updateend', onEnd);
			sb.removeEventListener('error', onErr);
		};
		const onEnd = () => {
			cleanup();
			resolve();
		};
		const onErr = () => {
			cleanup();
			reject(new Error('SourceBuffer error'));
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener('abort', onAbort);
		const tryAppend = () => {
			if (signal.aborted) {
				onAbort();
				return;
			}
			if (sb.updating) {
				sb.addEventListener('updateend', tryAppend, { once: true });
				return;
			}
			sb.addEventListener('updateend', onEnd);
			sb.addEventListener('error', onErr);
			try {
				sb.appendBuffer(data);
			} catch (e) {
				cleanup();
				reject(e instanceof Error ? e : new Error(String(e)));
			}
		};
		tryAppend();
	});
}

/**
 * Attach object URL to the bound <audio> immediately (don't wait for Svelte effects).
 * @param {string} url
 */
function attachAudioSrc(url) {
	if (!boundAudio) return;
	// Avoid load() — it resets MediaSource and forces a full rebuffer.
	if (boundAudio.src !== url) {
		boundAudio.src = url;
	}
}

/**
 * @param {number} ms
 * @param {AbortSignal} signal
 */
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			const err = new Error('Aborted');
			err.name = 'AbortError';
			reject(err);
			return;
		}
		const t = setTimeout(resolve, ms);
		const onAbort = () => {
			clearTimeout(t);
			const err = new Error('Aborted');
			err.name = 'AbortError';
			reject(err);
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Play via MediaSource — returns as soon as the first chunk is appended so
 * playback starts while remaining chunks keep downloading in the background.
 * @param {import('./drive/client.js').DriveSession} session
 * @param {any} track
 * @param {string} mime
 * @param {any} manifest
 * @param {string} fileKeyHex
 * @param {number} generation
 * @param {AbortSignal} signal
 */
async function playViaMse(session, track, mime, manifest, fileKeyHex, generation, signal) {
	const MS = mediaSourceCtor();
	if (!MS) throw new Error('MediaSource unavailable');

	// Wait a frame so PlayerEngine has bound the <audio> element.
	if (!boundAudio) {
		await new Promise((r) => requestAnimationFrame(() => r(undefined)));
	}

	const ms = new MS();
	activeMediaSource = ms;
	const url = URL.createObjectURL(ms);
	playerUi.objectUrl = url;
	attachAudioSrc(url);

	const sourceOpen = new Promise((resolve, reject) => {
		const onOpen = () => {
			cleanup();
			resolve(undefined);
		};
		const onAbort = () => {
			cleanup();
			const err = new Error('Aborted');
			err.name = 'AbortError';
			reject(err);
		};
		const onTimeout = () => {
			cleanup();
			reject(new Error('MediaSource open timed out'));
		};
		const cleanup = () => {
			ms.removeEventListener('sourceopen', onOpen);
			signal.removeEventListener('abort', onAbort);
			clearTimeout(timer);
		};
		if (ms.readyState === 'open') {
			cleanup();
			resolve(undefined);
			return;
		}
		if (signal.aborted) {
			onAbort();
			return;
		}
		ms.addEventListener('sourceopen', onOpen, { once: true });
		signal.addEventListener('abort', onAbort);
		attachAudioSrc(url);
		const timer = setTimeout(onTimeout, 4000);
	});

	await sourceOpen;
	if (generation !== playGeneration) return null;

	let sb;
	try {
		sb = ms.addSourceBuffer(mime);
	} catch (e) {
		URL.revokeObjectURL(url);
		if (playerUi.objectUrl === url) playerUi.objectUrl = null;
		activeMediaSource = null;
		throw e instanceof Error ? e : new Error(String(e));
	}
	// Raw MP3 is a contiguous bitstream — sequence mode concatenates chunks cleanly.
	try {
		sb.mode = 'sequence';
	} catch {
		/* ignore */
	}

	let started = false;
	let chunksAppended = 0;
	/** Prefix of appended bytes — used to wait for a real MPEG frame (skip fat ID3). */
	let headBytes = new Uint8Array(0);
	const wantMpeg = mime.includes('mpeg');
	/** @type {((v?: undefined) => void) | null} */
	let resolveStart = null;
	/** @type {((e: Error) => void) | null} */
	let rejectStart = null;
	const startedGate = new Promise((resolve, reject) => {
		resolveStart = resolve;
		rejectStart = reject;
	});

	const tryStart = () => {
		if (started || generation !== playGeneration) return;
		if (wantMpeg && chunksAppended > 0 && !hasMpegFrameSync(headBytes) && playerUi.bufferRatio < 0.999) {
			return;
		}
		started = true;
		playerUi.status = 'ready';
		if (playerUi.wantsPlay) boundAudio?.play()?.catch(() => {});
		resolveStart?.();
	};

	bufferTail = streamMediaChunks(session, track.media_path, {
		signal,
		manifest,
		fileKeyHex,
		onProgress: (done, total) => {
			if (generation !== playGeneration) return;
			playerUi.bufferRatio = total > 0 ? done / total : 0;
		},
		onChunk: async (_i, bytes) => {
			if (generation !== playGeneration || signal.aborted) return;
			if (ms.readyState !== 'open') {
				throw new Error('MediaSource closed during append');
			}
			// Copy — some engines detach the underlying ArrayBuffer after append.
			const copy = bytes.slice();
			if (wantMpeg && headBytes.length < 512 * 1024) {
				const next = new Uint8Array(Math.min(512 * 1024, headBytes.length + copy.length));
				next.set(headBytes);
				next.set(copy.subarray(0, next.length - headBytes.length), headBytes.length);
				headBytes = next;
			}
			await appendBuffer(sb, copy, signal);
			chunksAppended += 1;
			tryStart();
		}
	})
		.then(() => {
			if (generation !== playGeneration) return;
			if (ms.readyState === 'open') {
				try {
					ms.endOfStream();
				} catch {
					/* ignore */
				}
			}
			playerUi.bufferRatio = 1;
			tryStart();
		})
		.catch((e) => {
			if (generation !== playGeneration || e?.name === 'AbortError') return;
			if (!started) {
				rejectStart?.(e instanceof Error ? e : new Error(String(e)));
			}
		});

	await startedGate;
	if (generation !== playGeneration) return null;
	return url;
}

/**
 * Concatenate chunk parts into one Uint8Array.
 * @param {Uint8Array[]} parts
 */
function concatParts(parts) {
	let total = 0;
	for (const p of parts) total += p.length;
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

/**
 * Fallback when MSE can't append MP3 (Safari/iOS): play growing blobs.
 * Truncated early blobs MUST be replaced before they end — otherwise phones stop cold.
 * @param {import('./drive/client.js').DriveSession} session
 * @param {any} track
 * @param {any} manifest
 * @param {string} fileKeyHex
 * @param {number} generation
 * @param {AbortSignal} signal
 */
async function playViaBlob(session, track, manifest, fileKeyHex, generation, signal) {
	const type = manifest.content_type || 'audio/mpeg';
	/** @type {Uint8Array[]} */
	const parts = [];
	let started = false;
	let activeUrl = /** @type {string | null} */ (null);
	let partsAttached = 0;
	let swapping = false;

	/** @type {((v?: undefined) => void) | null} */
	let resolveStart = null;
	/** @type {((e: Error) => void) | null} */
	let rejectStart = null;
	const startedGate = new Promise((resolve, reject) => {
		resolveStart = resolve;
		rejectStart = reject;
	});

	/**
	 * Attach a blob built from the first `n` parts (or all). Restores playhead + wantsPlay.
	 * @param {number} [n]
	 */
	const attachFromParts = (n = parts.length) => {
		if (generation !== playGeneration || n < 1 || n > parts.length) return;
		if (swapping) return;
		// Already playing this many parts (or more).
		if (started && n <= partsAttached && activeUrl) return;
		swapping = true;
		const slice = parts.slice(0, n);
		const bytes = concatParts(slice);
		const url = URL.createObjectURL(new Blob([bytes], { type }));
		const audio = boundAudio;
		const t = audio?.currentTime ?? 0;
		const resume = playerUi.wantsPlay;
		const prev = activeUrl;
		activeUrl = url;
		playerUi.objectUrl = url;
		attachAudioSrc(url);
		partsAttached = n;

		let done = false;
		const finish = () => {
			if (done || generation !== playGeneration || !boundAudio) return;
			done = true;
			swapping = false;
			try {
				if (t > 0) boundAudio.currentTime = t;
			} catch {
				/* ignore */
			}
			if (resume && playerUi.wantsPlay) boundAudio.play()?.catch(() => {});
			else {
				boundAudio.pause();
				playerUi.playing = false;
			}
		};
		if (audio) {
			audio.addEventListener('loadedmetadata', finish, { once: true });
			requestAnimationFrame(() => {
				if (boundAudio && boundAudio.readyState >= 1) finish();
			});
			setTimeout(finish, 400);
		} else {
			swapping = false;
		}
		if (prev && prev !== url) URL.revokeObjectURL(prev);
	};

	const startEarly = () => {
		if (started || generation !== playGeneration || !parts.length) return;
		const early = concatParts(parts);
		const looksMp3 = type.includes('mpeg') || type.includes('mp3');
		if (looksMp3 && !hasMpegFrameSync(early) && playerUi.bufferRatio < 0.999) return;
		started = true;
		playerUi.status = 'ready';
		attachFromParts(parts.length);
		if (playerUi.wantsPlay) boundAudio?.play()?.catch(() => {});
		resolveStart?.();
	};

	/** Grow attached blob when the engine stalls or early file ends. */
	const growIfNeeded = () => {
		if (generation !== playGeneration) return;
		if (!started || parts.length <= partsAttached) return;
		attachFromParts(parts.length);
	};

	onProgressiveStall = () => {
		if (generation !== playGeneration) return;
		if (parts.length > partsAttached) growIfNeeded();
		else if (playerUi.wantsPlay) boundAudio?.play()?.catch(() => {});
	};

	bufferTail = streamMediaChunks(session, track.media_path, {
		signal,
		manifest,
		fileKeyHex,
		onProgress: (done, total) => {
			if (generation !== playGeneration) return;
			playerUi.bufferRatio = total > 0 ? done / total : 0;
		},
		onChunk: async (_i, bytes) => {
			if (generation !== playGeneration) return;
			parts.push(bytes);
			if (!started) startEarly();
			// Further growth is driven by waiting / near-end / ended (see PlayerEngine).
		}
	})
		.then(async () => {
			if (generation !== playGeneration) return;
			playerUi.bufferRatio = 1;
			onProgressiveStall = null;
			if (!started) {
				started = true;
				playerUi.status = 'ready';
				attachFromParts(parts.length);
				if (playerUi.wantsPlay) boundAudio?.play()?.catch(() => {});
				resolveStart?.();
				return;
			}
			// Final full-file attach (same grow path).
			attachFromParts(parts.length);
		})
		.catch((e) => {
			if (generation !== playGeneration || e?.name === 'AbortError') return;
			onProgressiveStall = null;
			if (!started) {
				rejectStart?.(e instanceof Error ? e : new Error(String(e)));
			}
		});

	const timeout = sleep(30000, signal).then(() => {
		if (!started) {
			rejectStart?.(new Error('Timed out waiting for audio'));
		}
	});
	void timeout;

	await startedGate;
	if (generation !== playGeneration) return null;
	return playerUi.objectUrl;
}

/**
 * Stream from Drive; MSE starts playback while later chunks still download.
 * @param {any} track
 */
export async function playTrack(track) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	if (!track?.media_path) throw new Error('Track has no media_path');

	cancelInFlightPlay();
	onProgressiveStall = null;
	const generation = playGeneration;
	const ac = new AbortController();
	playAbort = ac;

	revokeUrl();
	playerUi.currentId = track.id;
	playerUi.status = 'loading';
	playerUi.bufferRatio = 0;
	playerUi.currentTime = 0;
	// Show tagged length immediately — MSE often reports Infinity until EOS.
	playerUi.duration =
		typeof track.duration_ms === 'number' && track.duration_ms > 0
			? track.duration_ms / 1000
			: 0;
	playerUi.playing = false;
	playerUi.wantsPlay = true;
	playerUi.error = '';
	if (track.cover_path) void ensureTrackCover(track);

	try {
		const { manifest, fileKeyHex } = await loadMediaManifest(
			session,
			track.media_path,
			ac.signal
		);
		if (generation !== playGeneration) return null;

		const ct = manifest.content_type || 'audio/mpeg';
		const mime = mseMimeForContentType(ct);

		let url;
		if (mime && mediaSourceCtor()) {
			try {
				url = await playViaMse(
					session,
					track,
					mime,
					manifest,
					fileKeyHex,
					generation,
					ac.signal
				);
			} catch (e) {
				if (e?.name === 'AbortError' || generation !== playGeneration) throw e;
				// MSE rejected before start — progressive blob (still starts on first chunk).
				cancelInFlightPlay();
				revokeUrl();
				const gen2 = playGeneration;
				const ac2 = new AbortController();
				playAbort = ac2;
				playerUi.currentId = track.id;
				playerUi.status = 'loading';
				playerUi.bufferRatio = 0;
				url = await playViaBlob(session, track, manifest, fileKeyHex, gen2, ac2.signal);
			}
		} else {
			url = await playViaBlob(session, track, manifest, fileKeyHex, generation, ac.signal);
		}
		const liveGen = playGeneration;
		// generation may have been bumped by MSE→blob fallback; treat either as ok if we have a url
		if (url && (generation === liveGen || playerUi.currentId === track.id)) {
			playAbort = null;
			if (playerUi.upNextId === track.id) playerUi.upNextId = null;
			if (isMobileViewport()) playerUi.nowPlayingOpen = true;
			const sess = activeSession();
			if (sess) {
				pushRecentlyPlayed(actor.email, sess, track.id);
				recentPlayedRev.n += 1;
			}
		}
		return url;
	} catch (e) {
		if (e?.name === 'AbortError' || generation !== playGeneration) {
			return null;
		}
		playerUi.status = 'error';
		playerUi.error = e instanceof Error ? e.message : String(e);
		playerUi.bufferRatio = 0;
		throw e;
	}
}

export function stopPlayback() {
	cancelInFlightPlay();
	onProgressiveStall = null;
	revokeUrl();
	playerUi.currentId = null;
	playerUi.status = 'idle';
	playerUi.bufferRatio = 0;
	playerUi.currentTime = 0;
	playerUi.duration = 0;
	playerUi.playing = false;
	playerUi.wantsPlay = false;
	playerUi.nowPlayingOpen = false;
	playerUi.upNextId = null;
}

export function openNowPlaying() {
	if (!playerUi.currentId) return;
	playerUi.nowPlayingOpen = true;
}

export function closeNowPlaying() {
	playerUi.nowPlayingOpen = false;
}

/**
 * @param {string | { id: string } | Array<string | { id: string }>} trackOrIds
 */
export function openTrackEdit(trackOrIds) {
	const list = Array.isArray(trackOrIds) ? trackOrIds : [trackOrIds];
	const ids = list
		.map((t) => (typeof t === 'string' ? t : t?.id))
		.filter(Boolean);
	if (!ids.length) return;
	playerUi.editingIds = ids;
}

export function openBulkTrackEdit() {
	if (!playerUi.selectedIds.length) return;
	playerUi.editingIds = [...playerUi.selectedIds];
}

export function closeTrackEdit() {
	playerUi.editingIds = [];
}

export function editingTracks() {
	const set = new Set(playerUi.editingIds);
	return tracks.filter((t) => set.has(t.id));
}

export function editingTrack() {
	return editingTracks()[0] ?? null;
}

/**
 * @param {any} next
 */
function applyTrackLocal(next) {
	const idx = tracks.findIndex((t) => t.id === next.id);
	const prev = idx >= 0 ? tracks[idx] : null;
	const coverPath = next.cover_path ?? null;
	const cachedUrl = coverPath ? coverUrlCache.get(coverPath) : null;
	const merged = {
		...(prev ?? {}),
		...next,
		artists: next.artists,
		album: next.album ?? '',
		album_artist: next.album_artist ?? '',
		year: next.year ?? null,
		genres: next.genres ?? [],
		cover_path: coverPath,
		cover_url: cachedUrl ?? (coverPath && prev?.cover_path === coverPath ? prev.cover_url : null)
	};
	if (idx >= 0) tracks[idx] = merged;
	else tracks.push(merged);
	if (coverPath && !merged.cover_url) {
		void hydrateCoverUrl(merged.id, coverPath);
	}
}

/**
 * @param {string} trackId
 * @param {string} coverPath
 */
async function hydrateCoverUrl(trackId, coverPath) {
	const session = activeSession();
	if (!session || !coverPath) return;

	const cached = coverUrlCache.get(coverPath);
	if (cached) {
		const idx = tracks.findIndex((t) => t.id === trackId);
		if (idx >= 0 && tracks[idx].cover_path === coverPath) {
			tracks[idx] = { ...tracks[idx], cover_url: cached };
		}
		return;
	}

	let pending = coverInflight.get(coverPath);
	if (!pending) {
		pending = (async () => {
			await acquireCoverSlot();
			try {
				const bytes = await getPath(session, coverPath);
				const copy = new Uint8Array(bytes.byteLength);
				copy.set(bytes);
				const blob = new Blob([copy], { type: sniffImageType(copy) });
				const url = URL.createObjectURL(blob);
				coverUrlCache.set(coverPath, url);
				return url;
			} finally {
				releaseCoverSlot();
				coverInflight.delete(coverPath);
			}
		})();
		coverInflight.set(coverPath, pending);
	}

	try {
		const url = await pending;
		const idx = tracks.findIndex((t) => t.id === trackId);
		if (idx >= 0 && tracks[idx].cover_path === coverPath) {
			tracks[idx] = { ...tracks[idx], cover_url: url };
		}
	} catch (e) {
		console.warn('Cover hydrate failed', coverPath, e);
	}
}

/**
 * @param {Uint8Array} bytes
 */
function sniffImageType(bytes) {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return 'image/png';
	}
	if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46) {
		return 'image/webp';
	}
	return 'image/jpeg';
}

/** Ensure current track (and library rows with cover_path) get object URLs. */
export async function ensureTrackCover(track) {
	if (!track?.cover_path) return null;
	if (track.cover_url) return track.cover_url;
	await hydrateCoverUrl(track.id, track.cover_path);
	return tracks.find((t) => t.id === track.id)?.cover_url ?? null;
}

/**
 * @param {{
 *   title?: string,
 *   artists?: string[],
 *   album?: string,
 *   album_artist?: string,
 *   year?: number | null,
 *   genres?: string[],
 *   coverFile?: File | null,
 *   clearCover?: boolean,
 *   onProgress?: (label: string) => void
 * }} patch
 */
export async function saveTrackEdit(patch) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	const list = editingTracks();
	if (!list.length) throw new Error('No track selected');
	const onProgress = patch.onProgress;

	/** @type {Record<string, any>} */
	const fields = {};
	if (list.length === 1) {
		fields.title = patch.title ?? list[0].title;
		fields.artists = patch.artists ?? list[0].artists;
		fields.album = patch.album ?? list[0].album ?? '';
		fields.album_artist = patch.album_artist ?? list[0].album_artist ?? '';
		fields.year = patch.year !== undefined ? patch.year : (list[0].year ?? null);
		fields.genres = patch.genres ?? list[0].genres ?? [];
	} else {
		if (patch.artists) fields.artists = patch.artists;
		if (patch.album !== undefined) fields.album = patch.album;
		if (patch.album_artist !== undefined) fields.album_artist = patch.album_artist;
		if (patch.year !== undefined) fields.year = patch.year;
		if (patch.genres) fields.genres = patch.genres;
	}
	if (patch.coverFile) fields.coverFile = patch.coverFile;
	if (patch.clearCover) fields.clearCover = true;

	onProgress?.(list.length > 1 ? `Updating ${list.length} tracks…` : 'Saving…');
	const updated = await patchTracks(session, list, fields, { onProgress });
	// Instant cover preview from the file we just uploaded (avoid waiting on Drive fetch)
	if (patch.coverFile && updated[0]?.cover_path) {
		const localUrl = URL.createObjectURL(patch.coverFile);
		const prev = coverUrlCache.get(updated[0].cover_path);
		if (prev && prev !== localUrl) URL.revokeObjectURL(prev);
		coverUrlCache.set(updated[0].cover_path, localUrl);
	}
	for (const next of updated) applyTrackLocal(next);
	onProgress?.('Saved');
	// Caller closes the sheet after showing status — don't yank the UI away mid-feedback.
	return updated;
}

/**
 * @param {string} id
 */
export function toggleTrackSelected(id) {
	const i = playerUi.selectedIds.indexOf(id);
	if (i >= 0) playerUi.selectedIds = playerUi.selectedIds.filter((x) => x !== id);
	else playerUi.selectedIds = [...playerUi.selectedIds, id];
}

export function clearTrackSelection() {
	playerUi.selectedIds = [];
}

/**
 * @param {string[]} ids
 */
export function setTrackSelection(ids) {
	playerUi.selectedIds = [...ids];
}

/**
 * @param {string | string[] | null} [ids]
 */
export async function removeTracks(ids) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	const idList = ids
		? Array.isArray(ids)
			? ids
			: [ids]
		: [...playerUi.selectedIds];
	if (!idList.length) return;
	const list = tracks.filter((t) => idList.includes(t.id));
	if (!list.length) return;

	const playing = playerUi.currentId && idList.includes(playerUi.currentId);
	await deleteTracksOnDrive(session, list);
	const remove = new Set(idList);
	const next = tracks.filter((t) => !remove.has(t.id));
	tracks.splice(0, tracks.length, ...next);
	playerUi.selectedIds = playerUi.selectedIds.filter((id) => !remove.has(id));
	playerUi.editingIds = playerUi.editingIds.filter((id) => !remove.has(id));
	if (playing) stopPlayback();
}

/**
 * Reliable duration while progressive chunks load.
 * First-chunk-only sources report duration ≈ buffered end — treat that as unknown.
 * MSE often reports Infinity until endOfStream — then use tagged fallbackSec.
 * @param {HTMLAudioElement | null} audio
 * @param {number} bufferRatio
 * @param {number} [fallbackSec] from track.duration_ms / 1000
 */
export function reliableDuration(audio, bufferRatio, fallbackSec = 0) {
	const fallback = Number.isFinite(fallbackSec) && fallbackSec > 0 ? fallbackSec : 0;
	if (!audio) return fallback;
	const d = audio.duration;
	if (!Number.isFinite(d) || d <= 0) return fallback;
	if (bufferRatio >= 0.999) return d;
	if (!audio.buffered.length) return fallback || 0;
	const end = audio.buffered.end(audio.buffered.length - 1);
	// Progressive blob: duration ≈ buffered end until the full file is swapped in.
	if (end >= d - 0.35) return fallback || 0;
	return d;
}

/**
 * Seek by 0..1 ratio of reliable duration. Clamped to buffered range while loading.
 * @param {number} ratio
 */
export function seekPlayback(ratio) {
	if (!boundAudio || playerUi.duration <= 0) return;
	const r = Math.min(1, Math.max(0, ratio));
	let t = r * playerUi.duration;
	if (playerUi.bufferRatio < 0.999 && boundAudio.buffered.length > 0) {
		const end = boundAudio.buffered.end(boundAudio.buffered.length - 1);
		t = Math.min(t, Math.max(0, end - 0.05));
	}
	try {
		boundAudio.currentTime = t;
		playerUi.currentTime = t;
	} catch {
		/* ignore */
	}
}

export function currentTrack() {
	return tracks.find((t) => t.id === playerUi.currentId) ?? null;
}

/** Queue for skip — current browse list, or full library. */
export function playQueue() {
	const vis = visibleTracks();
	if (vis.length) return vis;
	return [...tracks].sort(compareTracks);
}

/**
 * @param {-1 | 1} delta
 */
export async function playAdjacent(delta) {
	const queue = playQueue();
	if (!queue.length) return;
	let idx = queue.findIndex((t) => t.id === playerUi.currentId);
	if (idx < 0) idx = delta > 0 ? -1 : 0;
	idx = (idx + delta + queue.length) % queue.length;
	await playTrack(queue[idx]);
}

/**
 * Queue a track to play when the current one ends.
 * @param {any} track
 */
export function queuePlayNext(track) {
	if (!track?.id) return;
	playerUi.upNextId = track.id;
}

/** Advance: honor Play Next, else next in browse list. */
export async function playEndedAdvance() {
	const nextId = playerUi.upNextId;
	if (nextId) {
		playerUi.upNextId = null;
		const t = tracks.find((x) => x.id === nextId);
		if (t) {
			await playTrack(t);
			return;
		}
	}
	await playAdjacent(1);
}

export function playerHeading() {
	if (playerBrowse.mode === 'songs') return 'Songs';
	if (playerBrowse.mode === 'recent') return 'Recently Added';
	if (playerBrowse.mode === 'played') return 'Recently Played';
	if (playerBrowse.mode === 'artists' && playerBrowse.artist) return playerBrowse.artist;
	if (playerBrowse.mode === 'artists') return 'Artists';
	if (playerBrowse.mode === 'albums' && playerBrowse.album) return playerBrowse.album;
	if (playerBrowse.mode === 'albums') return 'Albums';
	if (playerBrowse.mode === 'playlist' && playerBrowse.playlistId) {
		return playlists.find((p) => p.id === playerBrowse.playlistId)?.title ?? 'Playlist';
	}
	return 'Player';
}

export function togglePlayPause() {
	if (!boundAudio || playerUi.status !== 'ready') return;
	if (boundAudio.paused) {
		playerUi.wantsPlay = true;
		boundAudio.play().catch(() => {});
	} else {
		playerUi.wantsPlay = false;
		boundAudio.pause();
	}
}

/** Group tracks for library browse. */
export function tracksByArtist() {
	/** @type {Map<string, Map<string, any[]>>} */
	const map = new Map();
	for (const t of tracks) {
		const artist = t.artists?.[0] || 'Unknown';
		const album = t.album || 'Singles';
		if (!map.has(artist)) map.set(artist, new Map());
		const albums = map.get(artist);
		if (!albums.has(album)) albums.set(album, []);
		albums.get(album).push(t);
	}
	return [...map.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([artist, albums]) => ({
			artist,
			albums: [...albums.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([album, items]) => ({ album, tracks: items }))
		}));
}

/** Flat artist names for Artists view. */
export function artistNames() {
	const set = new Set();
	for (const t of tracks) {
		set.add(t.artists?.[0] || 'Unknown');
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Album rows for Albums browse: title + primary artist + cover + track count.
 * @returns {{ album: string, artist: string, count: number, cover_path: string | null, cover_url: string | null, sampleId: string | null }[]}
 */
export function albumRows() {
	/** @type {Map<string, { album: string, artist: string, count: number, cover_path: string | null, cover_url: string | null, sampleId: string | null }>} */
	const map = new Map();
	for (const t of tracks) {
		const album = String(t.album ?? '').trim() || 'Unknown Album';
		const artist =
			String(t.album_artist ?? '').trim() ||
			(Array.isArray(t.artists) && t.artists[0] ? t.artists[0] : 'Unknown');
		const key = album.toLowerCase();
		const cur = map.get(key);
		if (cur) {
			cur.count += 1;
			if (!cur.cover_path && t.cover_path) {
				cur.cover_path = t.cover_path ?? null;
				cur.cover_url = t.cover_url ?? null;
				cur.sampleId = t.id ?? null;
			} else if (cur.cover_path && !cur.cover_url && t.cover_path === cur.cover_path && t.cover_url) {
				cur.cover_url = t.cover_url;
			}
		} else {
			map.set(key, {
				album,
				artist,
				count: 1,
				cover_path: t.cover_path ?? null,
				cover_url: t.cover_url ?? null,
				sampleId: t.id ?? null
			});
		}
	}
	return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
}

/**
 * Album → disc → track no → title (matches Drive list sort).
 * @param {any} a
 * @param {any} b
 */
function compareTracks(a, b) {
	const al = String(a.album ?? '');
	const bl = String(b.album ?? '');
	if (al !== bl) return al.localeCompare(bl);
	const ad = Number(a.disc_no) || 0;
	const bd = Number(b.disc_no) || 0;
	if (ad !== bd) return ad - bd;
	const at = Number(a.track_no) || 0;
	const bt = Number(b.track_no) || 0;
	if (at !== bt) return at - bt;
	return String(a.title).localeCompare(String(b.title));
}

/**
 * Drive add time for Recently Added — created_at only (not updated_at from edits).
 * @param {any} t
 */
function trackAddedMs(t) {
	const raw = t.created_at;
	const ms = raw ? Date.parse(raw) : 0;
	return Number.isFinite(ms) ? ms : 0;
}

/** Tracks visible in the detail column for current browse state. */
export function visibleTracks() {
	if (playerBrowse.mode === 'playlist' && playerBrowse.playlistId) {
		const pl = playlists.find((p) => p.id === playerBrowse.playlistId);
		if (!pl) return [];
		const byId = new Map(tracks.map((t) => [t.id, t]));
		return pl.items
			.filter((it) => it.kind === 'track')
			.map((it) => byId.get(it.id))
			.filter(Boolean);
	}
	if (playerBrowse.mode === 'artists' && playerBrowse.artist) {
		return tracks
			.filter((t) => (t.artists?.[0] || 'Unknown') === playerBrowse.artist)
			.sort(compareTracks);
	}
	if (playerBrowse.mode === 'artists') {
		return [];
	}
	if (playerBrowse.mode === 'albums' && playerBrowse.album) {
		const want = playerBrowse.album;
		return tracks
			.filter((t) => (String(t.album ?? '').trim() || 'Unknown Album') === want)
			.sort(compareTracks);
	}
	if (playerBrowse.mode === 'albums') {
		return [];
	}
	if (playerBrowse.mode === 'recent') {
		return [...tracks].sort((a, b) => trackAddedMs(b) - trackAddedMs(a) || compareTracks(a, b));
	}
	if (playerBrowse.mode === 'played') {
		recentPlayedRev.n; // subscribe
		const session = activeSession();
		if (!session) return [];
		const recent = readRecentlyPlayed(actor.email, session);
		const byId = new Map(tracks.map((t) => [t.id, t]));
		return recent.map((r) => byId.get(r.id)).filter(Boolean);
	}
	return [...tracks].sort(compareTracks);
}
