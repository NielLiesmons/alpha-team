<script>
	import { onMount } from 'svelte';
	import AddProfileSheet from '$lib/components/AddProfileSheet.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		clearMemberPicture,
		pictureUrlFor,
		setMemberPicture
	} from '$lib/avatar.svelte.js';
	import {
		deviceProfiles,
		removeDeviceProfile,
		switchDeviceProfile
	} from '$lib/device-profiles.svelte.js';
	import { health } from '$lib/drive/client.js';
	import {
		clearSession,
		driveSession,
		saveSession
	} from '$lib/drive/session.svelte.js';
	import {
		getMailboxPassword,
		setMailboxPassword,
		testMailboxLogin
	} from '$lib/jmap-mail.js';
	import { getAdminToken, setAdminToken } from '$lib/mail-api.js';
	import {
		canManageSpace,
		memberFor,
		roleFor,
		upsertMember
	} from '$lib/members.svelte.js';
	import { refreshMail } from '$lib/mail.svelte.js';
	import {
		promptInstall,
		pwaUi,
		refreshPwaStatus,
		togglePush
	} from '$lib/pwa.svelte.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';
	import { setTheme, themeChoice } from '$lib/theme.svelte.js';

	const isOperator = $derived(canManageSpace(actor.email));
	const myRole = $derived(roleFor(actor.email));
	const me = $derived(memberFor(actor.email));
	let addProfileOpen = $state(false);

	const choices = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];

	let nameDraft = $state('');
	let picBusy = $state(false);
	let picMsg = $state('');
	let nameMsg = $state('');

	let url = $state(driveSession.url);
	let token = $state(driveSession.token);
	let rootKey = $state(driveSession.rootKey);
	let busy = $state(false);
	let msg = $state('');
	let advancedOpen = $state(false);
	let apiTokenDraft = $state('');
	let apiTokenMsg = $state('');
	let mailboxPw = $state('');
	let mailboxMsg = $state('');
	let mailboxBusy = $state(false);

	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	$effect(() => {
		const m = memberFor(actor.email);
		nameDraft = m?.name || displayNameFromEmail(actor.email);
	});

	onMount(() => {
		apiTokenDraft = getAdminToken();
		mailboxPw = getMailboxPassword(actor.email);
		void refreshPwaStatus();
	});

	async function onTogglePush() {
		try {
			await togglePush(actor.email);
		} catch {
			/* message on pwaUi */
		}
	}

	$effect(() => {
		actor.email;
		mailboxPw = getMailboxPassword(actor.email);
		mailboxMsg = '';
		picMsg = '';
		nameMsg = '';
	});

	/** @param {string} email */
	function onSwitchProfile(email) {
		try {
			switchDeviceProfile(email);
		} catch (err) {
			nameMsg = err instanceof Error ? err.message : String(err);
		}
	}

	async function saveName() {
		nameMsg = '';
		const m = memberFor(actor.email);
		if (!m) {
			nameMsg = 'Unknown profile — ask an admin to add you to members.';
			return;
		}
		const name = nameDraft.trim() || m.email.split('@')[0] || m.email;
		try {
			await upsertMember({ ...m, name });
			nameMsg = 'Name saved.';
		} catch (err) {
			nameMsg = err instanceof Error ? err.message : String(err);
		}
	}

	function pickPicture() {
		fileInput?.click();
	}

	/** @param {Event} e */
	async function onPictureChosen(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		picBusy = true;
		picMsg = '';
		try {
			await setMemberPicture(actor.email, file);
			picMsg = 'Profile picture updated.';
		} catch (err) {
			picMsg = err instanceof Error ? err.message : String(err);
		} finally {
			picBusy = false;
		}
	}

	async function removePicture() {
		picBusy = true;
		picMsg = '';
		try {
			await clearMemberPicture(actor.email);
			picMsg = 'Profile picture removed.';
		} catch (err) {
			picMsg = err instanceof Error ? err.message : String(err);
		} finally {
			picBusy = false;
		}
	}

	function saveApiToken() {
		setAdminToken(apiTokenDraft);
		apiTokenMsg = 'Saved on this device.';
	}

	async function saveMailboxPw() {
		if (!actor.email) {
			mailboxMsg = 'Pick who you are first.';
			return;
		}
		mailboxBusy = true;
		mailboxMsg = '';
		try {
			if (mailboxPw.trim()) {
				await testMailboxLogin(actor.email, mailboxPw.trim());
				setMailboxPassword(actor.email, mailboxPw.trim());
				await refreshMail();
				mailboxMsg = `Stalwart OK for ${actor.email} — Mail tab will use JMAP.`;
			} else {
				setMailboxPassword(actor.email, '');
				mailboxMsg = 'Cleared mailbox password on this device.';
			}
		} catch (e) {
			mailboxMsg = e instanceof Error ? e.message : String(e);
		} finally {
			mailboxBusy = false;
		}
	}

	async function connect() {
		busy = true;
		msg = '';
		try {
			const session = {
				url: url.trim().replace(/\/$/, ''),
				token: token.trim(),
				rootKey: rootKey.trim()
			};
			const ok = await health(session);
			if (ok !== 'ok') throw new Error(`unexpected health: ${ok}`);
			saveSession(session);
			await refreshFromDrive();
			msg = driveSession.error
				? `Connected, but load failed: ${driveSession.error}`
				: 'Connected — Tasks load from Drive.';
		} catch (e) {
			msg = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function disconnect() {
		clearSession();
		await refreshFromDrive();
		token = '';
		rootKey = '';
		msg = 'Disconnected — this device is signed out.';
	}
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<div class="feed settings">
	<section class="block profile">
		<p class="field-label">Profile</p>

		{#if actor.email}
			<p class="identity">
				{displayNameFromEmail(actor.email)}
				<span class="muted">· {actor.email}</span>
				{#if myRole}<span class="muted">· {myRole}</span>{/if}
			</p>
		{/if}

		<div class="pic-row">
			<ProfilePic
				name={displayNameFromEmail(actor.email)}
				email={actor.email}
				pictureUrl={pictureUrlFor(actor.email)}
				size={64}
			/>
			<div class="pic-actions">
				<button type="button" class="btn primary" disabled={picBusy || !me} onclick={pickPicture}>
					{picBusy ? 'Uploading…' : me?.picture ? 'Change photo' : 'Set photo'}
				</button>
				{#if me?.picture}
					<button type="button" class="btn ghost" disabled={picBusy} onclick={removePicture}
						>Remove</button
					>
				{/if}
				<input
					bind:this={fileInput}
					type="file"
					accept="image/jpeg,image/png,image/webp,image/*"
					hidden
					onchange={onPictureChosen}
				/>
			</div>
		</div>
		{#if picMsg}
			<p class="status on">{picMsg}</p>
		{/if}
		{#if !me && actor.email}
			<p class="hint">Add this email to members before a photo can sync across devices.</p>
		{/if}

		<label class="row stack">
			<span>Display name</span>
			<input type="text" bind:value={nameDraft} autocomplete="nickname" disabled={!me} />
		</label>
		<div class="actions">
			<button type="button" class="btn primary" disabled={!me} onclick={saveName}>Save name</button>
		</div>
		{#if nameMsg}
			<p class="status on">{nameMsg}</p>
		{/if}
	</section>

	<section class="block">
		<p class="field-label">On this device</p>
		<p class="hint">
			Only profiles unlocked with an invite code appear here. Admins manage the family directory in
			Accounts.
		</p>
		<ul class="device-list">
			{#each deviceProfiles as p (p.email)}
				<li class:on={p.email === actor.email}>
					<button type="button" class="device-pick" onclick={() => onSwitchProfile(p.email)}>
						<ProfilePic
							name={displayNameFromEmail(p.email)}
							email={p.email}
							pictureUrl={pictureUrlFor(p.email)}
							size={36}
						/>
						<span class="device-meta">
							<span class="device-name">{displayNameFromEmail(p.email)}</span>
							<span class="device-email">{p.email}</span>
						</span>
						{#if p.email === actor.email}
							<span class="device-badge">Active</span>
						{/if}
					</button>
					{#if deviceProfiles.length > 1}
						<button
							type="button"
							class="btn ghost tiny"
							onclick={() => removeDeviceProfile(p.email)}
						>
							Remove
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		<div class="actions">
			<button type="button" class="btn primary" onclick={() => (addProfileOpen = true)}
				>Add profile with code</button
			>
		</div>
	</section>

	<section class="block">
		<p class="field-label">Appearance</p>
		<div class="seg" role="radiogroup" aria-label="Appearance">
			{#each choices as choice (choice.id)}
				<button
					type="button"
					class:on={themeChoice.value === choice.id}
					role="radio"
					aria-checked={themeChoice.value === choice.id}
					onclick={() => setTheme(choice.id)}
				>
					{choice.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="block">
		<p class="field-label">App & notifications</p>
		{#if pwaUi.standalone}
			<p class="hint">Running as an installed app — good for push and offline storage.</p>
		{:else if pwaUi.ios}
			<p class="hint">
				On iPhone: Safari → <b>Share</b> → <b>Add to Home Screen</b>, then open Alpha from the new
				icon (required before notifications work).
			</p>
		{:else}
			<p class="hint">Install Alpha to your home screen for faster cold starts and notifications.</p>
		{/if}

		<div class="actions">
			{#if !pwaUi.standalone && (pwaUi.canInstall || !pwaUi.ios)}
				<button type="button" class="btn primary" onclick={() => promptInstall()}>
					{pwaUi.canInstall ? 'Install app' : 'How to install'}
				</button>
			{/if}
			<button
				type="button"
				class="btn primary"
				disabled={pwaUi.busy || !actor.email}
				onclick={onTogglePush}
			>
				{#if pwaUi.busy}
					Working…
				{:else if pwaUi.pushSubscribed}
					Disable notifications
				{:else}
					Enable notifications
				{/if}
			</button>
		</div>

		<p class="hint tight">
			Permission: {pwaUi.pushPermission}
			{#if pwaUi.pushSubscribed}· subscribed on this device{/if}
			{#if !pwaUi.pushSupported}
				· push API not available here (use the Home Screen app on iOS)
			{/if}
		</p>

		{#if pwaUi.storageLabel}
			<p class="hint tight">
				Storage: {pwaUi.storageLabel}
				{pwaUi.storagePersisted ? ' · kept on device' : ' · requesting keep-on-device'}
			</p>
		{/if}

		{#if pwaUi.message}
			<p class="status on">{pwaUi.message}</p>
		{/if}
	</section>

	<section class="block">
		<p class="field-label">Mail</p>
		<p class="hint">
			Mailbox password for <code>mail.bley.farm</code> (JMAP). Stored on this device for the active
			profile.
		</p>
		<label class="row stack">
			<span>Password</span>
			<input
				type="password"
				bind:value={mailboxPw}
				autocomplete="current-password"
				spellcheck="false"
				disabled={!actor.email}
			/>
		</label>
		<div class="actions">
			<button
				type="button"
				class="btn primary"
				disabled={mailboxBusy || !actor.email}
				onclick={saveMailboxPw}
			>
				{mailboxBusy ? 'Checking…' : 'Save & test'}
			</button>
		</div>
		{#if mailboxMsg}
			<p class="status on">{mailboxMsg}</p>
		{/if}
	</section>

	{#if isOperator}
		<section class="block">
			<p class="field-label">Publications API</p>
			<p class="hint">
				Bearer token for welcome + newsletters. Stored only in this browser — admin/owner only.
			</p>
			<label class="row stack">
				<span>Admin token</span>
				<input type="password" bind:value={apiTokenDraft} autocomplete="off" spellcheck="false" />
			</label>
			<div class="actions">
				<button type="button" class="btn primary" onclick={saveApiToken}>Save token</button>
			</div>
			{#if apiTokenMsg}
				<p class="status on">{apiTokenMsg}</p>
			{/if}
		</section>

		<section class="block">
			<p class="field-label">Drive</p>
			<p class="hint">
				{#if driveSession.connected}
					Connected to {driveSession.url}. Manual credentials only for recovery.
				{:else}
					Not connected — add a profile with an invite code.
				{/if}
			</p>
			<button type="button" class="btn ghost" onclick={() => (advancedOpen = !advancedOpen)}>
				{advancedOpen ? 'Hide' : 'Show'} manual fields
			</button>
			{#if advancedOpen}
				<label class="row stack">
					<span>URL</span>
					<input type="url" bind:value={url} autocomplete="off" spellcheck="false" />
				</label>
				<label class="row stack">
					<span>API token</span>
					<input type="password" bind:value={token} autocomplete="off" spellcheck="false" />
				</label>
				<label class="row stack">
					<span>Root key</span>
					<input type="password" bind:value={rootKey} autocomplete="off" spellcheck="false" />
				</label>
				<div class="actions">
					<button
						type="button"
						class="btn primary"
						disabled={busy || !token.trim() || !rootKey.trim()}
						onclick={connect}
					>
						{busy ? 'Connecting…' : driveSession.connected ? 'Reconnect' : 'Connect'}
					</button>
					{#if driveSession.connected}
						<button type="button" class="btn ghost" disabled={busy} onclick={disconnect}
							>Disconnect</button
						>
					{/if}
				</div>
			{:else if driveSession.connected}
				<div class="actions">
					<button type="button" class="btn ghost" disabled={busy} onclick={disconnect}
						>Disconnect</button
					>
				</div>
			{/if}
			{#if msg}
				<p class="status">{msg}</p>
			{/if}
		</section>
	{/if}
</div>

<AddProfileSheet open={addProfileOpen} onclose={() => (addProfileOpen = false)} />

<style>
	.settings {
		padding-left: 16px;
		padding-right: 16px;
		box-sizing: border-box;
	}

	.device-list {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		border: 1px solid var(--white11);
		border-radius: 12px;
		overflow: hidden;
	}

	.device-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.55rem 0.45rem 0.35rem;
		border-top: 1px solid var(--white11);
	}

	.device-list li:first-child {
		border-top: none;
	}

	.device-list li.on {
		background: color-mix(in srgb, var(--accent, #3d7ea6) 10%, transparent);
	}

	.device-pick {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.35rem 0.4rem;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--white);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.device-meta {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.device-name {
		font-size: 14px;
		font-weight: 600;
	}

	.device-email {
		font-size: 12px;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.device-badge {
		margin-left: auto;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--accent, var(--white66));
	}

	.btn.tiny {
		height: 1.85rem;
		padding: 0 0.65rem;
		font-size: 12px;
		flex-shrink: 0;
	}

	.block {
		max-width: 520px;
		margin-bottom: 1.75rem;
	}

	.hint {
		margin: 0 0 0.85rem;
		font-size: 13px;
		color: var(--white66);
	}

	.hint.tight {
		margin-top: -0.35rem;
	}

	.identity {
		margin: 0 0 1rem;
		font-size: 15px;
		font-weight: 600;
		color: var(--white);
	}

	.muted {
		font-weight: 500;
		color: var(--white66);
	}

	.pic-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.pic-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
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

	.row input[type='url'],
	.row input[type='password'],
	.row input[type='text'] {
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

	.row select {
		width: 100%;
		height: 2.25rem;
		padding: 0 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: var(--surface);
		color: var(--white);
		font: inherit;
		box-sizing: border-box;
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

	.disclosure {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.65rem 0;
		border: 0;
		border-bottom: 1px solid var(--white11);
		background: transparent;
		color: var(--white);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.chev {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
		color: var(--white66);
	}

	.disclosure-body {
		padding-top: 1rem;
	}

	.disclosure-body :global(.block:last-child) {
		margin-bottom: 0;
	}
</style>
