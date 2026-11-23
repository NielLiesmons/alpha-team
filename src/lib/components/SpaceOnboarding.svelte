<script>
	/**
	 * Cold invite / first-open gate: Space name + loading copy + metaball.
	 * Never flash section empty states while chat/mail (and later entities) hydrate.
	 */
	import MetaballLoader from '@alpha/ui/MetaballLoader.svelte';
	import { appBoot } from '$lib/boot.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const title = $derived(
		String(appBoot.onboarding?.spaceName || '').trim() || t('invite.spaceFallback')
	);
	const body = $derived(t('invite.loadingSpace'));
</script>

<main class="onboard" aria-busy="true" aria-label={body}>
	<div class="copy">
		<p class="empty-title">{title}</p>
		<p class="empty-body">{body}</p>
	</div>
	<div class="loader">
		<MetaballLoader size={28} label={body} />
	</div>
</main>

<style>
	.onboard {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 28px;
		padding: 32px 24px;
		box-sizing: border-box;
		background: var(--shell, var(--bg));
		text-align: center;
	}

	.copy {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		max-width: 22rem;
	}

	.empty-title {
		margin: 0;
		font-size: 1.65rem;
		font-weight: 650;
		line-height: 1.2;
		color: var(--fg-33);
	}

	.empty-body {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		line-height: 1.4;
		color: var(--fg-16, var(--fg-33));
	}

	.loader {
		color: var(--fg-66);
	}
</style>
