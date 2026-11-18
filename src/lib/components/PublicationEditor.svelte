<script>
	/**
	 * Third-column letter / site-post editor with fixed publish dock.
	 */
	import { tick } from 'svelte';
	import MailHeroEditor from './MailHeroEditor.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import FloatPanel from './FloatPanel.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import PublicationFooterEdit from './PublicationFooterEdit.svelte';
	import {
		campaigns,
		loadPostDetail,
		mailSettings,
		persistCampaign,
		persistScheduleCampaign,
		persistSendCampaign,
		persistUpdateCampaign,
		persistUpdatePost,
		publicPosts
	} from '$lib/publications.svelte.js';
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { members } from '$lib/members.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { space } from '$lib/sections.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';

	/** @type {{ campaignId?: string | null, postSlug?: string | null }} */
	let { campaignId = null, postSlug = null } = $props();

	let subject = $state('');
	let description = $state('');
	let body = $state('');
	/** @type {string | null} */
	let imageUrl = $state(null);
	let publisherEmail = $state('');
	let publisherName = $state('');
	let busy = $state(false);
	let saveState = $state(/** @type {'idle' | 'saving' | 'saved' | 'scheduled' | 'published'} */ ('idle'));
	let err = $state('');
	let footerOpen = $state(false);
	let scheduleOpen = $state(false);
	let scheduleLocal = $state('');
	/** @type {HTMLButtonElement | null} */
	let scheduleBtn = $state(null);
	let publisherOpen = $state(false);
	/** @type {import('@tiptap/core').Editor | null} */
	let tipTap = $state(null);
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let saveTimer = null;

	const editingCampaign = $derived(
		campaignId ? campaigns.find((c) => c.id === campaignId) : null
	);

	const editingPostMeta = $derived(
		postSlug
			? publicPosts.find((p) => p.slug === postSlug || p.id === postSlug)
			: null
	);

	const siteSlug = $derived(
		postSlug || (editingCampaign?.post_slug ? String(editingCampaign.post_slug) : '')
	);

	const branding = $derived(mailSettings.branding);

	const readUrl = $derived.by(() => {
		const base = String(space.siteUrl || '').replace(/\/$/, '');
		if (base && siteSlug) return `${base}/fr/publications/${siteSlug}`;
		return base ? `${base}/fr/publications` : '';
	});

	const letterNumber = $derived.by(() => {
		const sent = campaigns.filter((c) => c.status === 'sent').length;
		if (editingCampaign?.status === 'sent') {
			const older = campaigns.filter(
				(c) =>
					c.status === 'sent' &&
					String(c.sent_at || c.created_at || '') <=
						String(editingCampaign.sent_at || editingCampaign.created_at || '')
			).length;
			return Math.max(1, older);
		}
		return sent + 1;
	});

	const publishedAt = $derived.by(() => {
		const raw = editingCampaign?.sent_at || editingCampaign?.scheduled_at || editingCampaign?.updated_at;
		if (!raw) return new Date().toISOString();
		return String(raw);
	});

	const statusPill = $derived.by(() => {
		locale.value;
		if (busy || saveState === 'saving') return t('web.saving');
		if (editingCampaign?.status === 'sent' || saveState === 'published') return t('web.published');
		if (editingCampaign?.status === 'scheduled' || saveState === 'scheduled') return t('web.scheduled');
		if (saveState === 'saved' || editingCampaign?.status === 'draft') return t('web.savedDraft');
		return t('web.savedDraft');
	});

	const publisherOptions = $derived.by(() => {
		const me = activePerson();
		/** @type {{ email: string, name: string }[]} */
		const rows = [];
		const seen = new Set();
		for (const m of members) {
			const email = String(m.email || '')
				.trim()
				.toLowerCase();
			if (!email || seen.has(email)) continue;
			seen.add(email);
			rows.push({ email, name: m.name || displayNameFromEmail(email) });
		}
		if (me.email && !seen.has(me.email)) {
			rows.unshift({ email: me.email, name: me.name });
		}
		if (!rows.length && me.email) rows.push({ email: me.email, name: me.name });
		return rows;
	});

	/** @param {string} md */
	function mdToEditorHtml(md) {
		const raw = String(md || '');
		if (!raw.trim()) return '';
		if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
		return raw
			.split(/\n\n+/)
			.map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
			.join('');
	}

	$effect(() => {
		const key = `${campaignId || ''}:${postSlug || ''}`;
		if (!key || key === ':') return;
		if (seededFor === key) return;
		seededFor = key;
		err = '';
		saveState = 'idle';

		const me = activePerson();
		if (editingCampaign) {
			subject = editingCampaign.subject || '';
			description = editingCampaign.description || '';
			body = editingCampaign.body || '';
			imageUrl = editingCampaign.image_url || null;
			publisherEmail = editingCampaign.publisher_email || me.email || '';
			publisherName =
				editingCampaign.publisher_name ||
				displayNameFromEmail(publisherEmail) ||
				me.name ||
				'';
			if (editingCampaign.status === 'scheduled') saveState = 'scheduled';
			else if (editingCampaign.status === 'sent') saveState = 'published';
			else saveState = 'saved';
			return;
		}

		if (postSlug) {
			publisherEmail = me.email || '';
			publisherName = me.name || '';
			subject = editingPostMeta?.title || '';
			description = editingPostMeta?.summary || '';
			body = '';
			void (async () => {
				try {
					const detail = await loadPostDetail(postSlug);
					const meta = detail?.meta ?? detail;
					subject = meta?.title || subject;
					description = meta?.summary || description || '';
					body = mdToEditorHtml(detail?.body_markdown || '');
					await tick();
				} catch (e) {
					err = e instanceof Error ? e.message : String(e);
				}
			})();
			return;
		}

		publisherEmail = me.email || '';
		publisherName = me.name || '';
		subject = '';
		description = '';
		body = '';
		imageUrl = null;
	});

	function queueAutosave() {
		if (editingCampaign?.status === 'sent' || postSlug) return;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void autosave();
		}, 900);
	}

	async function autosave() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		if (postSlug || editingCampaign?.status === 'sent') return;
		saveState = 'saving';
		try {
			if (editingCampaign) {
				await persistUpdateCampaign(editingCampaign.id, {
					subject: nextSubject,
					body: nextBody,
					description: description.trim() || undefined,
					image_url: imageUrl || undefined,
					publisher_email: publisherEmail,
					publisher_name: publisherName
				});
			} else {
				const c = await persistCampaign({
					subject: nextSubject,
					body: nextBody,
					description: description.trim() || undefined,
					image_url: imageUrl || undefined,
					publisher_email: publisherEmail,
					publisher_name: publisherName
				});
				selectEntity('newsletter', c.id);
			}
			saveState = 'saved';
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			saveState = 'idle';
		}
	}

	async function saveWebsite() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		const slug = siteSlug;
		if (!slug) {
			err = 'No public post slug yet — publish the letter first.';
			return;
		}
		busy = true;
		err = '';
		try {
			await persistUpdatePost(slug, {
				title: nextSubject,
				summary: description.trim() || undefined,
				clear_summary: !description.trim(),
				body_html: nextBody
			});
			saveState = 'published';
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function publishNow() {
		scheduleOpen = false;
		if (postSlug || editingCampaign?.status === 'sent') {
			await saveWebsite();
			return;
		}
		if (!confirm(t('pub.publishConfirm'))) return;
		busy = true;
		err = '';
		try {
			let id = editingCampaign?.id;
			if (!id) {
				const c = await persistCampaign({
					subject: subject.trim(),
					body: body.trim(),
					description: description.trim() || undefined,
					image_url: imageUrl || undefined,
					publisher_email: publisherEmail,
					publisher_name: publisherName
				});
				id = c.id;
				selectEntity('newsletter', id);
			} else {
				await persistUpdateCampaign(id, {
					subject: subject.trim(),
					body: body.trim(),
					description: description.trim() || undefined,
					image_url: imageUrl || undefined,
					publisher_email: publisherEmail,
					publisher_name: publisherName
				});
			}
			await persistSendCampaign(id);
			saveState = 'published';
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function confirmSchedule() {
		const when = scheduleLocal ? new Date(scheduleLocal) : null;
		if (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
			err = 'Pick a future date and time.';
			return;
		}
		busy = true;
		err = '';
		try {
			let id = editingCampaign?.id;
			if (!id) {
				const c = await persistCampaign({
					subject: subject.trim(),
					body: body.trim(),
					description: description.trim() || undefined,
					image_url: imageUrl || undefined,
					publisher_email: publisherEmail,
					publisher_name: publisherName
				});
				id = c.id;
				selectEntity('newsletter', id);
			} else {
				await persistUpdateCampaign(id, {
					subject: subject.trim(),
					body: body.trim(),
					description: description.trim() || undefined,
					image_url: imageUrl || undefined,
					publisher_email: publisherEmail,
					publisher_name: publisherName
				});
			}
			await persistScheduleCampaign(id, when.toISOString());
			saveState = 'scheduled';
			scheduleOpen = false;
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/** @param {{ email: string, name: string }} p */
	function pickPublisher(p) {
		publisherEmail = p.email;
		publisherName = p.name;
		publisherOpen = false;
		queueAutosave();
	}

	const canPublish = $derived(Boolean(subject.trim() && body.trim()) && !busy);
	const primaryLabel = $derived.by(() => {
		locale.value;
		if (busy) return t('common.sending');
		if (postSlug || editingCampaign?.status === 'sent') return t('pub.updateOnSite');
		return t('web.publish');
	});
</script>

<div class="editor">
	<div class="scroll">
		<div class="publisher-row">
			<span class="pub-label">{t('web.publisher')}</span>
			<button type="button" class="publisher-btn" onclick={() => (publisherOpen = !publisherOpen)}>
				<ProfilePic
					name={publisherName || displayNameFromEmail(publisherEmail)}
					email={publisherEmail}
					pictureUrl={pictureUrlFor(publisherEmail)}
					size={22}
				/>
				<span class="publisher-name">{publisherName || displayNameFromEmail(publisherEmail)}</span>
			</button>
			{#if publisherOpen}
				<div class="publisher-menu" role="listbox">
					{#each publisherOptions as p (p.email)}
						<button type="button" class="publisher-opt" onclick={() => pickPublisher(p)}>
							<ProfilePic
								name={p.name}
								email={p.email}
								pictureUrl={pictureUrlFor(p.email)}
								size={22}
							/>
							<span>{p.name}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="pad">
			<MailHeroEditor
				brand={mailSettings.brand_name || 'Space'}
				logoUrl={branding.logo_url || ''}
				eyebrow={branding.eyebrow_fr || 'Lettre'}
				{letterNumber}
				readCta={branding.read_cta_fr || 'Open Online'}
				{readUrl}
				accent={branding.accent || '#dd8f87'}
				pageBg={branding.page_bg || '#f7f3f1'}
				ink={branding.ink || '#160b0f'}
				title={subject}
				description={description}
				{imageUrl}
				publisherName={publisherName || displayNameFromEmail(publisherEmail)}
				publisherEmail={publisherEmail}
				{publishedAt}
				onTitle={(v) => {
					subject = v;
					queueAutosave();
				}}
				onDescription={(v) => {
					description = v;
					queueAutosave();
				}}
				onImage={(url) => {
					imageUrl = url;
					queueAutosave();
				}}
			/>
		</div>
		<div class="form-divider"></div>
		<div class="body-pad">
			<NoteEditor
				value={body}
				placeholder={t('notes.typeCommands')}
				onChange={(html) => {
					body = html;
					queueAutosave();
				}}
				onReady={(ed) => (tipTap = ed)}
			/>
		</div>
		<div class="editor-tools">
			<EditorToolbar editor={tipTap} />
		</div>
		{#if err}
			<p class="err" role="alert">{err}</p>
		{/if}
	</div>

	<div class="dock">
		<button type="button" class="dock-pill" onclick={() => (footerOpen = true)}>
			{t('web.footerEdit')}
		</button>
		<span class="status-pill">{statusPill}</span>
		<div class="publish-split" class:is-disabled={!canPublish}>
			<button type="button" class="publish-main" disabled={!canPublish} onclick={publishNow}>
				{primaryLabel}
			</button>
			<span class="publish-divider" aria-hidden="true"></span>
			<button
				type="button"
				class="publish-chevron"
				bind:this={scheduleBtn}
				disabled={!canPublish || Boolean(postSlug) || editingCampaign?.status === 'sent'}
				aria-label={t('web.schedule')}
				aria-expanded={scheduleOpen}
				onclick={() => (scheduleOpen = !scheduleOpen)}
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M4 6.5 8 10.5 12 6.5"
						stroke="currentColor"
						stroke-width="1.25"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
	</div>
</div>

<FloatPanel
	open={scheduleOpen}
	anchor={scheduleBtn}
	placement="above"
	align="end"
	width={240}
	maxHeight={260}
	onclose={() => (scheduleOpen = false)}
>
	<div class="schedule-panel">
		<button type="button" class="schedule-opt" onclick={publishNow}>{t('web.publishNow')}</button>
		<label class="schedule-label">
			{t('web.schedule')}
			<input type="datetime-local" bind:value={scheduleLocal} />
		</label>
		<button type="button" class="schedule-opt primary" onclick={() => void confirmSchedule()}
			>{t('web.scheduleTitle')}</button
		>
	</div>
</FloatPanel>

<PublicationFooterEdit open={footerOpen} onclose={() => (footerOpen = false)} />

<style>
	.editor {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding-bottom: 88px;
		box-sizing: border-box;
	}

	.publisher-row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px 0;
	}

	.pub-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.publisher-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 10px 0 4px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.publisher-name {
		max-width: 18ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.publisher-menu {
		position: absolute;
		top: 100%;
		left: 14px;
		z-index: 5;
		min-width: 200px;
		margin-top: 4px;
		padding: 6px;
		border-radius: 12px;
		background: var(--modal-bg, var(--bg));
		box-shadow: var(--shadow-2, 0 8px 24px color-mix(in srgb, var(--ink) 16%, transparent));
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.publisher-opt {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.publisher-opt:hover {
		background: var(--fg-4);
	}

	.pad {
		padding: 10px 14px 0;
	}

	.body-pad {
		padding: 8px 14px 4px;
		min-height: 160px;
	}

	.editor-tools {
		padding: 0 14px 10px;
	}

	.form-divider {
		height: 1px;
		margin: 8px 14px;
		background: var(--fg-8);
	}

	.err {
		margin: 0 14px 12px;
		font-size: 13px;
		color: var(--fg-66);
	}

	.dock {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
		background: linear-gradient(
			to top,
			color-mix(in srgb, var(--bg) 94%, transparent) 55%,
			transparent
		);
		box-sizing: border-box;
	}

	.dock-pill,
	.status-pill {
		height: 36px;
		padding: 0 14px;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 0;
		white-space: nowrap;
	}

	.dock-pill {
		cursor: pointer;
	}

	.status-pill {
		justify-self: center;
	}

	.publish-split {
		position: relative;
		display: inline-flex;
		align-items: stretch;
		height: 40px;
		border-radius: 12px;
		overflow: visible;
		background: var(--button-primary-bg, var(--ink));
		color: var(--button-primary-fg, var(--bg));
	}

	.publish-split.is-disabled {
		opacity: 0.5;
	}

	.publish-main {
		padding: 0 16px;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 13px;
		font-weight: 650;
		cursor: pointer;
	}

	.publish-divider {
		width: 1px;
		align-self: stretch;
		background: color-mix(in srgb, var(--button-primary-fg, var(--bg)) 28%, transparent);
	}

	.publish-chevron {
		width: 36px;
		border: 0;
		background: transparent;
		color: inherit;
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.publish-split.is-disabled .publish-main:disabled,
	.publish-split.is-disabled .publish-chevron:disabled,
	.publish-chevron:disabled {
		opacity: 1;
		cursor: default;
	}

	.schedule-panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		box-sizing: border-box;
	}

	.schedule-opt {
		height: 36px;
		padding: 0 12px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.schedule-opt.primary {
		background: var(--ink);
		color: var(--bg);
	}

	.schedule-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.schedule-label input {
		height: 36px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
	}
</style>
