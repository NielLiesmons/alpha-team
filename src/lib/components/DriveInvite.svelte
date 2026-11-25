<script>
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { actor } from '$lib/actor.svelte.js';
	import { encodeInvite, inviteShareUrl } from '$lib/drive/invite.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import { buildInviteSession, persistInviteSecrets } from '$lib/invite-bootstrap.js';
	import {
		canInvite,
		canManageMembers,
		ensureMembers,
		members,
		removeMember,
		upsertMember
	} from '$lib/members.svelte.js';
	import { generateMailboxPassword, provisionMailbox } from '$lib/stalwart-provision.js';

	import { mailDomain as spaceMailDomain } from '$lib/space-host.js';

	const mailDomain = $derived(spaceMailDomain());
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

	/** @type {string | null} */
	let editingEmail = $state(null);
	let editName = $state('');
	/** @type {'admin' | 'member'} */
	let editRole = $state('member');
	/** @type {'active' | 'invited' | 'disabled'} */
	let editStatus = $state('active');
	let editBusy = $state(false);
	let editMsg = $state('');

	/** Re-share invite for an existing member (no new account / mailbox). */
	/** @type {string | null} */
	let reshareEmail = $state(null);
	let resharePass = $state('');
	let resharePass2 = $state('');
	let reshareBusy = $state(false);
	let reshareMsg = $state('');
	let reshareLink = $state('');
	let reshareQr = $state('');

	const inviteEmail = $derived(
		inviteLocal.trim()
			? `${inviteLocal.trim().toLowerCase().replace(/@.*$/, '')}@${mailDomain}`
			: ''
	);

	const sortedMembers = $derived(
		[...members].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
	);

	onMount(() => {
		void ensureMembers().catch(() => {});
	});

	function clearNewInviteOutput() {
		qrDataUrl = '';
		inviteLink = '';
		lastMailboxPw = '';
	}

	async function makeMemberInvite() {
		shareMsg = '';
		clearNewInviteOutput();
		if (!inviter) {
			shareMsg = 'Only owners and admins can invite.';
			return;
		}
		if (!inviteName.trim()) {
			shareMsg = 'Enter a display name.';
			return;
		}
		if (!inviteEmail.includes('@')) {
			shareMsg = `Enter a mailbox local-part (e.g. alex → alex@${mailDomain}).`;
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
			if (!provision.ok && !provision.deferred) {
				throw new Error(provision.error || 'Mailbox provision failed');
			}
			await persistInviteSecrets(inviteEmail, mailboxPassword);
			const session = await buildInviteSession({
				email: inviteEmail,
				displayName: inviteName.trim(),
				role: inviteRole,
				mailboxPassword
			});
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

	/** @param {{ email: string, name: string, role: 'owner'|'admin'|'member', status?: 'active'|'invited'|'disabled' }} m */
	function startEdit(m) {
		editingEmail = m.email;
		editName = m.name;
		/* UI: owner collapses to admin (crown); no separate owner label. */
		editRole = m.role === 'member' ? 'member' : 'admin';
		editStatus = m.status || 'active';
		editMsg = '';
		reshareEmail = null;
	}

	function cancelEdit() {
		editingEmail = null;
		editMsg = '';
	}

	async function saveEdit() {
		if (!editingEmail) return;
		editBusy = true;
		editMsg = '';
		try {
			await upsertMember({
				email: editingEmail,
				name: editName.trim() || editingEmail.split('@')[0] || editingEmail,
				role: editRole,
				status: editStatus
			});
			editMsg = 'Saved.';
			editingEmail = null;
		} catch (e) {
			editMsg = e instanceof Error ? e.message : String(e);
		} finally {
			editBusy = false;
		}
	}

	/** @param {{ email: string, name: string }} m */
	async function onDelete(m) {
		const label = m.name || m.email;
		if (!confirm(`Delete ${label} (${m.email}) from this Space?`)) return;
		shareMsg = '';
		editMsg = '';
		try {
			await removeMember(m.email, { actorEmail: actor.email });
			if (editingEmail === m.email) editingEmail = null;
			if (reshareEmail === m.email) closeReshare();
		} catch (e) {
			shareMsg = e instanceof Error ? e.message : String(e);
		}
	}

	/** @param {{ email: string, name: string }} m */
	function startReshare(m) {
		reshareEmail = m.email;
		resharePass = '';
		resharePass2 = '';
		reshareMsg = '';
		reshareLink = '';
		reshareQr = '';
		editingEmail = null;
		clearNewInviteOutput();
	}

	function closeReshare() {
		reshareEmail = null;
		resharePass = '';
		resharePass2 = '';
		reshareMsg = '';
		reshareLink = '';
		reshareQr = '';
	}

	async function makeReshareInvite() {
		if (!reshareEmail) return;
		reshareMsg = '';
		reshareLink = '';
		reshareQr = '';
		const m = members.find((x) => x.email === reshareEmail);
		if (!m) {
			reshareMsg = 'Member not found.';
			return;
		}
		if (!driveSession.connected) {
			reshareMsg = 'Connect Drive first.';
			return;
		}
		if (resharePass !== resharePass2) {
			reshareMsg = 'Passphrases do not match.';
			return;
		}
		if (resharePass.trim().length < 6) {
			reshareMsg = 'Passphrase must be at least 6 characters.';
			return;
		}
		reshareBusy = true;
		try {
			/* Existing account — full Team bootstrap (Drive + mailbox + pubs). */
			const session = await buildInviteSession({
				email: m.email,
				displayName: m.name,
				role: m.role === 'owner' ? 'admin' : m.role
			});
			if (!session.mailboxPassword) {
				reshareMsg =
					'No mailbox password on Drive for this member yet — open their profile Mail settings once, or create a fresh invite.';
				return;
			}
			const payload = await encodeInvite(session, resharePass);
			reshareLink = inviteShareUrl(payload);
			reshareQr = await QRCode.toDataURL(reshareLink, {
				errorCorrectionLevel: 'L',
				margin: 1,
				width: 280,
				color: { dark: '#111111', light: '#ffffff' }
			});
			reshareMsg = `Code ready for ${m.email}. Share QR/link + passphrase — no new account was created.`;
		} catch (e) {
			reshareMsg = e instanceof Error ? e.message : String(e);
		} finally {
			reshareBusy = false;
		}
	}

	async function copyReshare() {
		if (!reshareLink) return;
		try {
			await navigator.clipboard.writeText(reshareLink);
			reshareMsg = 'Link copied — whisper the passphrase separately.';
		} catch {
			reshareMsg = 'Could not copy — select the link text manually.';
		}
	}
</script>

{#if operator}
	<section class="block">
		<p class="field-label">Members</p>
		<p class="hint">
			Edit people on this Space, delete them, or re-share an invite code for an existing profile
			(does not create a new account). Roles gate the Admin UI only — Drive still uses the shared
			space key.
		</p>
		<ul class="member-list">
			{#each sortedMembers as m (m.email)}
				<li class="member-row">
					<div class="m-main">
						<span class="m-name">{m.name}</span>
						<span class="m-email">{m.email}</span>
						<span class="m-meta">
							<span class="m-role">{m.role}</span>
							<span class="m-status">{m.status || 'active'}</span>
						</span>
					</div>
					<div class="m-actions">
						<button type="button" class="btn ghost sm" onclick={() => startEdit(m)}>Edit</button>
						<button type="button" class="btn ghost sm" onclick={() => startReshare(m)}
							>Share code</button
						>
						<button type="button" class="btn ghost sm" onclick={() => void onDelete(m)}
							>Delete</button
						>
					</div>

					{#if editingEmail === m.email}
						<div class="panel">
							<label class="row stack">
								<span>Display name</span>
								<input type="text" bind:value={editName} autocomplete="name" />
							</label>
							<label class="row stack">
								<span>Role</span>
								<select bind:value={editRole}>
									<option value="member">Member</option>
									<option value="admin">Admin</option>
								</select>
							</label>
							<label class="row stack">
								<span>Status</span>
								<select bind:value={editStatus}>
									<option value="active">Active</option>
									<option value="invited">Invited</option>
									<option value="disabled">Disabled</option>
								</select>
							</label>
							<div class="actions">
								<button type="button" class="btn" disabled={editBusy} onclick={() => void saveEdit()}
									>{editBusy ? 'Saving…' : 'Save'}</button
								>
								<button type="button" class="btn ghost" onclick={cancelEdit}>Cancel</button>
							</div>
							{#if editMsg}
								<p class="status">{editMsg}</p>
							{/if}
						</div>
					{/if}

					{#if reshareEmail === m.email}
						<div class="panel">
							<p class="hint tight">
								Re-share Drive access for <strong>{m.name}</strong> — same profile, no new mailbox.
							</p>
							<label class="row stack">
								<span>Passphrase</span>
								<input type="password" bind:value={resharePass} autocomplete="new-password" />
							</label>
							<label class="row stack">
								<span>Confirm</span>
								<input type="password" bind:value={resharePass2} autocomplete="new-password" />
							</label>
							<div class="actions">
								<button
									type="button"
									class="btn"
									disabled={reshareBusy || resharePass.trim().length < 6}
									onclick={() => void makeReshareInvite()}
								>
									{reshareBusy ? 'Encrypting…' : 'Make share code'}
								</button>
								{#if reshareLink}
									<button type="button" class="btn ghost" onclick={() => void copyReshare()}
										>Copy link</button
									>
								{/if}
								<button type="button" class="btn ghost" onclick={closeReshare}>Close</button>
							</div>
							{#if reshareLink}
								<p class="link-out">{reshareLink}</p>
							{/if}
							{#if reshareQr}
								<figure class="qr-wrap">
									<img src={reshareQr} alt="Re-share invite QR" width="280" height="280" />
								</figure>
							{/if}
							{#if reshareMsg}
								<p class="status">{reshareMsg}</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if driveSession.connected && inviter}
	<section class="block">
		<p class="field-label">Invite someone new</p>
		<p class="hint">
			Creates a <strong>new</strong> profile + mailbox password inside the invite. For an existing
			person, use <strong>Share code</strong> on their row above instead.
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
					placeholder="alex"
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
				onclick={() => void makeMemberInvite()}
			>
				{shareBusy ? 'Encrypting…' : 'Make invite QR'}
			</button>
			{#if inviteLink}
				<button type="button" class="btn ghost" onclick={() => void copyInvite()}>Copy link</button>
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
		max-width: 560px;
		margin-bottom: 1.75rem;
	}

	.hint {
		margin: 0 0 0.85rem;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--white66);
	}

	.hint.tight {
		margin-bottom: 0.65rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
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
	.row select {
		width: 100%;
		height: 2.25rem;
		padding: 0 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: var(--surface);
		color: var(--white);
		font: inherit;
		font-weight: 400;
		box-sizing: border-box;
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
		font-size: 0.8125rem;
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

	.member-row {
		padding: 0.75rem 0.85rem;
		border-top: 1px solid var(--white11);
	}

	.member-row:first-child {
		border-top: none;
	}

	.m-main {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.15rem 0.75rem;
	}

	.m-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--white);
	}

	.m-email {
		grid-column: 1;
		font-size: 0.75rem;
		color: var(--white66);
	}

	.m-meta {
		grid-column: 2;
		grid-row: 1 / span 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		gap: 0.15rem;
	}

	.m-role,
	.m-status {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--white66);
	}

	.m-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.55rem;
	}

	.panel {
		margin-top: 0.75rem;
		padding: 0.75rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: color-mix(in srgb, var(--fg) 4%, transparent);
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
		font-size: 0.875rem;
		cursor: pointer;
	}

	.btn.sm {
		height: 1.85rem;
		padding: 0 0.65rem;
		font-size: 0.75rem;
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
		font-size: 0.8125rem;
		color: var(--white66);
	}

	.status.on {
		color: var(--accent, var(--white));
	}

	.status code {
		font-size: 0.75rem;
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
		font-size: 0.75rem;
		line-height: 1.4;
		word-break: break-all;
		color: var(--white66);
	}
</style>
