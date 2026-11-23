<script>
	import {
		dismissInstallCoach,
		promptInstall,
		pwaUi,
		shouldShowInstallCoach
	} from '$lib/pwa.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let open = $state(false);

	$effect(() => {
		open = shouldShowInstallCoach();
	});

	function dismiss() {
		dismissInstallCoach();
		open = false;
	}

	async function install() {
		await promptInstall();
		if (pwaUi.standalone) open = false;
	}
</script>

{#if open}
	<aside class="install-dock" role="dialog" aria-label={t('pwa.addToHome')}>
		<button type="button" class="dismiss" aria-label={t('welcome.notNow')} onclick={dismiss}>
			×
		</button>
		<p class="hint">{t('pwa.addToHome')}</p>
		{#if pwaUi.ios}
			<p class="ios-steps">{t('pwa.iosHint')}</p>
		{:else}
			<button type="button" class="install-cta" onclick={install} disabled={pwaUi.busy}>
				{t('welcome.install')}
			</button>
		{/if}
	</aside>
{/if}

<style>
	.install-dock {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: max(12px, env(safe-area-inset-bottom, 0px));
		z-index: 90;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
		padding: 16px 16px 14px;
		border-radius: 22px;
		background: var(--modal-bg, var(--glass-panel));
		backdrop-filter: blur(28px) saturate(1.35);
		-webkit-backdrop-filter: blur(28px) saturate(1.35);
		border: 1px solid var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		box-shadow: 0 12px 40px color-mix(in srgb, #000 28%, transparent);
		box-sizing: border-box;
		/* Never accent — quiet glass only */
		color: var(--fg);
	}

	/* Desktop: sit over the left nav column, not the whole viewport. */
	@media (min-width: 768px) {
		.install-dock {
			left: 12px;
			right: auto;
			width: min(268px, calc(var(--nav-w, 280px) - 24px));
			bottom: max(16px, env(safe-area-inset-bottom, 0px));
		}
	}

	.dismiss {
		position: absolute;
		top: 10px;
		right: 12px;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}

	.hint {
		margin: 0;
		padding-right: 28px;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.35;
		color: var(--fg);
	}

	.ios-steps {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.4;
		color: var(--fg-66);
	}

	.install-cta {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 44px;
		margin: 0;
		padding: 0 16px;
		border: none;
		border-radius: 999px;
		background: var(--button-primary-bg, var(--fg));
		background-color: var(--fg);
		color: var(--button-primary-fg, var(--bg));
		font: inherit;
		font-size: 15px;
		font-weight: 650;
		cursor: pointer;
	}

	.install-cta:disabled {
		opacity: 0.55;
		cursor: default;
	}
</style>
