<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import MailHeroEditor from './MailHeroEditor.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import {
		campaigns,
		loadPostDetail,
		mailSettings,
		persistCampaign,
		persistSendCampaign,
		persistUpdatePost,
		publicPosts
	} from '$lib/publications.svelte.js';
	import { space } from '$lib/sections.js';
	import { closeComposer, ui } from '$lib/workspace.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';

	let subject = $state('');
	let description = $state('');
	let body = $state('');
	/** @type {string | null} */
	let imageUrl = $state(null);
	let busy = $state(false);
	let err = $state('');
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {import('@tiptap/core').Editor | null} */
	let tipTap = $state(null);

	/** Editing a mail campaign (draft or sent). */
	const editingCampaign = $derived(
		ui.composer?.kind === 'newsletter' && ui.composer.id && !String(ui.composer.id).startsWith('post:')
			? campaigns.find((c) => c.id === ui.composer.id)
			: null
	);

	/** Editing a public site post (blog / post / event) — website only. */
	const editingPostSlug = $derived.by(() => {
		if (ui.composer?.kind !== 'newsletter') return '';
		const id = ui.composer?.id ? String(ui.composer.id) : '';
		if (id.startsWith('post:')) return id.slice(5);
		const seedSlug = ui.composer?.postSlug ? String(ui.composer.postSlug) : '';
		return seedSlug;
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
	/** Preview Read CTA — live URL once a slug exists; else site publications index. */
	const readUrl = $derived.by(() => {
		const base = String(space.siteUrl || '').replace(/\/$/, '');
		if (base && siteSlug) return `${base}/fr/publications/${siteSlug}`;
		return base ? `${base}/fr/publications` : '';
	});

	/** LETTER n — sent campaigns + 1 (matches alpha-api `next_letter_number`). */
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

	/** Day-to-day microblog previews (kind=post), not mass-mailed letters. */
	const latestPosts = $derived.by(() => {
		const base = String(space.siteUrl || '').replace(/\/$/, '');
		return publicPosts
			.filter((p) => {
				const k = String(p.kind || '');
				return k === 'post' || k === 'reel';
			})
			.filter((p) => !siteSlug || p.slug !== siteSlug)
			.slice(0, 3)
			.map((p) => ({
				title: String(p.title || ''),
				href: base ? `${base}/fr/publications/${p.slug}` : '',
				imageUrl: ''
			}));
	});

	const commentHref = $derived.by(() => {
		const from = String(mailSettings.from || '');
		const m = from.match(/<([^>]+)>/);
		const addr = (m ? m[1] : from).trim();
		if (addr && siteSlug) {
			return `mailto:${addr}?subject=${encodeURIComponent(`Comment: ${siteSlug}`)}`;
		}
		return readUrl ? `${readUrl}#comments` : '';
	});

	const sheetLabel = $derived.by(() => {
		locale.value;
		return editingPostSlug
			? t('pub.editPublication')
			: editingCampaign
				? editingCampaign.status === 'sent'
					? t('pub.editLetter')
					: t('detail.newsletter')
				: t('pub.newLetter');
	});

	/** @param {string} md */
	function mdToEditorHtml(md) {
		const text = String(md || '').trim();
		if (!text) return '';
		if (/<[a-z][\s\S]*>/i.test(text)) return text;
		return text
			.split(/\n\n+/)
			.map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`)
			.join('');
	}

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		const key = editingPostSlug
			? `post:${editingPostSlug}`
			: editingCampaign?.id
				? `c:${editingCampaign.id}`
				: '__new__';
		if (seededFor === key) return;
		seededFor = key;
		err = '';
		imageUrl = null;

		if (editingPostSlug) {
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
		tick();
	});

	async function saveDraft() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		if (editingPostSlug || editingCampaign?.status === 'sent') {
			await saveWebsite();
			return;
		}
		if (editingCampaign) {
			err = 'Draft updates aren’t wired yet — create a new letter, or publish then edit the site copy.';
			return;
		}
		busy = true;
		err = '';
		try {
			await persistCampaign({
				subject: nextSubject,
				body: nextBody,
				description: description.trim() || undefined,
				image_url: imageUrl || undefined
			});
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/** Update public website post only — no re-email. */
	async function saveWebsite() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		const slug = siteSlug;
		if (!slug) {
			err = 'No public post slug yet — send the letter first so it lands on the site.';
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
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function saveAndSend() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		if (editingPostSlug || editingCampaign?.status === 'sent') {
			await saveWebsite();
			return;
		}
		if (
			!confirm(t('pub.publishConfirm'))
		)
			return;
		busy = true;
		err = '';
		try {
			let id = editingCampaign?.id;
			if (!id) {
				const c = await persistCampaign({
					subject: nextSubject,
					body: nextBody,
					description: description.trim() || undefined,
					image_url: imageUrl || undefined
				});
				id = c.id;
			}
			await persistSendCampaign(id);
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
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
</script>

<CreateSheet {open} label={sheetLabel} onclose={closeComposer}>
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
			onTitle={(v) => (subject = v)}
			onDescription={(v) => (description = v)}
			onImage={(url) => (imageUrl = url)}
		/>
	</div>
	<div class="form-divider"></div>
	<div class="body-pad">
		{#if open}
			<NoteEditor
				value={body}
				placeholder={t('notes.typeCommands')}
				onChange={(html) => (body = html)}
				onReady={(ed) => (tipTap = ed)}
			/>
		{/if}
	</div>
	{#if commentHref}
		<div class="mail-extra">
			{#if commentHref.startsWith('mailto:')}
				<a class="comment-cta" href={commentHref}>Laisser un commentaire</a>
			{:else}
				<a class="comment-cta" href={commentHref} target="_blank" rel="noopener noreferrer"
					>Laisser un commentaire</a
				>
			{/if}
		</div>
	{/if}
	{#if latestPosts.length}
		<div class="form-divider"></div>
		<div class="latest">
			<p class="latest-eyebrow">{t('pub.latestPosts')}</p>
			<div class="latest-row">
				{#each latestPosts as post}
					{#if post.href}
						<a class="latest-card" href={post.href} target="_blank" rel="noopener noreferrer">
							<span class="latest-thumb" aria-hidden="true"></span>
							<span class="latest-title">{post.title}</span>
						</a>
					{:else}
						<div class="latest-card">
							<span class="latest-thumb" aria-hidden="true"></span>
							<span class="latest-title">{post.title}</span>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}
	{#if editingPostSlug || editingCampaign?.status === 'sent'}
		<p class="hint">Saves the website article only — subscribers are not re-emailed.</p>
	{/if}
	<div class="sheet-bottom row">
		<EditorToolbar editor={tipTap} />
		<div class="actions">
			{#if !editingCampaign && !editingPostSlug}
				<button
					type="button"
					class="ghost-btn"
					disabled={busy || !subject.trim() || !body.trim()}
					onclick={saveDraft}
				>
					{busy ? '…' : t('pub.saveDraft')}
				</button>
			{/if}
			<PrimaryButton
				size="sheet"
				disabled={busy || !subject.trim() || !body.trim()}
				onclick={saveAndSend}
			>
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
		padding: 8px 14px 12px;
		min-height: 160px;
	}

	.sheet-bottom.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
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

	.err {
		margin: 0 14px 8px;
		font-size: 13px;
		color: #b44;
	}

	.hint {
		margin: 0 14px 8px;
		font-size: 12px;
		line-height: 1.35;
		color: var(--fg-33);
	}

	.mail-extra {
		padding: 4px 14px 12px;
	}

	.comment-cta {
		display: inline-flex;
		align-items: center;
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--fg) 22%, transparent);
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
	}

	.latest {
		padding: 4px 14px 16px;
	}

	.latest-eyebrow {
		margin: 0 0 12px;
		font-family: Inter, Helvetica, Arial, sans-serif;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg);
	}

	.latest-row {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.latest-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		text-decoration: none;
		color: inherit;
	}

	.latest-thumb {
		display: block;
		height: 72px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.latest-title {
		font-size: 13px;
		font-weight: 600;
		line-height: 1.35;
	}

	@media (max-width: 520px) {
		.latest-row {
			grid-template-columns: 1fr;
		}
	}
</style>
