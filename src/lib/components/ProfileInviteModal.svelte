<script>
	/**
	 * QR modal for profile access on another device (Drive reshare).
	 * `device` = own-profile “other devices” framing; `invite` = admin invite copy.
	 * If a mailbox passphrase already exists (space-secrets / local), mint immediately —
	 * do not ask the admin to type it again.
	 */
	import QRCode from 'qrcode';
	import Modal from './Modal.svelte';
	import SheetTopbar from '@alpha/ui/SheetTopbar.svelte';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import { encodeInvite, inviteShareUrl } from '$lib/drive/invite.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { buildInviteSession, readMailboxPassphrase, syncMailboxPassphrase } from '$lib/invite-bootstrap.js';
	import { t } from '$lib/i18n.svelte.js';
	import { memberFor } from '$lib/members.svelte.js';
	import PasswordRevealField from './PasswordRevealField.svelte';
	import Copy from './icons/Copy.svelte';

	/** @type {{ open: boolean, email: string, mode?: 'device' | 'invite', onclose?: () => void }} */
	let { open = $bindable(false), email = '', mode = 'device', onclose = () => {} } = $props();

	let pass = $state('');
	let busy = $state(false);
	let msg = $state('');
	let link = $state('');
	let qr = $state('');
	/** True while probing Drive/local for an existing passphrase. */
	let probing = $state(false);
	/** False only when we must collect a new passphrase (invite) or show missing (device). */
	let needsPassphrase = $state(false);
	let copied = $state(false);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let copiedTimer;

	const e = $derived(
		String(email || '')
			.trim()
			.toLowerCase()
	);
	const member = $derived(memberFor(e));
	const name = $derived(member?.name || displayNameFromEmail(e) || e);
	const isInvite = $derived(mode === 'invite');
	const modalLabel = $derived(
		isInvite ? t('settings.inviteModalTitle', { name }) : t('settings.deviceModalTitle')
	);
	const ready = $derived(Boolean(qr && link));

	$effect(() => {
		if (!open) return;
		pass = '';
		busy = false;
		msg = '';
		link = '';
		qr = '';
		copied = false;
		needsPassphrase = false;
		probing = true;
		const emailAtOpen = e;
		const inviteMode = isInvite;
		const connected = driveSession.connected;
		void (async () => {
			try {
				if (!emailAtOpen.includes('@')) {
					msg = t('settings.missingEmail');
					needsPassphrase = true;
					return;
				}
				if (!connected) {
					msg = t('settings.connectDriveFirst');
					needsPassphrase = true;
					return;
				}
				const existing = await readMailboxPassphrase(emailAtOpen);
				if (existing.trim().length >= 6) {
					await mintWithSecret(existing.trim(), {
						reuse: true,
						email: emailAtOpen,
						inviteMode
					});
					return;
				}
				if (inviteMode) {
					needsPassphrase = true;
					msg = '';
				} else {
					needsPassphrase = false;
					msg = t('settings.inviteMissingMailbox');
				}
			} catch (err) {
				msg = err instanceof Error ? err.message : String(err);
				needsPassphrase = inviteMode;
			} finally {
				probing = false;
			}
		})();
	});

	function close() {
		open = false;
		onclose();
	}

	/**
	 * @param {string} secret
	 * @param {{ reuse?: boolean, email?: string, inviteMode?: boolean }} [opts]
	 */
	async function mintWithSecret(secret, opts = {}) {
		const target = String(opts.email || e)
			.trim()
			.toLowerCase();
		const inviteMode = opts.inviteMode ?? isInvite;
		msg = '';
		link = '';
		qr = '';
		copied = false;
		if (!target.includes('@')) {
			msg = t('settings.missingEmail');
			return;
		}
		if (!driveSession.connected) {
			msg = t('settings.connectDriveFirst');
			return;
		}
		if (secret.length < 6) {
			msg = t('settings.passphraseTooShort');
			return;
		}
		busy = true;
		try {
			const mem = memberFor(target);
			const display =
				mem?.name || displayNameFromEmail(target) || name || target;
			const role = mem?.role === 'owner' ? 'admin' : mem?.role || 'member';
			/** @type {string} */
			let mailboxPassword;
			if (inviteMode) {
				if (!opts.reuse) {
					/* New passphrase — provision + space-secrets. */
					await syncMailboxPassphrase(target, secret, display);
				}
				mailboxPassword = secret;
			} else {
				mailboxPassword = await readMailboxPassphrase(target);
				if (!mailboxPassword) {
					msg = t('settings.inviteMissingMailbox');
					return;
				}
			}
			const inviteSession = await buildInviteSession({
				email: target,
				displayName: display,
				role,
				mailboxPassword
			});
			if (!inviteSession.mailboxPassword) {
				msg = t('settings.inviteMissingMailbox');
				return;
			}
			const payload = await encodeInvite(inviteSession, secret);
			link = inviteShareUrl(payload);
			qr = await QRCode.toDataURL(link, {
				errorCorrectionLevel: 'L',
				margin: 1,
				width: 280,
				color: { dark: '#111111', light: '#ffffff' }
			});
			msg = inviteMode
				? t('settings.inviteCodeReady', { email: target })
				: t('settings.deviceCodeReady');
			needsPassphrase = false;
		} catch (err) {
			msg = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function makeCode() {
		await mintWithSecret(pass.trim(), { reuse: false, inviteMode: isInvite });
	}

	async function copyLink() {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => {
				copied = false;
			}, 1600);
		} catch {
			msg = t('invite.copyFailed');
		}
	}
</script>

<Modal bind:open label={modalLabel}>
	<div class="invite-sheet">
		<SheetTopbar
			title={modalLabel}
			trailing="none"
			closeLabel={t('common.close')}
			onclose={close}
		/>
		<div class="invite-body">
			{#if probing || (busy && !ready && !needsPassphrase)}
				<p class="hint">{t('invite.encrypting')}</p>
			{:else if ready}
				<p class="hint">{msg}</p>
				<figure class="qr-wrap">
					<img
						src={qr}
						alt={isInvite ? t('settings.inviteQrAlt') : t('settings.deviceQrAlt')}
						width="220"
						height="220"
					/>
				</figure>
				{#if link}
					<p class="link-out">{link}</p>
					<button type="button" class="copy-pill" onclick={() => void copyLink()}>
						<Copy size={14} />
						<span>{copied ? t('invite.copied') : t('invite.copyLink')}</span>
					</button>
				{/if}
			{:else if needsPassphrase}
				<p class="hint">
					{isInvite ? t('settings.inviteModalHint') : t('settings.deviceModalHint')}
				</p>
				<div class="field-shell">
					<PasswordRevealField
						variant="bare"
						bind:value={pass}
						autocomplete="new-password"
						placeholder={t('settings.passphrase')}
						onkeydown={(ev) => ev.key === 'Enter' && makeCode()}
					/>
					<button
						type="button"
						class="cta"
						disabled={busy || pass.trim().length < 6}
						onclick={() => void makeCode()}
					>
						{busy ? '…' : t('common.continue')}
					</button>
				</div>
				{#if msg}
					<p class="status">{msg}</p>
				{/if}
			{:else}
				<p class="status">{msg || t('settings.inviteMissingMailbox')}</p>
			{/if}
		</div>
	</div>
</Modal>

<style>
	.invite-sheet {
		display: flex;
		flex-direction: column;
		max-height: min(78vh, 640px);
		overflow: auto;
		box-sizing: border-box;
	}

	.invite-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 4px 12px 16px;
		box-sizing: border-box;
	}

	.hint {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--fg-66, var(--white66));
	}

	.field-shell {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 48px;
		padding: 4px;
		border-radius: 999px;
		border: 1px solid var(--fg-8, var(--hairline));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		box-sizing: border-box;
	}

	.field-shell:focus-within {
		outline: none;
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
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

	.link-out {
		margin: 0;
		font-size: 0.75rem;
		word-break: break-all;
		color: var(--fg-66, var(--white66));
		text-align: center;
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

	.status {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}
</style>
