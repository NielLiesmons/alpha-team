<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { actor, displayNameFromEmail, setActiveEmail } from '$lib/actor.svelte.js';
	import { health } from '$lib/drive/client.js';
	import { decodeInvite, invitePayloadFromLocation } from '$lib/drive/invite.js';
	import { driveSession, saveSession } from '$lib/drive/session.svelte.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';

	/** @type {'invite' | 'manual'} */
	let mode = $state('invite');
	let email = $state(actor.email || '');
	let invitePayload = $state('');
	let invitePass = $state('');
	let fromLink = $state(false);
	let url = $state(driveSession.url || 'https://drive.bley.farm');
	let token = $state('');
	let rootKey = $state('');
	let busy = $state(false);
	let error = $state('');

	/** @type {HTMLInputElement | undefined} */
	let passInput = $state();

	const needsDrive = $derived(!driveSession.connected);
	const needsIdentity = $derived(driveSession.connected && !actor.email);

	function absorbInviteFromUrl() {
		const found =
			invitePayloadFromLocation($page.url) ||
			(typeof location !== 'undefined' ? invitePayloadFromLocation(location.href) : null);
		if (!found) return;
		invitePayload = found;
		fromLink = true;
		mode = 'invite';
	}

	onMount(() => {
		absorbInviteFromUrl();
		queueMicrotask(() => passInput?.focus());
	});

	$effect(() => {
		$page.url.href;
		absorbInviteFromUrl();
	});

	async function connectSession(session) {
		const ok = await health(session);
		if (ok !== 'ok') throw new Error(`Drive health returned “${ok}”`);
		saveSession(session);
		await refreshFromDrive();
		if (driveSession.error) throw new Error(driveSession.error);
		/* Drop invite from the address bar so a refresh does not re-offer it */
		if (typeof history !== 'undefined' && $page.url.pathname === '/join') {
			history.replaceState({}, '', '/');
		} else if (typeof history !== 'undefined' && $page.url.searchParams.has('i')) {
			history.replaceState({}, '', $page.url.pathname || '/');
		}
	}

	function commitEmail() {
		const next = email.trim().toLowerCase();
		if (!next.includes('@')) throw new Error('Enter your full email (e.g. sarah@bley.farm).');
		setActiveEmail(next);
	}

	async function submitInvite() {
		error = '';
		busy = true;
		try {
			commitEmail();
			const session = await decodeInvite(invitePayload, invitePass);
			await connectSession(session);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function submitManual() {
		error = '';
		busy = true;
		try {
			commitEmail();
			await connectSession({
				url: url.trim().replace(/\/$/, ''),
				token: token.trim(),
				rootKey: rootKey.trim()
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function submitIdentityOnly() {
		error = '';
		busy = true;
		try {
			commitEmail();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<main class="welcome">
	<div class="panel">
		<p class="brand">Bley</p>
		{#if needsIdentity}
			<h1>Who are you?</h1>
			<p class="lead">
				This device is connected to the Drive. Choose the mailbox you work as — used for Tasks,
				Notes, and later chat.
			</p>
			<label class="field">
				<span>Your email</span>
				<input type="email" bind:value={email} autocomplete="username" spellcheck="false" />
			</label>
			{#if error}
				<p class="err" role="alert">{error}</p>
			{/if}
			<button type="button" class="primary" disabled={busy || !email.trim()} onclick={submitIdentityOnly}>
				{busy ? 'Saving…' : `Continue as ${displayNameFromEmail(email.trim() || 'you')}`}
			</button>
		{:else if fromLink && needsDrive}
			<h1>Join Drive</h1>
			<p class="lead">
				Invite loaded from your link. Enter your email and the passphrase you were told — nothing
				else to paste.
			</p>
			<label class="field">
				<span>Your email</span>
				<input
					type="email"
					bind:value={email}
					autocomplete="username"
					spellcheck="false"
					placeholder="you@bley.farm"
				/>
			</label>
			<label class="field">
				<span>Passphrase</span>
				<input
					bind:this={passInput}
					type="password"
					bind:value={invitePass}
					autocomplete="off"
				/>
			</label>
			{#if error}
				<p class="err" role="alert">{error}</p>
			{/if}
			<button
				type="button"
				class="primary"
				disabled={busy || !email.trim() || !invitePass.trim()}
				onclick={submitInvite}
			>
				{busy ? 'Connecting…' : 'Connect'}
			</button>
			<p class="foot">Wrong link? Ask for a new Share Drive link from Settings.</p>
		{:else}
			<h1>Welcome</h1>
			<p class="lead">
				Connect this device to your family Drive. Credentials stay on this browser only — the
				server never sees your root key.
			</p>

			<label class="field">
				<span>Your email</span>
				<input
					type="email"
					bind:value={email}
					autocomplete="username"
					spellcheck="false"
					placeholder="you@bley.farm"
				/>
			</label>

			<div class="modes" role="tablist" aria-label="How to connect">
				<button
					type="button"
					class="mode"
					class:on={mode === 'invite'}
					role="tab"
					aria-selected={mode === 'invite'}
					onclick={() => (mode = 'invite')}
				>
					Invite
				</button>
				<button
					type="button"
					class="mode"
					class:on={mode === 'manual'}
					role="tab"
					aria-selected={mode === 'manual'}
					onclick={() => (mode = 'manual')}
				>
					Manual
				</button>
			</div>

			{#if mode === 'invite'}
				<label class="field">
					<span>Invite link or code</span>
					<textarea
						rows="3"
						bind:value={invitePayload}
						spellcheck="false"
						placeholder="Paste the join link…"
					></textarea>
				</label>
				<label class="field">
					<span>Passphrase</span>
					<input type="password" bind:value={invitePass} autocomplete="off" />
				</label>
				{#if error}
					<p class="err" role="alert">{error}</p>
				{/if}
				<button
					type="button"
					class="primary"
					disabled={busy || !email.trim() || !invitePayload.trim() || !invitePass.trim()}
					onclick={submitInvite}
				>
					{busy ? 'Connecting…' : 'Connect'}
				</button>
			{:else}
				<label class="field">
					<span>Drive URL</span>
					<input type="url" bind:value={url} autocomplete="off" spellcheck="false" />
				</label>
				<label class="field">
					<span>API token</span>
					<input type="password" bind:value={token} autocomplete="off" spellcheck="false" />
				</label>
				<label class="field">
					<span>Root key</span>
					<input type="password" bind:value={rootKey} autocomplete="off" spellcheck="false" />
				</label>
				{#if error}
					<p class="err" role="alert">{error}</p>
				{/if}
				<button
					type="button"
					class="primary"
					disabled={busy || !email.trim() || !token.trim() || !rootKey.trim()}
					onclick={submitManual}
				>
					{busy ? 'Connecting…' : 'Connect'}
				</button>
			{/if}

			{#if needsDrive}
				<p class="foot">Already set up elsewhere? Ask for a Share Drive link from Settings.</p>
			{/if}
		{/if}
	</div>
</main>

<style>
	.welcome {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		background: var(--shell);
		box-sizing: border-box;
	}

	.panel {
		width: min(420px, 100%);
		padding: 28px 24px 24px;
		border-radius: 20px;
		background: var(--bg);
		border: 1px solid var(--hairline);
		box-shadow: 0 16px 48px var(--shadow-strong);
		box-sizing: border-box;
	}

	.brand {
		margin: 0 0 18px;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--white33);
	}

	h1 {
		margin: 0 0 8px;
		font-size: 26px;
		font-weight: 650;
		letter-spacing: -0.03em;
		color: var(--white);
	}

	.lead {
		margin: 0 0 22px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--white66);
	}

	.modes {
		display: flex;
		gap: 4px;
		margin: 0 0 16px;
		padding: 4px;
		border-radius: 12px;
		background: var(--white4);
	}

	.mode {
		flex: 1;
		height: 34px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--white33);
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
	}

	.mode.on {
		background: var(--white8);
		color: var(--white);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
		font-size: 13px;
		font-weight: 500;
		color: var(--white66);
	}

	.field input,
	.field textarea {
		width: 100%;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid var(--hairline);
		background: var(--surface);
		color: var(--white);
		font: inherit;
		font-weight: 400;
		box-sizing: border-box;
	}

	.field input {
		height: 40px;
	}

	.field textarea {
		padding: 10px 12px;
		min-height: 72px;
		resize: vertical;
		line-height: 1.4;
	}

	.primary {
		width: 100%;
		height: 42px;
		margin-top: 8px;
		border: 1px solid transparent;
		border-radius: 12px;
		background:
			var(--button-primary-bg) padding-box,
			var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		transition: transform 0.2s var(--ease);
	}

	.primary:hover:not(:disabled) {
		transform: scale(1.015);
	}

	.primary:active:not(:disabled) {
		transform: scale(0.98);
	}

	.primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.err {
		margin: 0 0 4px;
		font-size: 13px;
		color: var(--accent);
	}

	.foot {
		margin: 16px 0 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--white33);
	}
</style>
