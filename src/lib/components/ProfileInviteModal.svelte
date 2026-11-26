<script>
	/**
	 * QR modal for profile access on another device (Drive reshare).
	 * `device` = own-profile “other devices” framing; `invite` = admin invite copy.
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

	/** @type {{ open: boolean, email: string, mode?: 'device' | 'invite', onclose?: () => void }} */
	let { open = $bindable(false), email = '', mode = 'device', onclose = () => {} } = $props();

	let pass = $state('');
	let busy = $state(false);
	let msg = $state('');
	let link = $state('');
	let qr = $state('');

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

	$effect(() => {
		if (!open) return;
		pass = '';
		busy = false;
		msg = '';
		link = '';
		qr = '';
	});

	function close() {
		open = false;
		onclose();
	}

	async function makeCode() {
		msg = '';
		link = '';
		qr = '';
		if (!e.includes('@')) {
			msg = t('settings.missingEmail');
			return;
		}
		if (!driveSession.connected) {
			msg = t('settings.connectDriveFirst');
			return;
		}
		if (pass.trim().length < 6) {
			msg = t('settings.passphraseTooShort');
			return;
		}
		busy = true;
		try {
			const role = member?.role === 'owner' ? 'admin' : member?.role || 'member';
			const secret = pass.trim();
			/** @type {string} */
			let mailboxPassword;
			if (isInvite) {
				/* Invite QR: passphrase === mailbox password (provision + space-secrets). */
				await syncMailboxPassphrase(e, secret, name);
				mailboxPassword = secret;
			} else {
				/* Device code: encrypt with whisper; payload carries existing mailbox secret. */
				mailboxPassword = await readMailboxPassphrase(e);
				if (!mailboxPassword) {
					msg = t('settings.inviteMissingMailbox');
					return;
				}
			}
			const inviteSession = await buildInviteSession({
				email: e,
				displayName: name,
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
			msg = isInvite
				? t('settings.inviteCodeReady', { email: e })
				: t('settings.deviceCodeReady');
		} catch (err) {
			msg = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
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
			{#if qr}
				<figure class="qr-wrap">
					<img
						src={qr}
						alt={isInvite ? t('settings.inviteQrAlt') : t('settings.deviceQrAlt')}
						width="220"
						height="220"
					/>
				</figure>
			{/if}
			{#if link}
				<p class="link-out">{link}</p>
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

	.link-out {
		margin: 0;
		font-size: 0.75rem;
		word-break: break-all;
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

	.status {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}
</style>
