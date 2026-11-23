<script>
	/**
	 * Cold invite / first-open gate: Space icon + name + loading copy.
	 * Prefer WelcomeGate progress morph; this remains a fallback shell.
	 */
	import { appBoot } from '$lib/boot.svelte.js';
	import { inviteFlow } from '$lib/invite-flow.svelte.js';
	import { space } from '$lib/sections.js';
	import { spaceIconUrl } from '$lib/space-brand.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	const title = $derived(
		String(appBoot.onboarding?.spaceName || space.name || '').trim() || t('invite.spaceFallback')
	);
	const body = $derived(t('invite.loadingSpace'));
	const iconSrc = $derived(spaceIconUrl());
	const pct = $derived(inviteFlow.progress > 0 ? inviteFlow.progress : null);
</script>

<main class="onboard" aria-busy="true" aria-label={body}>
	<div class="brand-mark" aria-hidden="true">
		<img class="space-icon" src={iconSrc} alt="" width="88" height="88" />
	</div>
	<div class="copy">
		<p class="empty-title">{title}</p>
		<p class="empty-body">{body}</p>
	</div>
	{#if pct != null}
		<div
			class="progress-bar"
			role="progressbar"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={pct}
		>
			<div class="progress-fill" style={`width: ${pct}%`}></div>
			<span class="progress-label">{body}</span>
			<span class="progress-pct">{pct}%</span>
		</div>
	{/if}
</main>

<style>
	.onboard {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20px;
		padding: 32px 24px;
		box-sizing: border-box;
		background: var(--shell, var(--bg));
		text-align: center;
	}

	.brand-mark {
		display: flex;
		justify-content: center;
	}

	.space-icon {
		width: 88px;
		height: 88px;
		border-radius: 999px;
		object-fit: cover;
		box-sizing: border-box;
		border: 1px solid var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
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

	.progress-bar {
		position: relative;
		width: min(320px, 100%);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		height: 48px;
		padding: 0 16px;
		border-radius: 14px;
		box-sizing: border-box;
		overflow: hidden;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg);
		text-align: left;
	}

	.progress-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--button-primary-bg, var(--fg-16));
		opacity: 0.85;
		transition: width 0.4s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
		pointer-events: none;
	}

	.progress-label,
	.progress-pct {
		position: relative;
		z-index: 1;
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
	}

	.progress-label {
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.progress-pct {
		color: var(--fg-66);
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}
</style>
