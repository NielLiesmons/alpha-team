/**
 * Player library + now-playing state (Drive-backed when connected).
 */

import { listPlaylists, listTracks, uploadTrack } from './drive/entities.js';
import {
	getMediaBlob,
	loadMediaManifest,
	mseMimeForContentType,
	streamMediaChunks
} from './drive/media.js';
import { activeSession, driveSession } from './drive/session.svelte.js';

/** @type {any[]} */
export const tracks = $state([]);
/** @type {any[]} */
export const playlists = $state([]);

/** Browse selection for list column → detail column. */
export const playerBrowse = $state({
	/** @type {'songs' | 'artists' | 'playlist'} */
	mode: 'songs',
	/** @type {string | null} */
	playlistId: null,
	/** @type {string | null} artist name when drilling in from Artists */
	artist: null,
	/** Mobile: slide detail over the browse list. Desktop always shows detail. */
	detailOpen: false
});

export const playerUi = $state({
	/** @type {'idle' | 'loading' | 'ready' | 'error'} */
	status: 'idle',
	/** @type {string | null} */
	currentId: null,
	/** @type {string | null} object URL for <audio> */
	objectUrl: null,
	/** 0..1 download buffer (drives scrubber buffer lane — never shown as text) */
	bufferRatio: 0,
	error: '',
	uploading: false,
	uploadLabel: ''
});

/** Bumps on every play/stop so stale fetches never win. */
let playGeneration = 0;
/** @type {AbortController | null} */
let playAbort = null;
/** @type {HTMLAudioElement | null} */
let boundAudio = null;
/** @type {MediaSource | null} */
let activeMediaSource = null;

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
}

function cancelInFlightPlay() {
	playGeneration += 1;
	if (playAbort) {
		playAbort.abort();
		playAbort = null;
	}
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
	driveSession.loading = true;
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
 * @param {'songs' | 'artists' | 'playlist'} mode
 * @param {{ playlistId?: string | null, artist?: string | null }} [opts]
 */
export function setPlayerBrowse(mode, opts = {}) {
	playerBrowse.mode = mode;
	playerBrowse.playlistId = opts.playlistId ?? null;
	playerBrowse.artist = opts.artist ?? null;
	playerBrowse.detailOpen = true;
}

export function closePlayerDetail() {
	playerBrowse.detailOpen = false;
}

/**
 * @param {FileList | File[]} files
 */
export async function uploadAudioFiles(files) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	const list = [...files];
	if (!list.length) return;
	playerUi.uploading = true;
	playerUi.error = '';
	try {
		for (let i = 0; i < list.length; i++) {
			const file = list[i];
			playerUi.uploadLabel = `Uploading ${i + 1}/${list.length}…`;
			await uploadTrack(session, file, {
				onProgress: (phase, done, total) => {
					if (phase === 'upload' && total > 0) {
						const pct = Math.min(100, Math.round((done / total) * 100));
						playerUi.uploadLabel = `Uploading ${i + 1}/${list.length} — ${pct}%`;
					}
				}
			});
		}
		await refreshTracks();
	} finally {
		playerUi.uploading = false;
		playerUi.uploadLabel = '';
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
 * Play via MediaSource — audio starts after the first chunk lands.
 * @param {import('./drive/client.js').DriveSession} session
 * @param {any} track
 * @param {string} mime
 * @param {number} generation
 * @param {AbortSignal} signal
 */
async function playViaMse(session, track, mime, generation, signal) {
	const ms = new MediaSource();
	activeMediaSource = ms;
	const url = URL.createObjectURL(ms);
	playerUi.objectUrl = url;

	await new Promise((resolve, reject) => {
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
		const cleanup = () => {
			ms.removeEventListener('sourceopen', onOpen);
			signal.removeEventListener('abort', onAbort);
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		ms.addEventListener('sourceopen', onOpen, { once: true });
		signal.addEventListener('abort', onAbort);
	});

	if (generation !== playGeneration) return null;
	const sb = ms.addSourceBuffer(mime);
	try {
		sb.mode = 'sequence';
	} catch {
		/* some browsers reject mode after first append */
	}

	let started = false;
	await streamMediaChunks(session, track.media_path, {
		signal,
		onProgress: (done, total) => {
			if (generation !== playGeneration) return;
			playerUi.bufferRatio = total > 0 ? done / total : 0;
		},
		onChunk: async (_i, bytes) => {
			if (generation !== playGeneration) return;
			await appendBuffer(sb, bytes, signal);
			if (!started && generation === playGeneration) {
				started = true;
				playerUi.status = 'ready';
				boundAudio?.play().catch(() => {});
			}
		}
	});

	if (generation !== playGeneration) return null;
	if (ms.readyState === 'open') {
		try {
			ms.endOfStream();
		} catch {
			/* ignore */
		}
	}
	playerUi.bufferRatio = 1;
	if (!started) {
		playerUi.status = 'ready';
		boundAudio?.play().catch(() => {});
	}
	return url;
}

/**
 * Fallback: assemble then play (M4A / unsupported MSE). Silent buffer only.
 * @param {import('./drive/client.js').DriveSession} session
 * @param {any} track
 * @param {number} generation
 * @param {AbortSignal} signal
 */
async function playViaBlob(session, track, generation, signal) {
	const { manifest, bytes } = await getMediaBlob(session, track.media_path, {
		signal,
		onProgress: (done, total) => {
			if (generation !== playGeneration) return;
			playerUi.bufferRatio = total > 0 ? done / total : 0;
		}
	});
	if (generation !== playGeneration) return null;
	const blob = new Blob([bytes], { type: manifest.content_type || 'audio/mpeg' });
	playerUi.objectUrl = URL.createObjectURL(blob);
	playerUi.status = 'ready';
	playerUi.bufferRatio = 1;
	boundAudio?.play().catch(() => {});
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
	const generation = playGeneration;
	const ac = new AbortController();
	playAbort = ac;

	revokeUrl();
	playerUi.currentId = track.id;
	playerUi.status = 'loading';
	playerUi.bufferRatio = 0;
	playerUi.error = '';

	try {
		const { manifest } = await loadMediaManifest(session, track.media_path, ac.signal);
		if (generation !== playGeneration) return null;

		const mime = mseMimeForContentType(manifest.content_type || 'audio/mpeg');
		let url;
		if (mime) {
			url = await playViaMse(session, track, mime, generation, ac.signal);
		} else {
			url = await playViaBlob(session, track, generation, ac.signal);
		}
		if (generation === playGeneration) playAbort = null;
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
	revokeUrl();
	playerUi.currentId = null;
	playerUi.status = 'idle';
	playerUi.bufferRatio = 0;
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
		return tracks.filter((t) => (t.artists?.[0] || 'Unknown') === playerBrowse.artist);
	}
	if (playerBrowse.mode === 'artists') {
		return [];
	}
	return [...tracks].sort((a, b) => String(a.title).localeCompare(String(b.title)));
}
