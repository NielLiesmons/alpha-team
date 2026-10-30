/**
 * Persist last successfully applied Drive tip so refreshes can no-op when unchanged.
 */

const LS_KEY = 'alpha.drive.lastTip.v1';

/** @type {Map<string, string>} */
const mem = new Map();

/**
 * @param {{ url: string, token: string, rootKey: string }} session
 */
export function tipGateKey(session) {
	return `${session.url}|${(session.token || '').slice(0, 12)}`;
}

/**
 * @param {{ url: string, token: string, rootKey: string }} session
 * @returns {string}
 */
export function getLastAppliedTip(session) {
	const k = tipGateKey(session);
	if (mem.has(k)) return mem.get(k) || '';
	try {
		if (typeof localStorage === 'undefined') return '';
		const raw = localStorage.getItem(LS_KEY);
		const map = raw ? JSON.parse(raw) : {};
		const tip = typeof map[k] === 'string' ? map[k] : '';
		if (tip) mem.set(k, tip);
		return tip;
	} catch {
		return '';
	}
}

/**
 * @param {{ url: string, token: string, rootKey: string }} session
 * @param {string} tip
 */
export function setLastAppliedTip(session, tip) {
	if (!tip) return;
	const k = tipGateKey(session);
	mem.set(k, tip);
	try {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(LS_KEY);
		const map = raw ? JSON.parse(raw) : {};
		map[k] = tip;
		localStorage.setItem(LS_KEY, JSON.stringify(map));
	} catch {
		/* quota */
	}
}

/**
 * After a local write that advanced the tip — mark applied so we don't re-crawl.
 * @param {{ url: string, token: string, rootKey: string }} session
 * @param {string} tip
 */
export function markTipApplied(session, tip) {
	setLastAppliedTip(session, tip);
}
