/**
 * Public list mail — welcome template + newsletter campaigns (alpha-api / Resend).
 * Lives under Publications in Admin; Mail tab is the human inbox/outbox.
 */

import {
	createCampaign,
	fetchCampaigns,
	fetchMailSettings,
	saveMailSettings,
	sendCampaign
} from './mail-api.js';

/** @type {any[]} */
export const campaigns = $state([]);

/** @type {{
 *   from: string,
 *   welcome: {
 *     enabled: boolean,
 *     subject_fr: string,
 *     subject_en: string,
 *     body_fr: string,
 *     body_en: string
 *   }
 * }} */
export const mailSettings = $state({
	from: '',
	welcome: {
		enabled: false,
		subject_fr: '',
		subject_en: '',
		body_fr: '',
		body_en: ''
	}
});

export const pubsUi = $state({
	loading: false,
	error: '',
	/** @type {string | null} */
	loadedAt: null
});

export async function refreshPublications() {
	pubsUi.loading = true;
	pubsUi.error = '';
	try {
		const [settings, list] = await Promise.all([fetchMailSettings(), fetchCampaigns()]);
		mailSettings.from = settings.from || '';
		mailSettings.welcome = {
			enabled: Boolean(settings.welcome?.enabled),
			subject_fr: settings.welcome?.subject_fr || '',
			subject_en: settings.welcome?.subject_en || '',
			body_fr: settings.welcome?.body_fr || '',
			body_en: settings.welcome?.body_en || ''
		};
		campaigns.splice(0, campaigns.length, ...(list.items || []));
		pubsUi.loadedAt = new Date().toISOString();
	} catch (e) {
		pubsUi.error = e instanceof Error ? e.message : String(e);
	} finally {
		pubsUi.loading = false;
	}
}

/**
 * @param {{ from?: string, welcome?: object }} patch
 */
export async function persistMailSettings(patch) {
	const saved = await saveMailSettings(patch);
	mailSettings.from = saved.from || '';
	mailSettings.welcome = {
		enabled: Boolean(saved.welcome?.enabled),
		subject_fr: saved.welcome?.subject_fr || '',
		subject_en: saved.welcome?.subject_en || '',
		body_fr: saved.welcome?.body_fr || '',
		body_en: saved.welcome?.body_en || ''
	};
	return saved;
}

/**
 * @param {{ subject: string, body: string }} input
 */
export async function persistCampaign(input) {
	const c = await createCampaign(input);
	campaigns.splice(0, 0, c);
	return c;
}

/**
 * @param {string} id
 */
export async function persistSendCampaign(id) {
	const c = await sendCampaign(id);
	const idx = campaigns.findIndex((x) => x.id === id);
	if (idx >= 0) campaigns[idx] = c;
	else campaigns.splice(0, 0, c);
	return c;
}
