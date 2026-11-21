<script>
	/**
	 * Add Profile — claim an invite on this device, or (operators) create a new Space profile.
	 * Field chrome: quiet grayscale shell, CTA inside the field, dismiss via scrim / ✕ (no Cancel).
	 */
	import { tick } from 'svelte';
	import QRCode from 'qrcode';
	import AlphaLogo from '$lib/components/icons/AlphaLogo.svelte';
	import { actor, setActiveEmail } from '$lib/actor.svelte.js';
	import { addDeviceProfile } from '$lib/device-profiles.svelte.js';
	import { health } from '$lib/drive/client.js';
	import { decodeInvite, encodeInvite, inviteShareUrl, isInvitePayload } from '$lib/drive/invite.js';
	import {
		applyInviteBootstrap,
		buildInviteSession,
		persistInviteSecrets
	} from '$lib/invite-bootstrap.js';
	import { driveSession, saveSession } from '$lib/drive/session.svelte.js';
	import { canInvite, markMemberJoined, upsertMember } from '$lib/members.svelte.js';
	import { generateMailboxPassword, provisionMailbox } from '$lib/stalwart-provision.js';
	import { mailDomain as spaceMailDomain } from '$lib/space-host.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {{ open: boolean, onclose?: () => void }} */
	let { open = false, onclose = () => {} } = $props();

	const inviter = $derived(canInvite(actor.email));
	const mailDomain = $derived(spaceMailDomain());

	/** @type {'create' | 'code' | 'password' | 'qr'} */
	let step = $state('code');
	let invitePayload = $state('');
	let invitePass = $state('');
	let createName = $state('');
	let createLocal = $state('');
	/** @type {'admin' | 'member'} */
	let createRole = $state('member');
	let createPass = $state('');
	let busy = $state(false);
	let error = $state('');
	let qr = $state('');
	let inviteLink = $state('');
	let mailboxPw = $state('');

	/** @type {HTMLInputElement | HTMLTextAreaElement | undefined} */
	let focusEl = $state();

	const createEmail = $derived(
		createLocal.trim()
			? `${createLocal.trim().toLowerCase().replace(/@.*$/, '')}@${mailDomain}`
			: ''
	);

	$effect(() => {
		if (!open) return;
		step = inviter ? 'create' : 'code';
		invitePayload = '';
		invitePass = '';
		createName = '';
		createLocal = '';
		createRole = 'member';
		createPass = '';
		busy = false;
		error = '';
		qr = '';
		inviteLink = '';
		mailboxPw = '';
		void tick().then(() => focusEl?.focus());
	});

	function dismiss() {
		if (busy) return;
		onclose();
	}

	function goPassword() {
		error = '';
		try {
			if (!isInvitePayload(invitePayload)) throw new Error('Not an Alpha invite');
			step = 'password';
			void tick().then(() => focusEl?.focus());
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function submitPassword() {
		error = '';
		busy = true;
		try {
			const session = await decodeInvite(invitePayload, invitePass);
			if (!session.email) {
				throw new Error('This invite has no profile — ask for a new member invite QR.');
			}
			const ok = await health(session);
			if (ok !== 'ok') throw new Error(`Drive health returned “${ok}”`);
			saveSession(session);
			addDeviceProfile({
				email: session.email,
				name: session.displayName || session.email.split('@')[0]
			});
			setActiveEmail(session.email);
			await applyInviteBootstrap(session);
			await refreshFromDrive();
			await markMemberJoined(session.email);
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function createProfile() {
		error = '';
		qr = '';
		inviteLink = '';
		mailboxPw = '';
		/* TODO i18n: deferred-mailbox invite message has no key yet */
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
		if (createPass.trim().length < 6) {
			error = t('invite.passphraseMin');
			return;
		}
		busy = true;
		try {
			const mailboxPassword = generateMailboxPassword();
			const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
			await upsertMember({
				email: createEmail,
				name: createName.trim(),
				role: createRole,
				status: 'invited',
				invited_at: now
			});
			const provision = await provisionMailbox({
				email: createEmail,
				password: mailboxPassword,
				displayName: createName.trim()
			});
			await persistInviteSecrets(createEmail, mailboxPassword);
			const inviteSession = await buildInviteSession({
				email: createEmail,
				displayName: createName.trim(),
				role: createRole,
				mailboxPassword
			});
			const payload = await encodeInvite(inviteSession, createPass);
			inviteLink = inviteShareUrl(payload);
			mailboxPw = mailboxPassword;
			qr = await QRCode.toDataURL(inviteLink, {
				errorCorrectionLevel: 'L',
				margin: 1,
				width: 280,
				color: { dark: '#111111', light: '#ffffff' }
			});
			step = 'qr';
			error = provision.deferred
				? 'Invite ready. Set the mailbox password in Stalwart once, then share QR + passphrase.'
				: t('invite.readyHint');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="scrim" role="presentation" onclick={dismiss}>
		<div
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label={t('settings.addProfile')}
			onclick={(e) => e.stopPropagation()}
		>
			<header class="head">
				<div class="mark" aria-hidden="true"><AlphaLogo size={36} /></div>
				<button type="button" class="icon-pill" aria-label={t('common.close')} disabled={busy} onclick={dismiss}
					>✕</button
				>
			</header>

			{#if step === 'create'}
				<p class="lead">{t('invite.createProfile')}</p>
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
				<div class="seg" role="radiogroup" aria-label={t('settings.spaceRole')}>
					<button
						type="button"
						class:on={createRole === 'member'}
						role="radio"
						aria-checked={createRole === 'member'}
						onclick={() => (createRole = 'member')}>{t('settings.roleMember')}</button
					>
					<button
						type="button"
						class:on={createRole === 'admin'}
						role="radio"
						aria-checked={createRole === 'admin'}
						onclick={() => (createRole = 'admin')}>{t('settings.roleAdmin')}</button
					>
				</div>
				<div class="field-shell">
					<input
						class="bare"
						type="password"
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
				{#if error}
					<p class="err" role="alert">{error}</p>
				{/if}
				<button type="button" class="ghost" onclick={() => (step = 'code')}>
					{t('invite.haveCode')}
				</button>
			{:else if step === 'code'}
				<p class="lead">{t('welcome.pasteInvite')}</p>
				<div class="field-shell tall">
					<textarea
						bind:this={focusEl}
						class="bare area"
						rows="2"
						bind:value={invitePayload}
						spellcheck="false"
						placeholder={t('invite.codeOrLink')}
						onkeydown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								goPassword();
							}
						}}
					></textarea>
					<button
						type="button"
						class="cta"
						disabled={!invitePayload.trim()}
						onclick={goPassword}
					>
						{t('common.continue')}
					</button>
				</div>
				{#if error}
					<p class="err" role="alert">{error}</p>
				{/if}
				{#if inviter}
					<button type="button" class="ghost" onclick={() => (step = 'create')}>
						{t('invite.createProfile')}
					</button>
				{/if}
			{:else if step === 'password'}
				<p class="lead">{t('invite.enterPassphrase')}</p>
				<div class="field-shell">
					<input
						bind:this={focusEl}
						class="bare"
						type="password"
						bind:value={invitePass}
						autocomplete="off"
						placeholder={t('invite.passphrase')}
						onkeydown={(e) => e.key === 'Enter' && submitPassword()}
					/>
					<button
						type="button"
						class="cta"
						disabled={busy || !invitePass.trim()}
						onclick={() => void submitPassword()}
					>
						{busy ? '…' : t('invite.add')}
					</button>
				</div>
				{#if error}
					<p class="err" role="alert">{error}</p>
				{/if}
				<button type="button" class="ghost" disabled={busy} onclick={() => (step = 'code')}
					>{t('common.back')}</button
				>
			{:else}
				<p class="lead">{error || t('invite.shareQr')}</p>
				{#if qr}
					<figure class="qr-wrap">
						<img src={qr} alt={t('invite.ready')} width="240" height="240" />
					</figure>
				{/if}
				{#if mailboxPw}
					<p class="meta">{t('invite.mailboxPasswordOnce')} <code>{mailboxPw}</code></p>
				{/if}
				{#if inviteLink}
					<p class="meta link">{inviteLink}</p>
				{/if}
				<button type="button" class="ghost" onclick={() => (step = 'create')}>{t('invite.createAnother')}</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: end center;
		padding: 16px;
		padding-bottom: max(16px, env(safe-area-inset-bottom));
		background: color-mix(in srgb, #000 45%, transparent);
		box-sizing: border-box;
	}

	@media (min-width: 768px) {
		.scrim {
			place-items: center;
		}
	}

	.sheet {
		width: min(400px, 100%);
		padding: 16px 18px 18px;
		border-radius: 20px;
		background: var(--bg);
		border: 1px solid var(--fg-8, var(--hairline));
		box-shadow: 0 20px 60px var(--shadow-strong);
		display: flex;
		flex-direction: column;
		gap: 12px;
		box-sizing: border-box;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.mark {
		display: grid;
		place-items: center;
		color: var(--fg, var(--white));
		flex: 1;
	}

	.icon-pill {
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		border: 0;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg-66, var(--white66));
		cursor: pointer;
		font: inherit;
		line-height: 1;
		flex-shrink: 0;
	}

	.lead {
		margin: 0;
		text-align: center;
		font-size: 14px;
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
		font-size: 15px;
		font-weight: 500;
	}

	.field::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
	}

	.field:focus {
		outline: none;
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.field-shell {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 48px;
		padding: 4px;
	}

	.field-shell.tall {
		align-items: flex-end;
		border-radius: 18px;
		min-height: 96px;
	}

	.field-shell:focus-within {
		outline: none;
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.bare {
		flex: 1;
		min-width: 0;
		height: 100%;
		min-height: 40px;
		padding: 0 12px 0 14px;
		border: 0;
		background: transparent;
		color: var(--fg, var(--white));
		font: inherit;
		font-size: 15px;
		font-weight: 500;
		outline: none;
		box-sizing: border-box;
	}

	.bare::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
	}

	.bare.area {
		padding: 10px 12px 10px 14px;
		min-height: 72px;
		resize: none;
		line-height: 1.4;
	}

	.local-row {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 48px;
		padding: 0 14px 0 4px;
		border-radius: 999px;
	}

	.local-row .bare {
		padding-left: 12px;
	}

	.domain {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33, var(--white33));
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
		font-size: 14px;
		font-weight: 650;
		cursor: pointer;
	}

	.cta:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.seg {
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		border: 1px solid var(--fg-8, var(--hairline));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
	}

	.seg button {
		flex: 1;
		height: 36px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-66, var(--white66));
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.seg button.on {
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg, var(--white));
	}

	.ghost {
		border: 0;
		background: transparent;
		color: var(--fg-33, var(--white33));
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		padding: 4px;
		align-self: center;
	}

	.ghost:hover {
		color: var(--fg-66, var(--white66));
	}

	.err {
		margin: 0;
		text-align: center;
		font-size: 13px;
		color: var(--fg-66, var(--white66));
	}

	.qr-wrap {
		margin: 0 auto;
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
		font-size: 12px;
		line-height: 1.4;
		color: var(--fg-66, var(--white66));
		word-break: break-all;
		text-align: center;
	}

	.meta.code,
	.meta code {
		font-size: 11px;
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
