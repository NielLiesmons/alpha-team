<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
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

	const sheetLabel = $derived(
		editingPostSlug
			? 'Edit publication'
			: editingCampaign
				? editingCampaign.status === 'sent'
					? 'Edit letter (site)'
					: 'Newsletter'
				: 'New letter'
	);

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
			!confirm(
				'Publish this letter? It will email every subscriber and appear as a Blog post on the site.'
			)
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
		if (busy) {
			if (editingPostSlug || editingCampaign?.status === 'sent') return 'Saving…';
			return 'Sending…';
		}
		if (editingPostSlug || editingCampaign?.status === 'sent') return 'Update on site';
		return 'Send to list';
	});
</script>

<CreateSheet {open} label={sheetLabel} onclose={closeComposer}>
	<div class="pad">
		<MailHeroEditor
			brand={mailSettings.brand_name || 'Bley'}
			logoUrl={branding.logo_url || 'https://bley.farm/icons/bley-logo-ink.svg'}
			eyebrow={branding.eyebrow_fr || 'Lettre'}
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
				placeholder="Type / for commands"
				onChange={(html) => (body = html)}
				onReady={(ed) => (tipTap = ed)}
			/>
		{/if}
	</div>
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
					{busy ? '…' : 'Save draft'}
				</button>
			{/if}
			<button
				type="button"
				class="publish-btn"
				disabled={busy || !subject.trim() || !body.trim()}
				onclick={saveAndSend}
			>
				{primaryLabel}
			</button>
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

	.publish-btn {
		height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 12px;
		background: var(--button-primary-bg) padding-box, var(--glass-shine) border-box;
		border: 1px solid transparent;
		color: var(--button-primary-fg);
		font: inherit;
		font-weight: 650;
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
</style>
