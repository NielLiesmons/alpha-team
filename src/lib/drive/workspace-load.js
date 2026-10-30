/**
 * One-pass Drive workspace load: tip → root dir → parallel leaf fetch with hash cache.
 * Tip-diff: reuse in-memory docs when path→hash unchanged across refreshes.
 */
import { getPathFromDir, loadRootDirWithTip } from './client.js';
import { getCachedLeaf, mapPool, putCachedLeaf } from './leaf-cache.js';

/**
 * @param {string} path
 * @param {string} [kind]
 */
function classify(path, kind) {
	if (kind === 'project' || path.endsWith('/project.json')) return 'project';
	if (kind === 'task' || path.endsWith('/task.json')) return 'task';
	if (kind === 'note' || path.endsWith('/note.json')) return 'note';
	if (kind === 'moment' || path.endsWith('/moment.json')) return 'moment';
	if (kind === 'ledger' || path.endsWith('/entry.json')) return 'ledger';
	if (kind === 'cost_item' || path.endsWith('/cost_item.json')) return 'cost';
	if (kind === 'sales_line' || path.endsWith('/sales_line.json')) return 'sales';
	if (kind === 'enterprise' || path.endsWith('/enterprise.json')) return 'enterprise';
	if (kind === 'table' || path.endsWith('/table.json')) return 'table';
	if (kind === 'table_row' || path.endsWith('/row.json')) return 'table_row';
	if (kind === 'metric' || path.endsWith('/metric.json')) return 'metric';
	if (kind === 'form' || path.endsWith('/form.json')) return 'form';
	if (kind === 'view' || path.endsWith('/view.json')) return 'view';
	if (kind === 'account' || path.endsWith('/account.json')) return 'account';
	return null;
}

/** @type {Map<string, { tip: string, byPath: Map<string, { hash: string, bucket: string, doc: any }> }>} */
const sessionSnap = new Map();

/**
 * @param {import('./client.js').DriveSession} session
 */
function snapKey(session) {
	return `${session.url}\0${session.rootKey}`;
}

function emptyBuckets() {
	return {
		project: [],
		task: [],
		note: [],
		moment: [],
		ledger: [],
		cost: [],
		sales: [],
		enterprise: [],
		table: [],
		table_row: [],
		metric: [],
		form: [],
		view: [],
		account: []
	};
}

/**
 * @param {import('./client.js').DriveSession} session
 * @param {AbortSignal} [signal]
 * @param {{ onProgress?: (done: number, total: number) => void }} [opts]
 */
export async function loadWorkspaceLeaves(session, signal, opts = {}) {
	const { tip, dir } = await loadRootDirWithTip(session, signal);
	/** @type {Record<string, any[]>} */
	const buckets = emptyBuckets();

	const entries = Object.entries(dir.children ?? {})
		.map(([path, child]) => {
			const bucket = classify(path, child?.kind);
			if (!bucket) return null;
			return { path, hash: child.hash, bucket };
		})
		.filter(Boolean);

	const key = snapKey(session);
	const prev = sessionSnap.get(key);
	/** @type {Map<string, { hash: string, bucket: string, doc: any }>} */
	const nextByPath = new Map();

	const toFetch = [];
	for (const entry of entries) {
		const cached = prev?.byPath.get(entry.path);
		if (cached && cached.hash === entry.hash && cached.doc) {
			const doc = structuredClone(cached.doc);
			doc._drive = { ...(doc._drive || {}), hash: entry.hash, path: entry.path };
			buckets[entry.bucket].push(doc);
			nextByPath.set(entry.path, { hash: entry.hash, bucket: entry.bucket, doc });
		} else {
			toFetch.push(entry);
		}
	}

	const total = entries.length;
	let done = total - toFetch.length;
	opts.onProgress?.(done, Math.max(total, 1));

	await mapPool(toFetch, 32, async (entry) => {
		try {
			let doc = await getCachedLeaf(entry.hash);
			if (!doc) {
				const { bytes } = await getPathFromDir(session, dir, entry.path, signal);
				doc = JSON.parse(new TextDecoder().decode(bytes));
				void putCachedLeaf(entry.hash, doc);
			}
			doc._drive = { ...(doc._drive || {}), hash: entry.hash, path: entry.path };
			buckets[entry.bucket].push(doc);
			nextByPath.set(entry.path, {
				hash: entry.hash,
				bucket: entry.bucket,
				doc: structuredClone(doc)
			});
		} catch {
			/* skip corrupt / missing */
		} finally {
			done += 1;
			opts.onProgress?.(done, Math.max(total, 1));
		}
	});

	sessionSnap.set(key, { tip, byPath: nextByPath });

	for (const bkey of Object.keys(buckets)) {
		buckets[bkey].sort((a, b) =>
			String(a.title || a.key || a.created_at || '').localeCompare(
				String(b.title || b.key || b.created_at || '')
			)
		);
	}
	/* Newest rows first */
	buckets.table_row.sort((a, b) =>
		String(b.created_at || '').localeCompare(String(a.created_at || ''))
	);

	return { tip, buckets };
}
