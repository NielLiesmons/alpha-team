/**
 * Player library + now-playing state (Drive-backed when connected).
 */

import { getMediaBlob } from './drive/media.js';
import { listTracks, uploadTrack } from './drive/entities.js';
import { activeSession, driveSession } from './drive/session.svelte.js';

/** @type {any[]} */
export const tracks = $state([]);

export const playerUi = $state({
	/** @type {'idle' | 'loading' | 'ready' | 'error'} */
	status: 'idle',
	/** @type {string | null} */
	currentId: null,
	/** @type {string | null} object URL for <audio> */
	objectUrl: null,
	/** buffering label */
	progress: '',
	error: '',
	uploading: false,
	uploadLabel: ''
});

function revokeUrl() {
	if (playerUi.objectUrl) {
		URL.revokeObjectURL(playerUi.objectUrl);
		playerUi.objectUrl = null;
	}
}

/**
 * @param {any[]} list
 */
function replaceTracks(list) {
	tracks.splice(0, tracks.length, ...list);
}

export async function refreshTracks() {
	const session = activeSession();
	if (!session) {
		replaceTracks([]);
		playerUi.status = 'idle';
		return;
	}
	driveSession.loading = true;
	try {
		const list = await listTracks(session);
		replaceTracks(list);
	} catch (e) {
		playerUi.error = e instanceof Error ? e.message : String(e);
	} finally {
		driveSession.loading = false;
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
	playerUi.uploading = true;
	playerUi.error = '';
	try {
		for (let i = 0; i < list.length; i++) {
			const file = list[i];
			playerUi.uploadLabel = `Uploading ${i + 1}/${list.length}: ${file.name}`;
			await uploadTrack(session, file, {
				onProgress: (phase, done, total) => {
					if (phase === 'upload' && total > 0) {
						playerUi.uploadLabel = `${file.name} — chunk ${done}/${total}`;
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
 * Fetch chunked media from Drive and prepare an object URL for <audio>.
 * @param {any} track
 */
export async function playTrack(track) {
	const session = activeSession();
	if (!session) throw new Error('Connect Drive in Settings first');
	if (!track?.media_path) throw new Error('Track has no media_path');

	revokeUrl();
	playerUi.currentId = track.id;
	playerUi.status = 'loading';
	playerUi.progress = 'Loading…';
	playerUi.error = '';

	try {
		const { manifest, bytes } = await getMediaBlob(session, track.media_path, {
			onProgress: (done, total) => {
				playerUi.progress = `Streaming ${done}/${total} chunks`;
			}
		});
		const blob = new Blob([bytes], { type: manifest.content_type || 'audio/mpeg' });
		playerUi.objectUrl = URL.createObjectURL(blob);
		playerUi.status = 'ready';
		playerUi.progress = '';
		return playerUi.objectUrl;
	} catch (e) {
		playerUi.status = 'error';
		playerUi.error = e instanceof Error ? e.message : String(e);
		playerUi.progress = '';
		throw e;
	}
}

export function stopPlayback() {
	revokeUrl();
	playerUi.currentId = null;
	playerUi.status = 'idle';
	playerUi.progress = '';
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
