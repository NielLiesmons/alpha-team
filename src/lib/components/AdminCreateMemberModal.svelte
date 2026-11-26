<script>
	/**
	 * Admin: create a Space member + invite QR inside DS Modal chrome.
	 */
	import { tick } from 'svelte';
	import QRCode from 'qrcode';
	import SegmentedControl from '@alpha/ui/SegmentedControl.svelte';
	import SheetTopbar from '@alpha/ui/SheetTopbar.svelte';
	import Modal from './Modal.svelte';
	import { actor } from '$lib/actor.svelte.js';
	import { encodeInvite, inviteShareUrl } from '$lib/drive/invite.js';
	import {
		buildInviteSession,
		readMailboxPassphrase,
		syncMailboxPassphrase
	} from '$lib/invite-bootstrap.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { canInvite, upsertMember } from '$lib/members.svelte.js';
	import { mailDomain as spaceMailDomain } from '$lib/space-host.js';
	import { t } from '$lib/i18n.svelte.js';
	import PasswordRevealField from './PasswordRevealField.svelte';
	import Copy from './icons/Copy.svelte';

	/** @type {{ open: boolean, onclose?: () => void }} */
	let { open = $bindable(false), onclose = () => {} } = $props();

	const inviter = $derived(canInvite(actor.email));
	const mailDomain = $derived(spaceMailDomain());

	/** @type {'form' | 'qr'} */
	let step = $state('form');
	let createName = $state('');
	let createLocal = $state('');
	/** @type {'admin' | 'member'} */
	let createRole = $state('member');
	let createPass = $state('');
	let busy = $state(false);
	let error = $state('');
	let qr = $state('');
	let inviteLink = $state('');
	/** Existing mailbox passphrase for this local-part (space-secrets) — skip re-entry. */
	let existingPass = $state('');
	let copied = $state(false);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let copiedTimer;

	/** @type {HTMLInputElement | undefined} */
	let focusEl = $state();

	const createEmail = $derived(
		createLocal.trim()
			? `${createLocal.trim().toLowerCase().replace(/@.*$/, '')}@${mailDomain}`
			: ''
	);
	const hasExistingPass = $derived(existingPass.trim().length >= 6);

	$effect(() => {
		if (!open) return;
		step = 'form';
		createName = '';
		createLocal = '';
		createRole = 'member';
		createPass = '';
		busy = false;
		error = '';
		qr = '';
		inviteLink = '';
		existingPass = '';
		copied = false;
		void tick().then(() => focusEl?.focus());
	});

	$effect(() => {
		if (!open) return;
		const email = createEmail;
		if (!email.includes('@') || !driveSession.connected) {
			existingPass = '';
			return;
		}
		let cancelled = false;
		void readMailboxPassphrase(email).then((pw) => {
			if (cancelled) return;
			existingPass = pw.trim().length >= 6 ? pw.trim() : '';
			if (existingPass) createPass = '';
		});
		return () => {
			cancelled = true;
		};
	});

	function close() {
		if (busy) return;
		open = false;
		onclose();
	}

	async function createProfile() {
		error = '';
		qr = '';
		inviteLink = '';
		copied = false;
		if (!inviter) {
			error = t('invite.onlyAdmins');
			return;
		}
		if (!driveSession.connected) {
			error = t('settings.connectDriveFirst');
			return;
		}
		if (!createName.trim()) {
			error = t('invite.enterName');
			return;
		}
		if (!createEmail.includes('@')) {
			error = t('invite.enterMailbox');
			return;
		}
		const reuse = hasExistingPass;
		const secret = reuse ? existingPass.trim() : createPass.trim();
		if (secret.length < 6) {
			error = t('invite.passphraseMin');
			return;
		}
		busy = true;
		try {
			/* Passphrase === mailbox password (Stalwart + redeem + JMAP). */
			const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
			await upsertMember({
				email: createEmail,
				name: createName.trim(),
				role: createRole,
				status: 'invited',
				invited_at: now
			});
			/** @type {{ deferred?: boolean }} */
			let synced = {};
			if (!reuse) {
				synced = await syncMailboxPassphrase(createEmail, secret, createName.trim());
			}
			const inviteSession = await buildInviteSession({
				email: createEmail,
				displayName: createName.trim(),
				role: createRole,
				mailboxPassword: secret
			});
			const payload = await encodeInvite(inviteSession, secret);
			inviteLink = inviteShareUrl(payload);
			qr = await QRCode.toDataURL(inviteLink, {
				errorCorrectionLevel: 'L',
				margin: 1,
				width: 280,
				color: { dark: '#111111', light: '#ffffff' }
			});
			step = 'qr';
			error = synced.deferred ? t('invite.deferredMailbox') : t('invite.readyHint');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function copyInviteLink() {
		if (!inviteLink) return;
		try {
			await navigator.clipboard.writeText(inviteLink);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => {
				copied = false;
			}, 1600);
		} catch {
			error = t('invite.copyFailed');
		}
	}
</script>

<Modal bind:open label={t('invite.createProfile')}>
	<div class="sheet">
		<SheetTopbar
			title={t('invite.createProfile')}
			trailing="none"
			closeLabel={t('common.close')}
			onclose={close}
		/>
		<div class="body">
			{#if step === 'form'}
				<p class="hint">{t('settings.createMemberHint')}</p>
				<label class="quiet">
					<span class="sr-only">{t('invite.displayName')}</span>
					<input
						bind:this={focusEl}
						class="field"
						type="text"
						bind:value={createName}
						autocomplete="name"
						placeholder={t('invite.displayName')}
					/>
				</label>
				<label class="quiet">
					<span class="sr-only">{t('invite.mailbox')}</span>
					<div class="local-row field">
						<input
							class="bare"
							type="text"
							bind:value={createLocal}
							autocomplete="off"
							spellcheck="false"
							placeholder={t('invite.mailboxHint')}
						/>
						<span class="domain">@{mailDomain}</span>
					</div>
				</label>
				<div class="seg-wrap">
					<SegmentedControl
						options={[
							{ value: 'member', label: t('settings.roleMember') },
							{ value: 'admin', label: t('settings.roleAdmin') }
						]}
						value={createRole}
						label={t('settings.spaceRole')}
						onchange={(next) => {
							createRole = /** @type {'admin' | 'member'} */ (next);
						}}
					/>
				</div>
				{#if hasExistingPass}
					<p class="hint">{t('invite.reusePassphrase')}</p>
					<button
						type="button"
						class="cta-block"
						disabled={busy || !createName.trim() || !createEmail.includes('@')}
						onclick={() => void createProfile()}
					>
						{busy ? '…' : t('invite.create')}
					</button>
				{:else}
					<div class="field-shell">
						<PasswordRevealField
							variant="bare"
							bind:value={createPass}
							autocomplete="new-password"
							placeholder={t('invite.passphrase')}
							onkeydown={(e) => e.key === 'Enter' && createProfile()}
						/>
						<button
							type="button"
							class="cta"
							disabled={busy || createPass.trim().length < 6}
							onclick={() => void createProfile()}
						>
							{busy ? '…' : t('invite.create')}
						</button>
					</div>
				{/if}
				{#if error}
					<p class="err" role="alert">{error}</p>
				{/if}
			{:else}
				<p class="hint">{error || t('invite.shareQr')}</p>
				{#if qr}
					<figure class="qr-wrap">
						<img src={qr} alt={t('invite.ready')} width="240" height="240" />
					</figure>
				{/if}
				{#if inviteLink}
					<p class="meta">{inviteLink}</p>
					<button type="button" class="copy-pill" onclick={() => void copyInviteLink()}>
						<Copy size={14} />
						<span>{copied ? t('invite.copied') : t('invite.copyLink')}</span>
					</button>
				{/if}
				<button
					type="button"
					class="ghost"
					onclick={() => {
						step = 'form';
						error = '';
						qr = '';
						inviteLink = '';
						copied = false;
					}}>{t('invite.createAnother')}</button
				>
			{/if}
		</div>
	</div>
</Modal>

<style>
	.sheet {
		display: flex;
		flex-direction: column;
		max-height: min(78vh, 640px);
		overflow: auto;
		box-sizing: border-box;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 4px 16px 20px;
		box-sizing: border-box;
	}

	.hint {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--fg-66, var(--white66));
	}

	.quiet {
		display: block;
		margin: 0;
	}

	.field,
	.field-shell {
		width: 100%;
		box-sizing: border-box;
		border-radius: 999px;
		border: 1px solid var(--fg-8, var(--hairline));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		color: var(--fg, var(--white));
		font: inherit;
		outline: none;
	}

	.field {
		height: 48px;
		padding: 0 16px;
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.field::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
	}

	.field:focus {
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.field-shell {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 48px;
		padding: 4px;
	}

	.field-shell:focus-within {
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.bare {
		flex: 1;
		min-width: 0;
		height: 40px;
		padding: 0 12px 0 14px;
		border: 0;
		background: transparent;
		color: var(--fg, var(--white));
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		outline: none;
	}

	.bare::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
	}

	.local-row {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 48px;
		padding: 0 14px 0 4px;
		border-radius: 999px;
	}

	.domain {
		flex-shrink: 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg-33, var(--white33));
	}

	.seg-wrap {
		margin: 0;
	}

	.cta {
		flex-shrink: 0;
		height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
		font: inherit;
		font-size: 0.875rem;
		font-weight: 650;
		cursor: pointer;
	}

	.cta:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.cta-block {
		height: 48px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
		font: inherit;
		font-size: 0.875rem;
		font-weight: 650;
		cursor: pointer;
	}

	.cta-block:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.copy-pill {
		align-self: center;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg-66, var(--white66));
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.12s ease;
	}

	.copy-pill:hover {
		transform: scale(1.04);
	}

	.ghost {
		border: 0;
		background: transparent;
		color: var(--fg-33, var(--white33));
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		padding: 4px;
		align-self: center;
	}

	.err {
		margin: 0;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}

	.qr-wrap {
		margin: 4px auto 0;
		padding: 10px;
		border-radius: 16px;
		background: #fff;
		width: fit-content;
	}

	.qr-wrap img {
		display: block;
		width: 220px;
		height: 220px;
	}

	.meta {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--fg-66, var(--white66));
		word-break: break-all;
		text-align: center;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
