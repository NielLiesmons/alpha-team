<script>
	import { appBoot } from '$lib/boot.svelte.js';
	import { recoverAppShell } from '$lib/boot-recovery.js';
	import { t } from '$lib/i18n.svelte.js';
	import MetaballLoader from '@alpha/ui/MetaballLoader.svelte';

	let recovering = $state(false);

	const showRecovery = $derived(Boolean(appBoot.stuck || appBoot.error));

	async function reloadShell() {
		recovering = true;
		try {
			await recoverAppShell({ full: false });
		} catch {
			location.reload();
		}
	}

	async function resetShell() {
		recovering = true;
		try {
			await recoverAppShell({ full: true });
		} catch {
			location.reload();
		}
	}
</script>

<main
	class="splash"
	aria-busy={!showRecovery}
	aria-label={showRecovery ? t('boot.troubleTitle') : t('common.loading')}
>
	{#if showRecovery}
		<div class="recover" role="alert">
			<p class="title">{t('boot.troubleTitle')}</p>
			<p class="body">{appBoot.error || t('boot.troubleBody')}</p>
			<button type="button" class="primary" disabled={recovering} onclick={() => void reloadShell()}>
				{recovering ? t('common.loading') : t('boot.reloadApp')}
			</button>
			<button type="button" class="ghost" disabled={recovering} onclick={() => void resetShell()}>
				{t('boot.resetLocal')}
			</button>
		</div>
	{:else}
		<div class="boot-loader">
			<MetaballLoader size={28} label={t('common.loading')} />
		</div>
	{/if}
</main>

<style>
	.splash {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px;
		background: var(--shell);
		box-sizing: border-box;
	}

	.boot-loader {
		--loader-ink: var(--fg-66, var(--white66, #aaa));
		color: var(--fg-66, var(--white66, #aaa));
	}

	.recover {
		width: min(360px, 100%);
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
		text-align: center;
	}

	.title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 650;
		color: var(--fg, var(--white));
	}

	.body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--fg-66, var(--white66));
	}

	.primary {
		height: 48px;
		border: 0;
		border-radius: 14px;
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
	}

	.primary:disabled,
	.ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.ghost {
		height: 40px;
		border: 0;
		background: transparent;
		color: var(--fg-33, var(--white33));
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}
</style>
