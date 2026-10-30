<script>
	import QRCode from 'qrcode';
	import { actor } from '$lib/actor.svelte.js';
	import { encodeInvite, inviteShareUrl } from '$lib/drive/invite.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		canInvite,
		canManageMembers,
		members,
		upsertMember
	} from '$lib/members.svelte.js';
	import { generateMailboxPassword, provisionMailbox } from '$lib/stalwart-provision.js';

	const mailDomain = 'bley.farm';
	const operator = $derived(canManageMembers(actor.email));
	const inviter = $derived(canInvite(actor.email));

	let inviteName = $state('');
	let inviteLocal = $state('');
	/** @type {'admin' | 'member'} */
	let inviteRole = $state('member');
	let sharePass = $state('');
	let sharePass2 = $state('');
	let qrDataUrl = $state('');
	let inviteLink = $state('');
	let lastMailboxPw = $state('');
	let shareBusy = $state(false);
	let shareMsg = $state('');

	const inviteEmail = $derived(
		inviteLocal.trim()
			? `${inviteLocal.trim().toLowerCase().replace(/@.*$/, '')}@${mailDomain}`
			: ''
	);

	async function makeMemberInvite() {
		shareMsg = '';
		qrDataUrl = '';
		inviteLink = '';
		lastMailboxPw = '';
		if (!inviter) {
			shareMsg = 'Only owners and admins can invite.';
			return;
		}
		if (!inviteName.trim()) {
			shareMsg = 'Enter a display name.';
			return;
		}
		if (!inviteEmail.includes('@')) {
			shareMsg = `Enter a mailbox local-part (e.g. sarah → sarah@${mailDomain}).`;
			return;
		}
		if (sharePass !== sharePass2) {
			shareMsg = 'Passphrases do not match.';
			return;
		}
		shareBusy = true;
		try {
			const mailboxPassword = generateMailboxPassword();
			const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
			await upsertMember({
				email: inviteEmail,
				name: inviteName.trim(),
				role: inviteRole,
				status: 'invited',
				invited_at: now
			});
			const provision = await provisionMailbox({
				email: inviteEmail,
				password: mailboxPassword,
				displayName: inviteName.trim()
			});
			const session = {
				url: driveSession.url,
				token: driveSession.token,
				rootKey: driveSession.rootKey,
				email: inviteEmail,
				displayName: inviteName.trim(),
				role: inviteRole,
				mailboxPassword
			};
			const payload = await encodeInvite(session, sharePass);
			inviteLink = inviteShareUrl(payload);
			lastMailboxPw = mailboxPassword;
			qrDataUrl = await QRCode.toDataURL(inviteLink, {
				errorCorrectionLevel: 'L',
				margin: 1,
				width: 280,
				color: { dark: '#111111', light: '#ffffff' }
			});
			shareMsg = provision.deferred
				? `Invite ready for ${inviteEmail}. Stalwart create is still manual for now — set this mailbox password there once, then share QR + passphrase. Invitee only types the passphrase.`
				: `Invite ready for ${inviteEmail}. Share the QR (or link) and whisper the passphrase.`;
		} catch (e) {
			shareMsg = e instanceof Error ? e.message : String(e);
		} finally {
			shareBusy = false;
		}
	}

	async function copyInvite() {
		if (!inviteLink) return;
		try {
			await navigator.clipboard.writeText(inviteLink);
			shareMsg = 'Link copied — send it, then tell them the passphrase separately.';
		} catch {
			shareMsg = 'Could not copy — select the link text manually.';
		}
	}

</script>

{#if operator}
	<section class="block">
		<p class="field-label">Members</p>
		<p class="hint">
			Roles gate the Admin UI only (ACL). Drive still uses the shared space key until per-person
			caps exist — don’t invite people you wouldn’t trust with this Space’s files.
		</p>
		<ul class="member-list">
			{#each members as m (m.email)}
				<li>
					<span class="m-name">{m.name}</span>
					<span class="m-email">{m.email}</span>
					<span class="m-role">{m.role}</span>
					<span class="m-status">{m.status || 'active'}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if driveSession.connected && inviter}
	<section class="block">
		<p class="field-label">Invite someone</p>
		<p class="hint">
			Creates a QR + link. They open it, type <strong>only the passphrase</strong> — email, role,
			Drive, and mailbox password are inside the invite.
		</p>
		<label class="row stack">
			<span>Display name</span>
			<input type="text" bind:value={inviteName} autocomplete="name" placeholder="Display name" />
		</label>
		<label class="row stack">
			<span>Mailbox</span>
			<div class="local-row">
				<input
					type="text"
					bind:value={inviteLocal}
					autocomplete="off"
					spellcheck="false"
					placeholder="sarah"
				/>
				<span class="domain">@{mailDomain}</span>
			</div>
		</label>
		<label class="row stack">
			<span>Role</span>
			<select bind:value={inviteRole}>
				<option value="member">Member — Drive, Mail, Chat (no operator Settings)</option>
				<option value="admin">Admin — can invite + space settings</option>
			</select>
		</label>
		<label class="row stack">
			<span>Passphrase</span>
			<input type="password" bind:value={sharePass} autocomplete="new-password" />
		</label>
		<label class="row stack">
			<span>Confirm</span>
			<input type="password" bind:value={sharePass2} autocomplete="new-password" />
		</label>
		<div class="actions">
			<button
				type="button"
				class="btn"
				disabled={shareBusy || sharePass.trim().length < 6}
				onclick={makeMemberInvite}
			>
				{shareBusy ? 'Encrypting…' : 'Make invite QR'}
			</button>
			{#if inviteLink}
				<button type="button" class="btn ghost" onclick={copyInvite}>Copy link</button>
			{/if}
		</div>
		{#if inviteLink}
			<p class="link-out">{inviteLink}</p>
		{/if}
		{#if lastMailboxPw}
			<p class="status on">
				Mailbox password (set once in Stalwart until API is wired):
				<code>{lastMailboxPw}</code>
			</p>
		{/if}
		{#if qrDataUrl}
			<figure class="qr-wrap">
				<img src={qrDataUrl} alt="Member invite QR code" width="280" height="280" />
			</figure>
		{/if}
		{#if shareMsg}
			<p class="status">{shareMsg}</p>
		{/if}
	</section>
{/if}

<style>
	.block {
		max-width: 520px;
		margin-bottom: 1.75rem;
	}

	.hint {
		margin: 0 0 0.85rem;
		font-size: 13px;
		color: var(--white66);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		font-size: 14px;
		font-weight: 600;
	}

	.row.stack {
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
	}

	.row span {
		min-width: 6.5rem;
		color: var(--white66);
		font-weight: 500;
	}

	.row input,
	.row textarea,
	.row select {
		width: 100%;
		padding: 0.55rem 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: var(--surface);
		color: var(--white);
		font: inherit;
		font-weight: 400;
		box-sizing: border-box;
	}

	.row input,
	.row select {
		height: 2.25rem;
		padding-top: 0;
		padding-bottom: 0;
	}

	.row textarea {
		min-height: 4.5rem;
		resize: vertical;
		line-height: 1.4;
	}

	.local-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.local-row input {
		flex: 1;
		min-width: 0;
	}

	.domain {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--white66);
	}

	.member-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--white11);
		border-radius: 12px;
		overflow: hidden;
	}

	.member-list li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.15rem 0.75rem;
		padding: 0.65rem 0.85rem;
		border-top: 1px solid var(--white11);
		font-size: 13px;
	}

	.member-list li:first-child {
		border-top: none;
	}

	.m-name {
		font-weight: 600;
		color: var(--white);
	}

	.m-email {
		grid-column: 1;
		color: var(--white66);
		font-size: 12px;
	}

	.m-role,
	.m-status {
		justify-self: end;
		align-self: center;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--white66);
	}

	.m-status {
		grid-column: 2;
		grid-row: 2;
	}

	.m-role {
		grid-column: 2;
		grid-row: 1;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0 0.75rem;
		flex-wrap: wrap;
	}

	.btn {
		height: 2.25rem;
		padding: 0 1rem;
		border-radius: 10px;
		border: none;
		background-image: var(--button-primary-bg);
		background-color: transparent;
		color: var(--whiteEnforced);
		font: inherit;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}

	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn.ghost {
		background-image: none;
		background: transparent;
		color: var(--white66);
		border: 1px solid var(--white11);
	}

	.status {
		margin: 0.25rem 0 0;
		font-size: 13px;
		color: var(--white66);
	}

	.status.on {
		color: var(--accent, var(--white));
	}

	.status code {
		font-size: 12px;
		word-break: break-all;
	}

	.qr-wrap {
		margin: 0.75rem 0 0;
		padding: 12px;
		display: inline-block;
		border-radius: 16px;
		background: #fff;
		border: 1px solid var(--hairline);
	}

	.qr-wrap img {
		display: block;
		border-radius: 4px;
	}

	.link-out {
		margin: 0.35rem 0 0.75rem;
		padding: 0.55rem 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: var(--surface);
		font-size: 12px;
		line-height: 1.4;
		word-break: break-all;
		color: var(--white66);
	}
</style>
