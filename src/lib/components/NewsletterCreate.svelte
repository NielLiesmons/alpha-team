<script>
	/**
	 * Publication create/edit sheet:
	 * brand + publisher picker → hero → title → description → body → footer (full width).
	 */
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import MailHeroEditor from './MailHeroEditor.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import {
		audiences,
		campaigns,
		loadPostDetail,
		mailSettings,
		persistCampaign,
		persistMailSettings,
		persistSendCampaign,
		persistUpdateCampaign,
		persistUpdatePost,
		publicPosts,
		refreshAudiences
	} from '$lib/publications.svelte.js';
	import { activePerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { members } from '$lib/members.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { space } from '$lib/sections.js';
	import { closeComposer, ui } from '$lib/workspace.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';

	let subject = $state('');
	let description = $state('');
	let body = $state('');
	/** @type {string | null} */
	let imageUrl = $state(null);
	let publisherEmail = $state('');
	let publisherName = $state('');
	let publisherOpen = $state(false);
	let audienceId = $state('subscribers');
	let footerHtml = $state('');
	let busy = $state(false);
	let err = $state('');
	/** @type {'idle' | 'saving' | 'saved' | 'published'} */
	let saveState = $state('idle');
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {import('@tiptap/core').Editor | null} */
	let tipTap = $state(null);

	const editingCampaign = $derived(
		ui.composer?.kind === 'newsletter' &&
			ui.composer.id &&
			!String(ui.composer.id).startsWith('post:')
			? campaigns.find((c) => c.id === ui.composer.id)
			: null
	);

	const editingPostSlug = $derived.by(() => {
		if (ui.composer?.kind !== 'newsletter') return '';
		const id = ui.composer?.id ? String(ui.composer.id) : '';
		if (id.startsWith('post:')) return id.slice(5);
		return ui.composer?.postSlug ? String(ui.composer.postSlug) : '';
	});

	const editingPostMeta = $derived(
		editingPostSlug
			? publicPosts.find((p) => p.slug === editingPostSlug || p.id === editingPostSlug)
			: null
	);

	const open = $derived(ui.composer?.kind === 'newsletter');
	const branding = $derived(mailSettings.branding);
	const siteSlug = $derived(
		editingPostSlug || (editingCampaign?.post_slug ? String(editingCampaign.post_slug) : '')
	);

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
		if (me.email && !seen.has(me.email.toLowerCase())) {
			rows.unshift({ email: me.email.toLowerCase(), name: me.name || displayNameFromEmail(me.email) });
		}
		if (!rows.length && me.email) {
			rows.push({ email: me.email.toLowerCase(), name: me.name || displayNameFromEmail(me.email) });
		}
		return rows;
	});

	const sheetLabel = $derived.by(() => {
		locale.value;
		if (editingPostSlug) return t('pub.editPublication');
		if (editingCampaign) {
			return editingCampaign.status === 'sent' ? t('pub.editLetter') : t('detail.newsletter');
		}
		return t('pub.newLetter');
	});

	const statusPill = $derived.by(() => {
		locale.value;
		if (busy || saveState === 'saving') return t('web.saving');
		if (editingPostSlug || editingCampaign?.status === 'sent' || saveState === 'published') {
			return t('web.published');
		}
		if (editingCampaign?.status === 'scheduled') return t('web.scheduled');
		if (saveState === 'saved' || editingCampaign?.status === 'draft') return t('web.savedDraft');
		return t('web.savedDraft');
	});

	const editorKey = $derived(
		`${open ? '1' : '0'}-${editingPostSlug || editingCampaign?.id || 'new'}`
	);

	/** @param {string} md */
	function mdToEditorHtml(md) {
		const text = String(md || '').trim();
		if (!text) return '';
		if (/<[a-z][\s\S]*>/i.test(text)) return text;
		return text
			.split(/\n\n+/)
			.map(
				(p) =>
					`<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`
			)
			.join('');
	}

	$effect(() => {
		if (!open) {
			seededFor = null;
			publisherOpen = false;
			return;
		}
		if (!audiences.length) void refreshAudiences().catch(() => {});
		const key = editingPostSlug
			? `post:${editingPostSlug}`
			: editingCampaign?.id
				? `c:${editingCampaign.id}`
				: '__new__';
		if (seededFor === key) return;
		seededFor = key;
		err = '';
		saveState = 'idle';
		imageUrl = null;
		footerHtml = mailSettings.footer_html || '';
		publisherOpen = false;
		audienceId =
			editingCampaign?.audience_id ||
			mailSettings.default_audience_id ||
			'subscribers';

		const me = activePerson();
		if (editingPostSlug) {
			publisherEmail = me.email || '';
			publisherName = me.name || displayNameFromEmail(me.email) || '';
			subject = editingPostMeta?.title || '';
			description = editingPostMeta?.summary || '';
			body = '';
			void (async () => {
				try {
					const detail = await loadPostDetail(editingPostSlug);
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

		subject = editingCampaign?.subject ?? '';
		description = editingCampaign?.description ?? '';
		body = editingCampaign?.body ?? '';
		imageUrl = editingCampaign?.image_url || null;
		publisherEmail =
			editingCampaign?.publisher_email || me.email || '';
		publisherName =
			editingCampaign?.publisher_name ||
			displayNameFromEmail(publisherEmail) ||
			me.name ||
			'';
		if (editingCampaign?.status === 'sent') saveState = 'published';
		else if (editingCampaign) saveState = 'saved';
		void tick();
	});

	/** @param {{ email: string, name: string }} p */
	function pickPublisher(p) {
		publisherEmail = p.email;
		publisherName = p.name;
		publisherOpen = false;
	}

	function publisherPayload() {
		return {
			publisher_email: publisherEmail || undefined,
			publisher_name: publisherName || undefined,
			audience_id: audienceId || 'subscribers'
		};
	}

	async function persistFooterIfChanged() {
		const next = footerHtml.trim();
		const prev = String(mailSettings.footer_html || '').trim();
		if (next === prev) return;
		await persistMailSettings({ footer_html: footerHtml });
	}

	async function saveDraft() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody || busy) return;
		if (editingPostSlug || editingCampaign?.status === 'sent') {
			await saveWebsite();
			return;
		}
		busy = true;
		saveState = 'saving';
		err = '';
		try {
			await persistFooterIfChanged();
			const payload = {
				subject: nextSubject,
				body: nextBody,
				description: description.trim() || undefined,
				image_url: imageUrl || undefined,
				...publisherPayload()
			};
			if (editingCampaign) {
				await persistUpdateCampaign(editingCampaign.id, payload);
			} else {
				await persistCampaign(payload);
			}
			saveState = 'saved';
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			saveState = 'idle';
		} finally {
			busy = false;
		}
	}

	async function saveWebsite() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		const slug = siteSlug;
		if (!slug) {
			err = 'No public post slug yet — publish the letter first so it lands on the site.';
			return;
		}
		busy = true;
		saveState = 'saving';
		err = '';
		try {
			await persistFooterIfChanged();
			await persistUpdatePost(slug, {
				title: nextSubject,
				summary: description.trim() || undefined,
				clear_summary: !description.trim(),
				body_html: nextBody
			});
			saveState = 'published';
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			saveState = 'idle';
		} finally {
			busy = false;
		}
	}

	async function saveAndSend() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody || busy) return;
		if (editingPostSlug || editingCampaign?.status === 'sent') {
			await saveWebsite();
			return;
		}
		if (!confirm(t('pub.publishConfirm'))) return;
		busy = true;
		saveState = 'saving';
		err = '';
		try {
			await persistFooterIfChanged();
			const payload = {
				subject: nextSubject,
				body: nextBody,
				description: description.trim() || undefined,
				image_url: imageUrl || undefined,
				...publisherPayload()
			};
			let id = editingCampaign?.id;
			if (!id) {
				const c = await persistCampaign(payload);
				id = c.id;
			} else {
				await persistUpdateCampaign(id, payload);
			}
			await persistSendCampaign(id);
			saveState = 'published';
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			saveState = 'idle';
		} finally {
			busy = false;
		}
	}

	const primaryLabel = $derived.by(() => {
		locale.value;
		if (busy) {
			if (editingPostSlug || editingCampaign?.status === 'sent') return t('common.saving');
			return t('common.sending');
		}
		if (editingPostSlug || editingCampaign?.status === 'sent') return t('pub.updateOnSite');
		return t('pub.sendToList');
	});

	const canSubmit = $derived(Boolean(subject.trim() && body.trim()) && !busy);
</script>

<CreateSheet
	{open}
	label={sheetLabel}
	onclose={() => {
		publisherOpen = false;
		closeComposer();
	}}
>
	<div class="pad">
		<MailHeroEditor
			brand={mailSettings.brand_name || space.name || 'Space'}
			logoUrl={branding.logo_url || ''}
			accent={branding.accent || '#dd8f87'}
			pageBg={branding.page_bg || '#f7f3f1'}
			ink={branding.ink || '#160b0f'}
			title={subject}
			description={description}
			{imageUrl}
			{publisherName}
			{publisherEmail}
			{publisherOpen}
			onTitle={(v) => (subject = v)}
			onDescription={(v) => (description = v)}
			onImage={(url) => (imageUrl = url)}
			onPublisherToggle={() => (publisherOpen = !publisherOpen)}
		>
			{#snippet publisherMenu()}
				<div class="publisher-menu" role="listbox" aria-label={t('web.publisher')}>
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
					<p class="publisher-note">Sends from news@… — picker is attribution only.</p>
				</div>
			{/snippet}
		</MailHeroEditor>
	</div>
	<div class="form-divider"></div>
	<div class="body-pad">
		{#key editorKey}
			{#if open}
				<NoteEditor
					value={body}
					placeholder={t('notes.typeCommands')}
					onChange={(html) => (body = html)}
					onReady={(ed) => (tipTap = ed)}
				/>
			{/if}
		{/key}
	</div>
	<div class="editor-tools">
		<EditorToolbar editor={tipTap} />
	</div>

	{#if !editingPostSlug && editingCampaign?.status !== 'sent'}
		<section class="audience-block" aria-label={t('aud.sendTo')}>
			<label class="audience-label" for="letter-audience">{t('aud.sendTo')}</label>
			<select id="letter-audience" class="audience-select" bind:value={audienceId}>
				{#each audiences as a (a.id)}
					<option value={a.id}>
						{a.title}{#if a.is_default}
							({t('aud.default')}){/if} — {a.member_count ?? 0}
					</option>
				{:else}
					<option value="subscribers">{t('aud.default')}</option>
				{/each}
			</select>
		</section>
	{/if}

	<section class="footer-block" aria-label={t('web.footerEdit')}>
		<div class="footer-head">
			<span class="footer-label">{t('web.footerEdit')}</span>
			<span class="footer-hint">{t('web.footerHint')}</span>
		</div>
		<textarea
			class="footer-area"
			rows="4"
			placeholder="Footer HTML…"
			bind:value={footerHtml}
		></textarea>
	</section>

	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}
	{#if editingPostSlug || editingCampaign?.status === 'sent'}
		<p class="hint">Saves the website article only — subscribers are not re-emailed.</p>
	{/if}

	<div class="sheet-bottom">
		<span class="status-pill" aria-live="polite">{statusPill}</span>
		<div class="actions">
			{#if !(editingPostSlug || editingCampaign?.status === 'sent')}
				<button type="button" class="ghost-btn" disabled={!canSubmit} onclick={saveDraft}>
					{busy ? '…' : t('pub.saveDraft')}
				</button>
			{/if}
			<PrimaryButton size="sheet" disabled={!canSubmit} onclick={saveAndSend}>
				{primaryLabel}
			</PrimaryButton>
		</div>
	</div>
</CreateSheet>

<style>
	.pad {
		padding: 10px 14px 0;
	}

	.body-pad {
		padding: 8px 14px 4px;
		min-height: 160px;
	}

	.editor-tools {
		padding: 0 14px 10px;
		flex-shrink: 0;
	}

	.form-divider {
		height: 1px;
		margin: 8px 14px;
		background: var(--fg-8);
	}

	.publisher-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 8;
		min-width: 220px;
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
		font-size: 0.8125rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.publisher-opt:hover {
		background: var(--fg-4);
	}

	.publisher-note {
		margin: 4px 8px 6px;
		font-size: 0.6875rem;
		line-height: 1.35;
		color: var(--fg-33);
	}

	.audience-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 14px 12px;
	}

	.audience-label {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.audience-select {
		border: none;
		background: var(--fg-8);
		border-radius: 999px;
		padding: 10px 14px;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg);
		max-width: 100%;
	}

	.footer-block {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 4px 0 0;
		padding: 12px 14px 10px;
		border-top: 1px solid var(--fg-8);
		box-sizing: border-box;
	}

	.footer-head {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.footer-label {
		font-size: 0.75rem;
		font-weight: 650;
		color: var(--fg-66);
	}

	.footer-hint {
		font-size: 0.6875rem;
		line-height: 1.35;
		color: var(--fg-33);
	}

	.footer-area {
		width: 100%;
		min-height: 88px;
		padding: 10px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		font-size: 0.8125rem;
		line-height: 1.45;
		resize: vertical;
		box-sizing: border-box;
	}

	.sheet-bottom {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 0 14px 14px;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		height: 22px;
		padding: 0 9px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--fg) 5%, transparent);
		color: var(--fg-33);
		font-size: 0.6875rem;
		font-weight: 550;
		letter-spacing: 0.01em;
		pointer-events: none;
		user-select: none;
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}

	.ghost-btn {
		height: 40px;
		padding: 0 14px;
		border: 0;
		border-radius: 12px;
		background: var(--fg-4);
		color: var(--fg-66);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.ghost-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.err {
		margin: 0 14px 8px;
		font-size: 0.8125rem;
		color: var(--fg-66);
	}

	.hint {
		margin: 0 14px 8px;
		font-size: 0.75rem;
		line-height: 1.35;
		color: var(--fg-33);
	}
</style>
