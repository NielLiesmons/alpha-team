<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import MailHeroEditor from './MailHeroEditor.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import { mailSettings, persistMailSettings } from '$lib/publications.svelte.js';
	import { closeComposer, ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let from = $state('');
	let enabled = $state(false);
	let subjectFr = $state('');
	let subjectEn = $state('');
	let bodyFr = $state('');
	let bodyEn = $state('');
	let descFr = $state('');
	/** @type {string | null} */
	let imageUrl = $state(null);
	let busy = $state(false);
	let err = $state('');
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {import('@tiptap/core').Editor | null} */
	let tipTap = $state(null);
	/** @type {'fr' | 'en'} */
	let lang = $state('fr');

	const open = $derived(ui.composer?.kind === 'welcome');

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		if (seededFor === 'welcome') return;
		seededFor = 'welcome';
		from = mailSettings.from;
		enabled = mailSettings.welcome.enabled;
		subjectFr = mailSettings.welcome.subject_fr;
		subjectEn = mailSettings.welcome.subject_en;
		bodyFr = mailSettings.welcome.body_fr;
		bodyEn = mailSettings.welcome.body_en;
		descFr = '';
		imageUrl = null;
		err = '';
		tick();
	});

	const activeSubject = $derived(lang === 'fr' ? subjectFr : subjectEn);
	const activeBody = $derived(lang === 'fr' ? bodyFr : bodyEn);

	/** @param {string} v */
	function setSubject(v) {
		if (lang === 'fr') subjectFr = v;
		else subjectEn = v;
	}

	/** @param {string} html */
	function setBody(html) {
		if (lang === 'fr') bodyFr = html;
		else bodyEn = html;
	}

	async function save() {
		busy = true;
		err = '';
		try {
			await persistMailSettings({
				from,
				welcome: {
					enabled,
					subject_fr: subjectFr,
					subject_en: subjectEn,
					body_fr: bodyFr,
					body_en: bodyEn
				}
			});
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<CreateSheet {open} label={t('pub.welcomeMessage')} onclose={closeComposer}>
	<label class="check">
		<input type="checkbox" bind:checked={enabled} />
		<span>{t('pub.sendOnSubscribe')}</span>
	</label>
	<div class="form-divider"></div>
	<div class="sheet-title-row">
		<input class="sheet-input" placeholder={`${t('pub.fromSpace')} <news@example.com>`} bind:value={from} />
	</div>
	<div class="form-divider"></div>
	<div class="lang-seg" role="group" aria-label={t('common.language')}>
		<button type="button" class:on={lang === 'fr'} onclick={() => (lang = 'fr')}>FR</button>
		<button type="button" class:on={lang === 'en'} onclick={() => (lang = 'en')}>EN</button>
	</div>
	<div class="pad">
		<MailHeroEditor
			brand={mailSettings.brand_name || 'Space'}
			logoUrl={mailSettings.branding?.logo_url || ''}
			eyebrow={lang === 'en'
				? mailSettings.branding?.eyebrow_en || 'Letter'
				: mailSettings.branding?.eyebrow_fr || 'Lettre'}
			readCta={mailSettings.branding?.read_cta_fr || 'Open Online'}
			accent={mailSettings.branding?.accent || '#dd8f87'}
			pageBg={mailSettings.branding?.page_bg || '#f7f3f1'}
			ink={mailSettings.branding?.ink || '#160b0f'}
			title={activeSubject}
			description={descFr}
			{imageUrl}
			onTitle={setSubject}
			onDescription={(v) => (descFr = v)}
			onImage={(url) => (imageUrl = url)}
		/>
	</div>
	<div class="form-divider"></div>
	<div class="body-pad">
		{#if open}
			{#key lang}
				<NoteEditor
					value={activeBody}
					placeholder={t('notes.typeCommands')}
					onChange={setBody}
					onReady={(ed) => (tipTap = ed)}
				/>
			{/key}
		{/if}
	</div>
	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}
	<div class="sheet-bottom row">
		<EditorToolbar editor={tipTap} />
		<PrimaryButton size="sheet" disabled={busy} onclick={save}>
			{busy ? t('common.saving') : t('pub.saveWelcome')}
		</PrimaryButton>
	</div>
</CreateSheet>

<style>
	.check {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0;
		padding: 12px 14px;
		font-size: 14px;
		color: var(--fg);
		cursor: pointer;
	}

	.lang-seg {
		display: inline-flex;
		gap: 2px;
		margin: 8px 14px 0;
		padding: 3px;
		border-radius: 10px;
		background: var(--fg-4);
	}

	.lang-seg button {
		border: 0;
		border-radius: 8px;
		padding: 6px 12px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
	}

	.lang-seg button.on {
		background: var(--popover);
		color: var(--fg);
	}

	.pad {
		padding: 10px 14px 0;
	}

	.body-pad {
		padding: 8px 14px 12px;
		min-height: 140px;
	}

	.sheet-bottom.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.err {
		margin: 0 14px 8px;
		font-size: 13px;
		color: #b44;
	}
</style>
