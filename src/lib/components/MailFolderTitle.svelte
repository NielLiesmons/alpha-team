<script>
	/**
	 * List chrome title for Mail — plain Inbox/Sent/… text (no chevron / dropdown).
	 * Folder picks live in the nav drawer children.
	 */
	import { mailFolderLabel, mailView } from '$lib/mail-view.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { mailUi } from '$lib/mail.svelte.js';
	import { isSectionSyncing } from '$lib/sync-progress.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import MetaballLoader from '@alpha/ui/MetaballLoader.svelte';

	const label = $derived(mailFolderLabel(mailView.folder) || t('mail.inbox'));
	const syncing = $derived(
		isSectionSyncing('mail') || mailUi.loading || driveSession.syncing
	);
</script>

<div class="mail-title" class:titles-syncing={syncing} aria-busy={syncing || undefined}>
	<div class="title-row desktop">
		<h1 class="title-label">{label}</h1>
		{#if syncing}
			<span class="title-loader"><MetaballLoader size="sm" label="Refreshing" /></span>
		{/if}
	</div>

	<div class="mobile-name-row mobile">
		<span class="mobile-name">{label}</span>
		{#if syncing}
			<span class="title-loader"><MetaballLoader size="sm" label="Refreshing" /></span>
		{/if}
	</div>
</div>

<style>
	.mail-title {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 0;
		flex: 1;
	}

	.title-row.desktop {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		height: 48px;
	}

	.mobile-name-row {
		display: none;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-width: 0;
		height: 44px;
		width: 100%;
	}

	.title-label {
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mobile-name {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.15;
		color: var(--fg-66);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title-loader {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		align-self: center;
		flex: 0 0 auto;
		line-height: 0;
		overflow: visible;
		padding-top: 2px;
		box-sizing: content-box;
		--loader-ink: var(--fg-66);
		color: var(--fg-66);
		opacity: 0.85;
		pointer-events: none;
	}

	@media (max-width: 767px) {
		.title-row.desktop {
			display: none;
		}

		.mobile-name-row {
			display: flex;
		}
	}

	@media (min-width: 768px) {
		.mobile-name-row {
			display: none;
		}
	}
</style>
