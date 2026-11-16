<script>
	/**
	 * List chrome title for Mail — Inbox/Sent/… via design-system dropdown.
	 */
	import {
		MAIL_FOLDERS,
		mailFolderLabel,
		mailView,
		setMailFolder
	} from '$lib/mail-view.svelte.js';
	import { syncUi } from '$lib/sync-progress.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	let open = $state(false);
	/** @type {HTMLButtonElement | undefined} */
	let anchorEl = $state();

	const label = $derived(mailFolderLabel(mailView.folder) || t('mail.inbox'));

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	/** @param {import('$lib/mail-view.svelte.js').MailFolder} f */
	function pick(f) {
		setMailFolder(f);
		close();
	}
</script>

<div class="mail-title" class:titles-syncing={syncUi.active} aria-busy={syncUi.active || undefined}>
	<button
		type="button"
		class="title-btn desktop"
		bind:this={anchorEl}
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={toggle}
	>
		<span class="title-label">{label}</span>
		<svg class="chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path
				d="M3 4.5 6 7.5 9 4.5"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	<button
		type="button"
		class="title-btn mobile"
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={toggle}
	>
		<span class="mobile-name">{label}</span>
		<svg class="chev" width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path
				d="M3 4.5 6 7.5 9 4.5"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	{#if open}
		<button type="button" class="menu-scrim" aria-label={t('mail.closeMailboxMenu')} onclick={close}
		></button>
		<div class="folder-menu" role="listbox" aria-label={t('mail.mailbox')}>
			{#each MAIL_FOLDERS as f (f)}
				<button
					type="button"
					role="option"
					aria-selected={mailView.folder === f}
					class:on={mailView.folder === f}
					onclick={() => pick(f)}>{mailFolderLabel(f)}</button
				>
			{/each}
		</div>
	{/if}
</div>

<style>
	.mail-title {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 0;
		flex: 1;
	}

	.title-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.title-btn.desktop {
		height: 48px;
	}

	.title-btn.mobile {
		display: none;
		height: 44px;
	}

	.title-label {
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

	.chev {
		flex-shrink: 0;
		color: var(--fg-33);
		opacity: 0.85;
		transition: transform 0.15s ease;
	}

	.title-btn[aria-expanded='true'] .chev {
		transform: rotate(180deg);
	}

	.title-btn:hover .title-label,
	.title-btn:hover .mobile-name,
	.title-btn:hover .chev {
		color: var(--fg);
	}

	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.folder-menu {
		position: absolute;
		top: calc(100% + 2px);
		left: 0;
		z-index: 50;
		min-width: 168px;
		padding: 0;
		border: 1px solid var(--glass-border);
		border-radius: 12px;
		background: var(--glass);
		overflow: hidden;
		box-shadow: 0 8px 28px var(--shadow);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.folder-menu button {
		display: block;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.folder-menu button:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.folder-menu button:hover,
	.folder-menu button.on {
		background: var(--fg-4);
		color: var(--fg);
	}

	.folder-menu button.on {
		font-weight: 600;
	}

	@media (max-width: 767px) {
		.title-btn.desktop {
			display: none;
		}

		.title-btn.mobile {
			display: inline-flex;
			justify-content: center;
			width: 100%;
		}

		.folder-menu {
			top: calc(100% + 4px);
		}
	}

	@media (min-width: 768px) {
		.title-btn.mobile {
			display: none;
		}
	}
</style>
