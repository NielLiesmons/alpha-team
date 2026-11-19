/**
 * Public list mail — welcome template + newsletter campaigns (alpha-api / Resend).
 * Lives under Publications in Admin; Mail tab is the human inbox/outbox.
 */

import {
	addAudienceMember,
	approveComment,
	banComment,
	createAudience,
	createCampaign,
	deleteAudience,
	deleteCampaign,
	deletePost,
	fetchAudienceMembers,
	fetchAudiences,
	fetchCampaigns,
	fetchMailSettings,
	fetchModerationComments,
	fetchPost,
	fetchPosts,
	importAudienceCsv,
	patchAudience,
	patchCampaign,
	rejectComment,
	saveMailSettings,
	scheduleCampaign,
	sendCampaign,
	updatePost
} from './mail-api.js';
import { space } from './sections.js';

/** @type {any[]} */
export const campaigns = $state([]);

/** @type {any[]} */
export const audiences = $state([]);

/** @type {any[]} */
export const publicPosts = $state([]);

/** Site mail branding defaults — match alpha-api `MailBranding::default`. */
export const defaultMailBranding = {
	font_display: "'Ovo', Georgia, 'Times New Roman', serif",
	font_body: 'Inter, Helvetica, Arial, sans-serif',
	font_css_url: 'https://fonts.bunny.net/css?family=inter:400,500,600,700|ovo:400&display=swap',
	accent: '#dd8f87',
	page_bg: '#f7f3f1',
	ink: '#160b0f',
	logo_url: '',
	eyebrow_fr: 'Lettre',
	eyebrow_en: 'Letter',
	read_cta_fr: 'Open Online',
	read_cta_en: 'Open Online'
};

/** @type {{
 *   from: string,
 *   brand_name: string,
 *   footer_html: string,
 *   branding: typeof defaultMailBranding,
 *   welcome: {
 *     enabled: boolean,
 *     subject_fr: string,
 *     subject_en: string,
 *     body_fr: string,
 *     body_en: string
 *   },
 *   publishers: { email: string, name: string }[],
 *   default_audience_id: string
 * }} */
export const mailSettings = $state({
	from: '',
	brand_name: 'Space',
	footer_html: '',
	branding: { ...defaultMailBranding },
	welcome: {
		enabled: false,
		subject_fr: '',
		subject_en: '',
		body_fr: '',
		body_en: ''
	},
	publishers: [],
	default_audience_id: 'subscribers'
});

/**
 * @param {any} raw
 */
function applyMailSettings(raw) {
	mailSettings.from = raw?.from || '';
	mailSettings.brand_name = raw?.brand_name || 'Space';
	mailSettings.footer_html = raw?.footer_html || '';
	mailSettings.branding = {
		...defaultMailBranding,
		...(raw?.branding && typeof raw.branding === 'object' ? raw.branding : {})
	};
	mailSettings.welcome = {
		enabled: Boolean(raw?.welcome?.enabled),
		subject_fr: raw?.welcome?.subject_fr || '',
		subject_en: raw?.welcome?.subject_en || '',
		body_fr: raw?.welcome?.body_fr || '',
		body_en: raw?.welcome?.body_en || ''
	};
	mailSettings.publishers = Array.isArray(raw?.publishers)
		? raw.publishers.map((p) => ({
				email: String(p?.email || '').trim().toLowerCase(),
				name: String(p?.name || '').trim()
			})).filter((p) => p.email)
		: [];
	mailSettings.default_audience_id = String(raw?.default_audience_id || 'subscribers');
}

export const pubsUi = $state({
	loading: false,
	error: '',
	/** @type {string | null} */
	loadedAt: null
});

/** @type {any[]} */
export const pendingComments = $state([]);

/** Recent comments for reactive moderation (approved / pending / rejected). */
/** @type {any[]} */
export const moderationComments = $state([]);

/**
 * Unified feed row for hub + /publications list.
 * @typedef {{
 *   key: string,
 *   id: string,
 *   title: string,
 *   bucket: string,
 *   status?: string,
 *   when?: string | number,
 *   preview?: string,
 *   source: 'campaign' | 'post',
 *   campaignId?: string,
 *   slug?: string,
 *   siteUrl?: string,
 *   updatedAt?: string
 * }} PubsFeedItem
 */

/** @returns {PubsFeedItem[]} */
export function buildPubsFeed() {
	/** @type {PubsFeedItem[]} */
	const out = [];
	/** @type {Set<string>} */
	const claimedSlugs = new Set();
	const base = String(space.siteUrl || '').replace(/\/$/, '');

	for (const c of campaigns) {
		const slug = c.post_slug ? String(c.post_slug) : '';
		if (slug) claimedSlugs.add(slug);
		out.push({
			key: `c:${c.id}`,
			id: c.id,
			title: c.subject || 'Untitled',
			bucket: 'blog',
			status: c.status,
			when: c.sent_at || c.updated_at || c.created_at,
			preview: String(c.body || '')
				.replace(/<[^>]+>/g, '')
				.slice(0, 140),
			source: 'campaign',
			campaignId: c.id,
			slug: slug || undefined,
			siteUrl: slug && base ? `${base}/fr/publications/${slug}` : undefined
		});
	}

	for (const p of publicPosts) {
		const slug = String(p.slug || '');
		if (slug && claimedSlugs.has(slug)) continue;
		const kind = String(p.kind || 'post');
		const bucket =
			kind === 'letter' || kind === 'blog' ? 'blog' : kind === 'event' ? 'event' : 'post';
		out.push({
			key: `p:${p.id || slug}`,
			id: String(p.id || slug),
			title: p.title || slug || 'Untitled',
			bucket,
			status: 'published',
			when: p.updated_at || p.published_at,
			preview: p.summary || '',
			source: 'post',
			slug: slug || undefined,
			siteUrl: slug && base ? `${base}/fr/publications/${slug}` : undefined,
			updatedAt: p.updated_at ? String(p.updated_at) : undefined
		});
	}

	out.sort((a, b) => {
		const ta = a.when ? Date.parse(String(a.when)) : 0;
		const tb = b.when ? Date.parse(String(b.when)) : 0;
		return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
	});
	return out;
}

export async function refreshPublications() {
	pubsUi.loading = true;
	pubsUi.error = '';
	try {
		const postsP = fetchPosts().catch(() => ({ items: [] }));
		const modP = fetchModerationComments().catch(() => ({ items: [] }));
		const audP = fetchAudiences().catch(() => ({ items: [] }));
		const [settings, list, posts, mod, aud] = await Promise.all([
			fetchMailSettings(),
			fetchCampaigns(),
			postsP,
			modP,
			audP
		]);
		applyMailSettings(settings);
		campaigns.splice(0, campaigns.length, ...(list.items || []));
		publicPosts.splice(0, publicPosts.length, ...(posts.items || []));
		moderationComments.splice(0, moderationComments.length, ...(mod.items || []));
		pendingComments.splice(
			0,
			pendingComments.length,
			...(mod.items || []).filter((c) => c.status === 'pending')
		);
		audiences.splice(0, audiences.length, ...(aud.items || []));
		pubsUi.loadedAt = new Date().toISOString();
	} catch (e) {
		pubsUi.error = e instanceof Error ? e.message : String(e);
	} finally {
		pubsUi.loading = false;
	}
}

export async function refreshAudiences() {
	try {
		const aud = await fetchAudiences();
		audiences.splice(0, audiences.length, ...(aud.items || []));
	} catch (e) {
		pubsUi.error = e instanceof Error ? e.message : String(e);
	}
}

/**
 * @param {{ title: string, description?: string }} input
 */
export async function persistCreateAudience(input) {
	const a = await createAudience(input);
	audiences.push(a);
	audiences.sort((x, y) => Number(y.is_default) - Number(x.is_default));
	return a;
}

/**
 * @param {string} id
 * @param {{ title?: string, description?: string }} patch
 */
export async function persistPatchAudience(id, patch) {
	const a = await patchAudience(id, patch);
	const idx = audiences.findIndex((x) => x.id === id);
	if (idx >= 0) audiences[idx] = a;
	return a;
}

/** @param {string} id */
export async function persistDeleteAudience(id) {
	await deleteAudience(id);
	const idx = audiences.findIndex((x) => x.id === id);
	if (idx >= 0) audiences.splice(idx, 1);
}

/**
 * @param {string} id
 * @param {{ all?: boolean }} [opts]
 */
export async function loadAudienceMembers(id, opts = {}) {
	const res = await fetchAudienceMembers(id, opts);
	return res.items || [];
}

/**
 * @param {string} id
 * @param {{ email: string, name?: string }} input
 */
export async function persistAddAudienceMember(id, input) {
	const sub = await addAudienceMember(id, input);
	await refreshAudiences();
	return sub;
}

/**
 * @param {string} id
 * @param {string} csv
 */
export async function persistImportAudienceCsv(id, csv) {
	const result = await importAudienceCsv(id, csv);
	await refreshAudiences();
	return result;
}

/** @param {string} id */
export async function persistApproveComment(id) {
	const c = await approveComment(id);
	const idx = moderationComments.findIndex((x) => x.id === id);
	if (idx >= 0) moderationComments[idx] = { ...moderationComments[idx], ...c, status: 'approved' };
	const pidx = pendingComments.findIndex((x) => x.id === id);
	if (pidx >= 0) pendingComments.splice(pidx, 1);
}

/** @param {string} id */
export async function persistRejectComment(id) {
	const c = await rejectComment(id);
	const idx = moderationComments.findIndex((x) => x.id === id);
	if (idx >= 0) moderationComments[idx] = { ...moderationComments[idx], ...c, status: 'rejected' };
	const pidx = pendingComments.findIndex((x) => x.id === id);
	if (pidx >= 0) pendingComments.splice(pidx, 1);
}

/** @param {string} id */
export async function persistBanComment(id) {
	const c = await banComment(id);
	const idx = moderationComments.findIndex((x) => x.id === id);
	if (idx >= 0) {
		moderationComments[idx] = {
			...moderationComments[idx],
			...c,
			status: 'rejected',
			commenter_banned: true
		};
	}
	const pidx = pendingComments.findIndex((x) => x.id === id);
	if (pidx >= 0) pendingComments.splice(pidx, 1);
}

/**
 * @param {{
 *   from?: string,
 *   brand_name?: string,
 *   footer_html?: string,
 *   branding?: object,
 *   welcome?: object,
 *   publishers?: { email: string, name?: string }[],
 *   default_audience_id?: string
 * }} patch
 */
export async function persistMailSettings(patch) {
	const saved = await saveMailSettings(patch);
	applyMailSettings(saved);
	return saved;
}

/**
 * @param {{
 *   subject: string,
 *   body: string,
 *   description?: string,
 *   image_url?: string,
 *   publisher_email?: string,
 *   publisher_name?: string,
 *   audience_id?: string
 * }} input
 */
export async function persistCampaign(input) {
	const c = await createCampaign(input);
	campaigns.splice(0, 0, c);
	return c;
}

/**
 * @param {string} id
 * @param {{
 *   subject?: string,
 *   body?: string,
 *   description?: string,
 *   image_url?: string,
 *   publisher_email?: string,
 *   publisher_name?: string,
 *   scheduled_at?: string | null
 * }} patch
 */
export async function persistUpdateCampaign(id, patch) {
	const c = await patchCampaign(id, patch);
	const idx = campaigns.findIndex((x) => x.id === id);
	if (idx >= 0) campaigns[idx] = c;
	else campaigns.splice(0, 0, c);
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
	/* Refresh public posts — send writes a site post. */
	try {
		const posts = await fetchPosts();
		publicPosts.splice(0, publicPosts.length, ...(posts.items || []));
	} catch {
		/* ignore */
	}
	return c;
}

/**
 * @param {string} id
 * @param {string} scheduledAt ISO datetime
 */
export async function persistScheduleCampaign(id, scheduledAt) {
	const c = await scheduleCampaign(id, scheduledAt);
	const idx = campaigns.findIndex((x) => x.id === id);
	if (idx >= 0) campaigns[idx] = c;
	else campaigns.splice(0, 0, c);
	return c;
}

/**
 * Update the public website post (no subscriber re-mail).
 * @param {string} idOrSlug
 * @param {{ title?: string, summary?: string, body_html?: string, body_markdown?: string, kind?: string }} patch
 */
export async function persistUpdatePost(idOrSlug, patch) {
	const detail = await updatePost(idOrSlug, patch);
	const meta = detail?.meta ?? detail;
	const slug = String(meta?.slug || idOrSlug);
	const idx = publicPosts.findIndex((p) => p.slug === slug || p.id === meta?.id);
	const row = {
		id: meta?.id || slug,
		slug,
		title: meta?.title || '',
		summary: meta?.summary || '',
		published_at: meta?.published_at,
		updated_at: meta?.updated_at,
		kind: meta?.kind || 'blog'
	};
	if (idx >= 0) publicPosts[idx] = { ...publicPosts[idx], ...row };
	else publicPosts.splice(0, 0, row);
	return detail;
}

/**
 * Delete a public site post (blog / post / event).
 * @param {string} idOrSlug
 */
export async function persistDeletePost(idOrSlug) {
	await deletePost(idOrSlug);
	const key = String(idOrSlug);
	for (let i = publicPosts.length - 1; i >= 0; i--) {
		const p = publicPosts[i];
		if (p.slug === key || p.id === key) publicPosts.splice(i, 1);
	}
	/* Clear linked campaign post_slug locally */
	for (const c of campaigns) {
		if (c.post_slug === key) c.post_slug = null;
	}
}

/**
 * Delete a campaign and (by default) its linked public post.
 * @param {string} id
 * @param {{ deletePost?: boolean }} [opts]
 */
export async function persistDeleteCampaign(id, opts = {}) {
	const c = campaigns.find((x) => x.id === id);
	const slug = c?.post_slug ? String(c.post_slug) : '';
	await deleteCampaign(id, opts);
	const idx = campaigns.findIndex((x) => x.id === id);
	if (idx >= 0) campaigns.splice(idx, 1);
	if (opts.deletePost !== false && slug) {
		for (let i = publicPosts.length - 1; i >= 0; i--) {
			if (publicPosts[i].slug === slug) publicPosts.splice(i, 1);
		}
	}
}

/** Load full post detail for the editor. */
export async function loadPostDetail(idOrSlug) {
	return fetchPost(idOrSlug);
}
