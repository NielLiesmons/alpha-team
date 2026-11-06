<script>
	import { onMount } from 'svelte';
	import ProfilePic from './ProfilePic.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { actor, clearActor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		deviceProfiles,
		removeDeviceProfile
	} from '$lib/device-profiles.svelte.js';
	import {
		clearMemberPicture,
		pictureUrlFor,
		setMemberPicture
	} from '$lib/avatar.svelte.js';
	import { health } from '$lib/drive/client.js';
	import { clearSession, driveSession, saveSession } from '$lib/drive/session.svelte.js';
	import {
		getMailboxPassword,
		setMailboxPassword,
		testMailboxLogin
	} from '$lib/jmap-mail.js';
	import { getAdminToken, setAdminToken } from '$lib/mail-api.js';
	import {
		canManageMembers,
		canManageSpace,
		memberFor,
		removeMember,
		upsertMember
	} from '$lib/members.svelte.js';
	import { refreshMail } from '$lib/mail.svelte.js';
	import {
		promptInstall,
		pwaUi,
		refreshPwaStatus,
		togglePush
	} from '$lib/pwa.svelte.js';
	import { clearLocalUiCache } from '$lib/ui-cache.js';
	import { setTheme, themeChoice } from '$lib/theme.svelte.js';
	import { forceClearSelection, refreshFromDrive } from '$lib/workspace.svelte.js';
	import { formatBytes, storageEstimate } from '$lib/offline-store.js';

	/** @type {{ sectionId: string, profileEmail?: string }} */
	let { sectionId, profileEmail = '' } = $props();

	/** Profile sheet target (may differ from signed-in actor when editing another card). */
	const targetEmail = $derived(
		String(profileEmail || actor.email || '')
			.trim()
			.toLowerCase()
	);
	const isSelf = $derived(targetEmail === String(actor.email || '').trim().toLowerCase());

	/** Operator power from the signed-in profile (not the edit target). */
	const operatorEmail = $derived.by(() => {
		const active = String(actor.email || '')
			.trim()
			.toLowerCase();
		if (canManageMembers(active)) return active;
		for (const p of deviceProfiles) {
			const e = String(p.email || '')
				.trim()
				.toLowerCase();
			if (canManageMembers(e)) return e;
		}
		return active;
	});

	const isOperator = $derived(canManageSpace(actor.email) || canManageSpace(operatorEmail));
	const canAdminMembers = $derived(
		canManageMembers(actor.email) || canManageMembers(operatorEmail)
	);
	const me = $derived(memberFor(targetEmail));
	/** @type {'admin' | 'member'} */
	let roleDraft = $state('member');
	let memberMsg = $state('');
	let memberBusy = $state(false);

	const choices = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];

	let nameDraft = $state('');
	let picBusy = $state(false);
	let picMsg = $state('');
	let nameMsg = $state('');
	let mailboxPw = $state('');
	let mailboxMsg = $state('');
	let mailboxBusy = $state(false);
	let apiTokenDraft = $state('');
	let apiTokenMsg = $state('');
	let url = $state(driveSession.url);
	let token = $state(driveSession.token);
	let rootKey = $state(driveSession.rootKey);
	let busy = $state(false);
	let msg = $state('');
	let advancedOpen = $state(false);
	let cacheBusy = $state(false);
	let cacheMsg = $state('');
	let storageLabel = $state('');

	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	$effect(() => {
		const m = memberFor(targetEmail);
		nameDraft = m?.name || displayNameFromEmail(targetEmail);
		roleDraft = m?.role === 'member' ? 'member' : 'admin';
	});

	$effect(() => {
		targetEmail;
		mailboxPw = getMailboxPassword(isSelf ? actor.email : targetEmail);
		mailboxMsg = '';
		picMsg = '';
		nameMsg = '';
		memberMsg = '';
	});

	async function saveRole() {
		memberMsg = '';
		const m = memberFor(targetEmail);
		if (!m || !canAdminMembers) return;
		memberBusy = true;
		try {
			await upsertMember({ ...m, role: roleDraft });
			memberMsg = 'Role saved.';
		} catch (err) {
			memberMsg = err instanceof Error ? err.message : String(err);
		} finally {
			memberBusy = false;
		}
	}

	async function deleteTargetMember() {
		const m = memberFor(targetEmail);
		if (!m || !canAdminMembers) return;
		const label = m.name || m.email;
		if (!confirm(`Delete ${label} (${m.email}) from this Space?`)) return;
		memberMsg = '';
		memberBusy = true;
		try {
			await removeMember(m.email, { actorEmail: operatorEmail || actor.email });
			memberMsg = 'Removed from Space.';
		} catch (err) {
			memberMsg = err instanceof Error ? err.message : String(err);
		} finally {
			memberBusy = false;
		}
	}

	async function disconnectThisProfile() {
		const email = targetEmail || activeEmailSafe();
		const label = displayNameFromEmail(email) || email || 'this profile';
		if (!confirm(`Disconnect ${label} on this device?`)) return;
		memberMsg = '';
		try {
			if (email) removeDeviceProfile(email);
			if (deviceProfiles.length === 0) {
				clearSession();
				clearActor();
				forceClearSelection();
				await refreshFromDrive();
			}
			memberMsg = 'Disconnected on this device.';
		} catch (err) {
			memberMsg = err instanceof Error ? err.message : String(err);
		}
	}

	function activeEmailSafe() {
		return String(actor.email || '')
			.trim()
			.toLowerCase();
	}

	onMount(() => {
		apiTokenDraft = getAdminToken();
		mailboxPw = getMailboxPassword(actor.email);
		void refreshPwaStatus();
		void storageEstimate().then((e) => {
			if (e.quota) storageLabel = `${formatBytes(e.usage)} / ${formatBytes(e.quota)}`;
		});
	});

	async function onTogglePush() {
		try {
			await togglePush(actor.email);
		} catch {
			/* pwaUi.message */
		}
	}

	async function saveName() {
		nameMsg = '';
		const m = memberFor(targetEmail);
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
			await setMemberPicture(targetEmail, file);
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
			await clearMemberPicture(targetEmail);
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
				mailboxMsg = `Stalwart OK for ${actor.email}.`;
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
				: 'Connected.';
		} catch (e) {
			msg = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function disconnectDrive() {
		clearSession();
		clearActor();
		await refreshFromDrive();
		token = '';
		rootKey = '';
		msg = 'Disconnected.';
	}

	async function clearCache() {
		cacheBusy = true;
		cacheMsg = '';
		try {
			const r = await clearLocalUiCache();
			cacheMsg = `Cleared ${r.clearedKeys.length || 0} cache keys + leaf DB. Reload to rehydrate.`;
		} catch (e) {
			cacheMsg = e instanceof Error ? e.message : String(e);
		} finally {
			cacheBusy = false;
		}
	}
</script>

{#if sectionId === 'profile'}
	<section class="block">
		<p class="field-label">
			Edit profile
			{#if !isSelf && targetEmail}
				<span class="target-email">{targetEmail}</span>
			{/if}
		</p>
		<div class="pic-row">
			<ProfilePic
				name={displayNameFromEmail(targetEmail) || me?.name}
				email={targetEmail}
				pictureUrl={pictureUrlFor(targetEmail)}
				size={64}
			/>
			<div class="pic-actions">
				<PrimaryButton size="sm" disabled={picBusy || !me} onclick={pickPicture}>
					{picBusy ? 'Uploading…' : me?.picture ? 'Change photo' : 'Set photo'}
				</PrimaryButton>
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
		{#if picMsg}<p class="status on">{picMsg}</p>{/if}
		<label class="row stack">
			<span>Display name</span>
			<input type="text" bind:value={nameDraft} autocomplete="nickname" disabled={!me} />
		</label>
		<div class="actions">
			<PrimaryButton size="sm" disabled={!me} onclick={saveName}>Save name</PrimaryButton>
		</div>
		{#if nameMsg}<p class="status">{nameMsg}</p>{/if}

		{#if canAdminMembers && me && me.role !== 'owner'}
			<hr class="rule" />
			<p class="field-label">Space role</p>
			<div class="seg" role="radiogroup" aria-label="Role">
				<button
					type="button"
					class:on={roleDraft === 'member'}
					role="radio"
					aria-checked={roleDraft === 'member'}
					onclick={() => (roleDraft = 'member')}>Member</button
				>
				<button
					type="button"
					class:on={roleDraft === 'admin'}
					role="radio"
					aria-checked={roleDraft === 'admin'}
					onclick={() => (roleDraft = 'admin')}>Admin</button
				>
			</div>
			<div class="actions">
				<PrimaryButton size="sm" disabled={memberBusy} onclick={() => void saveRole()}
					>{memberBusy ? 'Saving…' : 'Save role'}</PrimaryButton
				>
			</div>
			{#if !isSelf}
				<button
					type="button"
					class="btn danger"
					disabled={memberBusy}
					onclick={() => void deleteTargetMember()}
				>
					Delete from Space
				</button>
			{/if}
		{/if}

		<hr class="rule" />
		<button type="button" class="btn danger disconnect" onclick={() => void disconnectThisProfile()}>
			Disconnect {displayNameFromEmail(targetEmail) || 'profile'}
		</button>
		{#if memberMsg}<p class="status">{memberMsg}</p>{/if}
	</section>
{:else if sectionId === 'notifications'}
	<section class="block">
		<p class="field-label">Notifications</p>
		{#if pwaUi.standalone}
			<p class="hint">Running as an installed app — good for push and offline storage.</p>
		{:else if pwaUi.ios}
			<p class="hint">
				On iPhone: Safari → Share → Add to Home Screen, then open Alpha from the icon.
			</p>
		{:else}
			<p class="hint">Install Alpha for faster cold starts and notifications.</p>
		{/if}
		<div class="actions">
			{#if !pwaUi.standalone && (pwaUi.canInstall || !pwaUi.ios)}
				<PrimaryButton size="sm" onclick={() => promptInstall()}>
					{pwaUi.canInstall ? 'Install app' : 'How to install'}
				</PrimaryButton>
			{/if}
			<PrimaryButton size="sm" disabled={pwaUi.busy || !actor.email} onclick={onTogglePush}>
				{#if pwaUi.busy}
					Working…
				{:else if pwaUi.pushSubscribed}
					Disable notifications
				{:else}
					Enable notifications
				{/if}
			</PrimaryButton>
		</div>
		<p class="hint tight">
			Permission: {pwaUi.pushPermission}
			{#if pwaUi.pushSubscribed}· subscribed{/if}
		</p>
		{#if pwaUi.message}<p class="status on">{pwaUi.message}</p>{/if}
	</section>
{:else if sectionId === 'appearance'}
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
{:else if sectionId === 'storage'}
	<section class="block">
		<p class="field-label">Storage</p>
		<p class="hint">
			{#if storageLabel}
				This browser: {storageLabel}.
			{:else}
				Local caches speed up chat and workspace after the first load.
			{/if}
			{pwaUi.storagePersisted ? ' Kept on device.' : ''}
		</p>
		<div class="actions">
			<PrimaryButton size="sm" disabled={cacheBusy} onclick={clearCache}>
				{cacheBusy ? 'Clearing…' : 'Clear local UI cache'}
			</PrimaryButton>
		</div>
		<p class="hint tight">
			Drops chat feed snapshot + Drive leaf cache. Does not sign you out or remove profiles.
		</p>
		{#if cacheMsg}<p class="status on">{cacheMsg}</p>{/if}
	</section>
{:else if sectionId === 'mail'}
	<section class="block">
		<p class="field-label">Mail</p>
		<p class="hint">
			Mailbox password for the Space mail host (JMAP). Stored on this device for the active
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
			<PrimaryButton size="sm" disabled={mailboxBusy || !actor.email} onclick={saveMailboxPw}>
				{mailboxBusy ? 'Checking…' : 'Save & test'}
			</PrimaryButton>
		</div>
		{#if mailboxMsg}<p class="status on">{mailboxMsg}</p>{/if}
	</section>
{:else if sectionId === 'publications' && isOperator}
	<section class="block">
		<p class="field-label">Publications API</p>
		<p class="hint">Bearer token for welcome + newsletters. Stored only in this browser.</p>
		<label class="row stack">
			<span>Admin token</span>
			<input type="password" bind:value={apiTokenDraft} autocomplete="off" spellcheck="false" />
		</label>
		<div class="actions">
			<PrimaryButton size="sm" onclick={saveApiToken}>Save token</PrimaryButton>
		</div>
		{#if apiTokenMsg}<p class="status on">{apiTokenMsg}</p>{/if}
	</section>
{:else if sectionId === 'drive' && isOperator}
	<section class="block">
		<p class="field-label">Files</p>
		<p class="hint">
			{#if driveSession.connected}
				Space storage connected ({driveSession.url}). Manual credentials only for recovery.
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
				<PrimaryButton
					size="sm"
					disabled={busy || !token.trim() || !rootKey.trim()}
					onclick={connect}
				>
					{busy ? 'Connecting…' : driveSession.connected ? 'Reconnect' : 'Connect'}
				</PrimaryButton>
				{#if driveSession.connected}
					<button type="button" class="btn ghost" disabled={busy} onclick={disconnectDrive}
						>Disconnect</button
					>
				{/if}
			</div>
		{/if}
		{#if msg}<p class="status">{msg}</p>{/if}
	</section>
{:else}
	<p class="hint">Unknown section.</p>
{/if}

<style>
	.block {
		max-width: 520px;
	}
	.field-label {
		margin: 0 0 0.75rem;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--white66);
	}
	.hint {
		margin: 0 0 0.85rem;
		font-size: 13px;
		color: var(--white66);
	}
	.hint.tight {
		margin-top: -0.35rem;
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
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
		margin-bottom: 0.75rem;
		font-size: 14px;
		font-weight: 600;
	}
	.row span {
		color: var(--white66);
		font-weight: 500;
	}
	.row input {
		width: 100%;
		height: 2.25rem;
		padding: 0 0.65rem;
		border-radius: 999px;
		border: 1px solid var(--fg-8, var(--white11));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		color: var(--fg, var(--white));
		font: inherit;
		font-weight: 400;
		box-sizing: border-box;
		outline: none;
	}
	.row input::placeholder {
		color: var(--fg-33, var(--white33));
	}
	.row input:focus {
		outline: none;
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}
	.rule {
		border: 0;
		border-top: 1px solid var(--fg-8, var(--white11));
		margin: 1rem 0;
	}
	.target-email {
		display: block;
		margin-top: 0.2rem;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-66, var(--white66));
		text-transform: none;
		letter-spacing: 0;
	}
	.btn.ghost,
	.btn.danger {
		height: 2.25rem;
		padding: 0 1rem;
		font: inherit;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		box-sizing: border-box;
	}
	.btn.danger {
		width: 100%;
		margin-top: 0.35rem;
		border: 0;
		background-image: none;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg-66, var(--white66));
		border-radius: 999px;
	}
	.btn.danger:hover {
		color: var(--fg, var(--white));
	}
	.btn.danger.disconnect {
		margin-top: 0.25rem;
		min-height: 2.75rem;
		font-size: 15px;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0 0.75rem;
		flex-wrap: wrap;
	}
	.btn.ghost:disabled {
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
		color: var(--fg, var(--white));
	}
	.seg {
		display: flex;
		gap: 0.35rem;
		padding: 0.25rem;
		border-radius: 12px;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		border: 1px solid var(--white11);
	}
	.seg button {
		flex: 1;
		height: 2.1rem;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--white66);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--white);
		box-shadow: 0 1px 2px color-mix(in srgb, #000 18%, transparent);
	}
</style>
