<script>
	import QRCode from 'qrcode';
	import { activePerson, actor, setActiveEmail } from '$lib/actor.svelte.js';
	import { decodeInvite, encodeInvite } from '$lib/drive/invite.js';
	import { health } from '$lib/drive/client.js';
	import { driveSession, saveSession } from '$lib/drive/session.svelte.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';

	let sharePass = $state('');
	let sharePass2 = $state('');
	let qrDataUrl = $state('');
	let inviteText = $state('');
	let shareBusy = $state(false);
	let shareMsg = $state('');

	let importPayload = $state('');
	let importPass = $state('');
	let importBusy = $state(false);
	let importMsg = $state('');

	let emailDraft = $state(actor.email || '');

	$effect(() => {
		emailDraft = actor.email || emailDraft;
	});

	async function makeInvite() {
		shareMsg = '';
		qrDataUrl = '';
		inviteText = '';
		if (sharePass !== sharePass2) {
			shareMsg = 'Passphrases do not match.';
			return;
		}
		shareBusy = true;
		try {
			const session = {
				url: driveSession.url,
				token: driveSession.token,
				rootKey: driveSession.rootKey
			};
			const payload = await encodeInvite(session, sharePass);
			inviteText = payload;
			qrDataUrl = await QRCode.toDataURL(payload, {
				errorCorrectionLevel: 'M',
				margin: 2,
				width: 280,
				color: { dark: '#111111', light: '#ffffff' }
			});
			shareMsg = 'Show this QR to her phone. Tell her the passphrase out of band (or whisper it).';
		} catch (e) {
			shareMsg = e instanceof Error ? e.message : String(e);
		} finally {
			shareBusy = false;
		}
	}

	async function copyInvite() {
		if (!inviteText) return;
		try {
			await navigator.clipboard.writeText(inviteText);
			shareMsg = 'Invite copied. Still needs the passphrase to open.';
		} catch {
			shareMsg = 'Could not copy — select the invite text manually.';
		}
	}

	async function importInvite() {
		importMsg = '';
		importBusy = true;
		try {
			const session = await decodeInvite(importPayload, importPass);
			const ok = await health(session);
			if (ok !== 'ok') throw new Error(`unexpected health: ${ok}`);
			saveSession(session);
			await refreshFromDrive();
			importMsg = driveSession.error
				? `Connected, but load failed: ${driveSession.error}`
				: 'Drive connected on this device. Set “I am …” to your email below.';
			importPayload = '';
			importPass = '';
			sharePass = '';
			sharePass2 = '';
			qrDataUrl = '';
			inviteText = '';
		} catch (e) {
			importMsg = e instanceof Error ? e.message : String(e);
		} finally {
			importBusy = false;
		}
	}

	function saveEmail() {
		const next = emailDraft.trim().toLowerCase();
		if (!next.includes('@')) {
			importMsg = 'Enter a full email (e.g. sarah@bley.farm).';
			return;
		}
		setActiveEmail(next);
		importMsg = `Signed in as ${activePerson().name} (${actor.email}).`;
	}
</script>

<section class="block">
	<p class="field-label">I am</p>
	<p class="hint">
		Your mailbox email is the account id for Tasks, Notes, comments, and chat. Drive access is
		separate — shared by the family via invite.
	</p>
	<label class="row stack">
		<span>Email</span>
		<input type="email" bind:value={emailDraft} autocomplete="username" spellcheck="false" />
	</label>
	<div class="actions">
		<button type="button" class="btn" onclick={saveEmail}>Save</button>
	</div>
	{#if actor.email}
		<p class="status on">{activePerson().name} · {actor.email}</p>
	{:else}
		<p class="status">Not set yet — pick your @bley.farm address.</p>
	{/if}
</section>

{#if driveSession.connected}
	<section class="block">
		<p class="field-label">Share Drive</p>
		<p class="hint">
			Creates a passphrase-wrapped QR of this device’s Drive session (URL + token + root key). She
			scans or pastes it on her phone, enters the same passphrase, then sets her own email above.
		</p>
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
				onclick={makeInvite}
			>
				{shareBusy ? 'Encrypting…' : 'Make QR'}
			</button>
			{#if inviteText}
				<button type="button" class="btn ghost" onclick={copyInvite}>Copy invite</button>
			{/if}
		</div>
		{#if qrDataUrl}
			<figure class="qr-wrap">
				<img src={qrDataUrl} alt="Drive invite QR code" width="280" height="280" />
			</figure>
		{/if}
		{#if shareMsg}
			<p class="status">{shareMsg}</p>
		{/if}
	</section>
{/if}

<section class="block">
	<p class="field-label">Join Drive</p>
	<p class="hint">
		On a new device: paste the invite (or the text from “Copy invite”), enter the passphrase, connect.
	</p>
	<label class="row stack">
		<span>Invite</span>
		<textarea rows="3" bind:value={importPayload} spellcheck="false" placeholder="alpha-drive-invite:v1:…"
		></textarea>
	</label>
	<label class="row stack">
		<span>Passphrase</span>
		<input type="password" bind:value={importPass} autocomplete="off" />
	</label>
	<div class="actions">
		<button
			type="button"
			class="btn"
			disabled={importBusy || !importPayload.trim() || !importPass.trim()}
			onclick={importInvite}
		>
			{importBusy ? 'Connecting…' : 'Import & connect'}
		</button>
	</div>
	{#if importMsg}
		<p class="status">{importMsg}</p>
	{/if}
</section>

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
	.row textarea {
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

	.row input {
		height: 2.25rem;
		padding-top: 0;
		padding-bottom: 0;
	}

	.row textarea {
		min-height: 4.5rem;
		resize: vertical;
		line-height: 1.4;
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
		background: var(--white);
		color: var(--black);
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
</style>
