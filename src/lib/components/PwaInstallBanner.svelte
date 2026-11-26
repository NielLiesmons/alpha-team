<script>
	/**
	 * Quiet PWA install panel for the nav sidebar trail (with voice player).
	 * Not a page-bottom dock — stays in menu chrome so invitees can install without
	 * covering the feed.
	 */
	import {
		dismissInstallCoach,
		promptInstall,
		pwaUi,
		shouldShowInstallCoach
	} from '$lib/pwa.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let open = $state(false);
	/** iOS has no beforeinstallprompt — reveal Share steps after Install. */
	let showIosSteps = $state(false);

	$effect(() => {
		open = shouldShowInstallCoach();
		if (!open) showIosSteps = false;
	});

	function dismiss() {
		dismissInstallCoach();
		open = false;
		showIosSteps = false;
	}

	async function install() {
		if (pwaUi.ios && !pwaUi.canInstall) {
			showIosSteps = true;
			return;
		}
		await promptInstall();
		if (pwaUi.standalone) open = false;
	}
</script>

{#if open}
	<div class="sidebar-slot">
		<aside class="panel" role="group" aria-label={t('pwa.addToHome')}>
			<div class="panel-row">
				<p class="hint">{t('pwa.addToHome')}</p>
				<button type="button" class="dismiss" aria-label={t('welcome.notNow')} onclick={dismiss}>
					×
				</button>
			</div>
			{#if pwaUi.ios && showIosSteps}
				<p class="ios-steps">{t('pwa.iosHint')}</p>
			{/if}
			<button type="button" class="install-cta" onclick={install} disabled={pwaUi.busy}>
				{t('welcome.install')}
			</button>
		</aside>
	</div>
{/if}

<style>
	.sidebar-slot {
		flex-shrink: 0;
		min-width: 0;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		padding: 10px;
		border-radius: 14px;
		background: var(--fg-8);
		box-sizing: border-box;
		color: var(--fg);
	}

	.panel-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-width: 0;
	}

	.hint {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--fg);
	}

	.dismiss {
		flex: 0 0 auto;
		width: 28px;
		height: 28px;
		margin: -4px -4px 0 0;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-66);
		font-size: 1.125rem;
		line-height: 1;
		cursor: pointer;
	}

	.dismiss:hover {
		color: var(--fg);
	}

	.ios-steps {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.4;
		color: var(--fg-66);
	}

	/* Primary CTA: --button-primary-* (quiet ink-on-bg) — never solid --fg wash. */
	.install-cta {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 36px;
		margin: 0;
		padding: 0 14px;
		border: none;
		border-radius: 999px;
		background: var(--button-primary-bg, var(--fg-8));
		color: var(--button-primary-fg, var(--fg));
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 650;
		cursor: pointer;
	}

	.install-cta:disabled {
		opacity: 0.55;
		cursor: default;
	}

	@media (max-width: 767px) {
		.dismiss {
			width: 32px;
			height: 32px;
		}

		.install-cta {
			height: 40px;
			font-size: 0.875rem;
		}
	}
</style>
