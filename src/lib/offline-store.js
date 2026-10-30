/**
 * Persistent device storage for offline media (music, pics).
 * OPFS for large blobs; navigator.storage.persist() to survive eviction.
 */

/**
 * Ask the browser to keep this origin’s storage (Home Screen PWAs usually granted).
 * @returns {Promise<boolean>}
 */
export async function ensurePersistentStorage() {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
	try {
		const already = await navigator.storage.persisted?.();
		if (already) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

/**
 * @returns {Promise<{ usage: number, quota: number, persisted: boolean }>}
 */
export async function storageEstimate() {
	const empty = { usage: 0, quota: 0, persisted: false };
	if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return empty;
	try {
		const est = await navigator.storage.estimate();
		const persisted = (await navigator.storage.persisted?.()) ?? false;
		return {
			usage: Number(est.usage) || 0,
			quota: Number(est.quota) || 0,
			persisted: Boolean(persisted)
		};
	} catch {
		return empty;
	}
}

/** @param {number} bytes */
export function formatBytes(bytes) {
	const n = Number(bytes) || 0;
	if (n < 1024) return `${n} B`;
	if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
	return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Origin Private File System root (large offline blobs).
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function opfsRoot() {
	if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
	try {
		return await navigator.storage.getDirectory();
	} catch {
		return null;
	}
}

/**
 * Ensure a nested directory under OPFS (e.g. offline/music/albumId).
 * @param {string[]} parts
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function opfsDir(parts) {
	let dir = await opfsRoot();
	if (!dir) return null;
	for (const part of parts) {
		const name = String(part || '').replace(/[/\\]/g, '_');
		if (!name) continue;
		dir = await dir.getDirectoryHandle(name, { create: true });
	}
	return dir;
}

/**
 * Write bytes into OPFS at path parts + fileName.
 * @param {string[]} dirParts
 * @param {string} fileName
 * @param {BufferSource | Blob} data
 */
export async function opfsWrite(dirParts, fileName, data) {
	const dir = await opfsDir(dirParts);
	if (!dir) throw new Error('OPFS not available on this device');
	const safe = String(fileName || 'blob').replace(/[/\\]/g, '_');
	const handle = await dir.getFileHandle(safe, { create: true });
	const writable = await handle.createWritable();
	try {
		await writable.write(data);
	} finally {
		await writable.close();
	}
	return true;
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 * @returns {Promise<File | null>}
 */
export async function opfsReadFile(dirParts, fileName) {
	try {
		const dir = await opfsDir(dirParts);
		if (!dir) return null;
		const safe = String(fileName || 'blob').replace(/[/\\]/g, '_');
		const handle = await dir.getFileHandle(safe);
		return await handle.getFile();
	} catch {
		return null;
	}
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 */
export async function opfsRemove(dirParts, fileName) {
	try {
		const dir = await opfsDir(dirParts);
		if (!dir) return false;
		const safe = String(fileName || 'blob').replace(/[/\\]/g, '_');
		await dir.removeEntry(safe);
		return true;
	} catch {
		return false;
	}
}
