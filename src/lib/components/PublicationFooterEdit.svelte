<script>
	import CreateSheet from './CreateSheet.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { mailSettings, persistMailSettings } from '$lib/publications.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {{ open?: boolean, onclose?: () => void }} */
	let { open = false, onclose = () => {} } = $props();

	let footerHtml = $state('');
	let busy = $state(false);
	let err = $state('');
	/** @type {string | null} */
	let seeded = $state(null);

	$effect(() => {
		if (!open) {
			seeded = null;
			return;
		}
		if (seeded === 'open') return;
		seeded = 'open';
		footerHtml = mailSettings.footer_html || '';
		err = '';
	});

	async function save() {
		busy = true;
		err = '';
		try {
			await persistMailSettings({ footer_html: footerHtml });
			onclose();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<CreateSheet {open} label={t('web.editFooter')} onclose={onclose}>
	<div class="pad">
		<p class="hint">{t('web.footerHint')}</p>
		<textarea
			class="area"
			rows="8"
			placeholder="Footer HTML…"
			bind:value={footerHtml}
		></textarea>
		{#if err}
			<p class="err" role="alert">{err}</p>
		{/if}
	</div>
	<div class="sheet-bottom">
		<PrimaryButton size="sheet" disabled={busy} onclick={save}>
			{busy ? t('web.saving') : t('common.save')}
		</PrimaryButton>
	</div>
</CreateSheet>

<style>
	.pad {
		padding: 12px 14px 8px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.hint {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--fg-33);
	}

	.area {
		width: 100%;
		min-height: 160px;
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

	.err {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--fg-66);
	}

	.sheet-bottom {
		display: flex;
		justify-content: flex-end;
		padding: 0 14px 14px;
	}
</style>
