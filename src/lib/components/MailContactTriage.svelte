<script>
	/**
	 * Split Accept / Add-to-News CTA for unknown senders (desktop + mobile chrome).
	 */
	import FloatPanel from './FloatPanel.svelte';
	import { categorizeContact } from '$lib/mail-contacts.svelte.js';
	import { isUpdatesMail } from '$lib/mail.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   email: string,
	 *   thread?: any,
	 *   compact?: boolean
	 * }}
	 */
	let { email, thread = null, compact = false } = $props();

	let menuOpen = $state(false);
	/** @type {HTMLElement | null} */
	let chevronEl = $state(null);

	const suggestNews = $derived(isUpdatesMail(thread));
	const mainLabel = $derived(suggestNews ? t('mail.addToNews') : t('common.accept'));
	const mainBucket = $derived(/** @type {'primary' | 'updates'} */ (suggestNews ? 'updates' : 'primary'));

	/** @param {'primary' | 'updates' | 'other'} bucket */
	function apply(bucket) {
		menuOpen = false;
		categorizeContact(email, bucket);
	}
</script>

<div class="triage-split" class:compact role="group" aria-label={mainLabel}>
	<button type="button" class="triage-main" onclick={() => apply(mainBucket)}>
		{mainLabel}
	</button>
	<span class="triage-divider" aria-hidden="true"></span>
	<button
		type="button"
		class="triage-chevron"
		bind:this={chevronEl}
		aria-label={t('mail.categorizeContact')}
		aria-expanded={menuOpen}
		onclick={() => (menuOpen = !menuOpen)}
	>
		<svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path
				d="M3 4.5 6 7.5 9 4.5"
				stroke="currentColor"
				stroke-width="1.2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
</div>

<FloatPanel
	open={menuOpen}
	anchor={chevronEl}
	placement="below"
	align="end"
	width={200}
	maxHeight={220}
	onclose={() => (menuOpen = false)}
>
	<div class="dropdown-list" role="menu">
		<button type="button" class="dropdown-item" role="menuitem" onclick={() => apply('primary')}>
			<span>{t('common.accept')}</span>
			<span class="hint">{t('mail.primary')}</span>
		</button>
		<button type="button" class="dropdown-item" role="menuitem" onclick={() => apply('updates')}>
			<span>{t('mail.addToNews')}</span>
			<span class="hint">{t('mail.updates')}</span>
		</button>
		<button type="button" class="dropdown-item" role="menuitem" onclick={() => apply('other')}>
			<span>{t('mail.moveToOther')}</span>
			<span class="hint">{t('mail.other')}</span>
		</button>
	</div>
</FloatPanel>

<style>
	.triage-split {
		position: relative;
		display: inline-flex;
		align-items: stretch;
		height: 28px;
		border-radius: 9999px;
		overflow: visible;
		flex-shrink: 0;
		background:
			var(--button-primary-bg) padding-box,
			var(--glass-shine) border-box;
		border: 1px solid transparent;
		box-sizing: border-box;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		pointer-events: auto;
	}

	.triage-split.compact {
		height: 32px;
	}

	.triage-main {
		margin: 0;
		padding: 0 12px 0 14px;
		border: 0;
		border-radius: 9999px 0 0 9999px;
		background: transparent;
		color: var(--button-primary-fg, var(--fg));
		font: inherit;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
		white-space: nowrap;
		line-height: 1;
		-webkit-tap-highlight-color: transparent;
	}

	.triage-main:hover {
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.triage-divider {
		width: 1px;
		align-self: stretch;
		margin: 0;
		background: color-mix(in srgb, var(--button-primary-fg, var(--fg)) 22%, transparent);
		flex-shrink: 0;
	}

	.triage-chevron {
		width: 28px;
		margin: 0;
		padding: 0 8px 0 4px;
		border: 0;
		border-radius: 0 9999px 9999px 0;
		display: grid;
		place-items: center;
		background: transparent;
		color: color-mix(in srgb, var(--button-primary-fg, var(--fg)) 55%, transparent);
		cursor: pointer;
		line-height: 0;
		box-sizing: border-box;
		-webkit-tap-highlight-color: transparent;
	}

	.triage-chevron:hover {
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		color: var(--button-primary-fg, var(--fg));
	}

	.dropdown-list {
		display: flex;
		flex-direction: column;
		padding: 4px 0;
	}

	.dropdown-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		padding: 10px 14px;
		border: 0;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.dropdown-item:hover {
		background: var(--fg-4);
	}

	.hint {
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
	}
</style>
