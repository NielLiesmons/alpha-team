/**
 * PWA install / display-mode helpers (iOS Home Screen + Android install prompt).
 */

import { ensurePersistentStorage, formatBytes, storageEstimate } from './offline-store.js';
import {
	disablePushNotifications,
	enablePushNotifications,
	isPushSubscribed,
	notificationPermission,
	pushApiAvailable
} from './push.js';

/** @type {{
 *   standalone: boolean,
 *   ios: boolean,
 *   android: boolean,
 *   canInstall: boolean,
 *   pushSupported: boolean,
 *   pushPermission: string,
 *   pushSubscribed: boolean,
 *   storageLabel: string,
 *   storagePersisted: boolean,
 *   busy: boolean,
 *   message: string
 * }} */
export const pwaUi = $state({
	standalone: false,
	ios: false,
	android: false,
	canInstall: false,
	pushSupported: false,
	pushPermission: 'unsupported',
	pushSubscribed: false,
	storageLabel: '',
	storagePersisted: false,
	busy: false,
	message: ''
});

/** @type {null | (Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: string }> })} */
let deferredInstall = null;

function detect() {
	if (typeof window === 'undefined') return;
	const ua = navigator.userAgent || '';
	pwaUi.ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	pwaUi.android = /Android/i.test(ua);
	pwaUi.standalone =
		window.matchMedia('(display-mode: standalone)').matches ||
		/** @type {any} */ (navigator).standalone === true;
	pwaUi.pushSupported = pushApiAvailable();
	pwaUi.pushPermission = notificationPermission();
}

/**
 * Call once from root layout after mount.
 */
export function initPwa() {
	detect();
	void refreshPwaStatus();

	if (typeof window === 'undefined') return () => {};

	const onBip = (e) => {
		e.preventDefault();
		deferredInstall = e;
		pwaUi.canInstall = true;
	};
	window.addEventListener('beforeinstallprompt', onBip);

	const mq = window.matchMedia('(display-mode: standalone)');
	const onMq = () => {
		detect();
	};
	mq.addEventListener?.('change', onMq);

	void ensurePersistentStorage().then((ok) => {
		pwaUi.storagePersisted = ok;
	});

	return () => {
		window.removeEventListener('beforeinstallprompt', onBip);
		mq.removeEventListener?.('change', onMq);
	};
}

export async function refreshPwaStatus() {
	detect();
	try {
		pwaUi.pushSubscribed = await isPushSubscribed();
	} catch {
		pwaUi.pushSubscribed = false;
	}
	try {
		const est = await storageEstimate();
		pwaUi.storagePersisted = est.persisted;
		if (est.quota > 0) {
			pwaUi.storageLabel = `${formatBytes(est.usage)} used of ${formatBytes(est.quota)}`;
		} else {
			pwaUi.storageLabel = '';
		}
	} catch {
		pwaUi.storageLabel = '';
	}
}

/** Android/desktop Chrome install prompt when available. */
export async function promptInstall() {
	if (!deferredInstall) {
		pwaUi.message = pwaUi.ios
			? 'On iPhone: tap Share → Add to Home Screen, then open Alpha from the new icon.'
			: 'Use your browser’s Install / Add to Home Screen menu.';
		return false;
	}
	deferredInstall.prompt();
	const choice = await deferredInstall.userChoice;
	deferredInstall = null;
	pwaUi.canInstall = false;
	pwaUi.message = choice.outcome === 'accepted' ? 'Installed.' : 'Install dismissed.';
	detect();
	return choice.outcome === 'accepted';
}

/**
 * @param {string} email
 */
export async function togglePush(email) {
	pwaUi.busy = true;
	pwaUi.message = '';
	try {
		if (pwaUi.pushSubscribed) {
			await disablePushNotifications();
			pwaUi.message = 'Notifications off on this device.';
		} else {
			if (pwaUi.ios && !pwaUi.standalone) {
				throw new Error(
					'On iPhone, add Alpha to the Home Screen first, then open it from the icon and enable notifications.'
				);
			}
			await enablePushNotifications(email);
			pwaUi.message = 'Notifications on — you’ll get chat alerts even when Alpha is closed.';
		}
		await refreshPwaStatus();
	} catch (e) {
		pwaUi.message = e instanceof Error ? e.message : String(e);
		await refreshPwaStatus();
		throw e;
	} finally {
		pwaUi.busy = false;
	}
}

/** Show install coaching when not yet a Home Screen app (esp. iOS). */
export function shouldShowInstallCoach() {
	if (typeof window === 'undefined') return false;
	detect();
	if (pwaUi.standalone) return false;
	try {
		if (sessionStorage.getItem('alpha-pwa-coach-dismissed') === '1') return false;
	} catch {
		/* ignore */
	}
	return pwaUi.ios || pwaUi.android || pwaUi.canInstall;
}

export function dismissInstallCoach() {
	try {
		sessionStorage.setItem('alpha-pwa-coach-dismissed', '1');
	} catch {
		/* ignore */
	}
}
