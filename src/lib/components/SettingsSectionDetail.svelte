<script>
	import { onMount } from 'svelte';
	import ProfileInviteModal from './ProfileInviteModal.svelte';
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
	import { locale, localeChoices, setLocale, t } from '$lib/i18n.svelte.js';
	import { setTheme, themeChoice } from '$lib/theme.svelte.js';
	import { space } from '$lib/sections.js';
	import { setSpaceIcon, spaceIconUrl } from '$lib/space-brand.svelte.js';
	import { forceClearSelection, refreshFromDrive } from '$lib/workspace.svelte.js';
	import { formatBytes, storageEstimate } from '$lib/offline-store.js';

	/** @type {{ sectionId: string, profileEmail?: string }} */
	let { sectionId, profileEmail = '' } = $props();

	let deviceCodeOpen = $state(false);
	let deviceCodeMsg = $state('');

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

	const choices = $derived.by(() => {
		locale.value;
		return [
			{ id: 'system', label: t('settings.themeSystem') },
			{ id: 'light', label: t('settings.themeLight') },
			{ id: 'dark', label: t('settings.themeDark') }
		];
	});

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
	/** @type {HTMLInputElement | undefined} */
	let spaceIconInput = $state();
	let spaceIconBusy = $state(false);
	let spaceIconMsg = $state('');
	const spaceIconSrc = $derived(spaceIconUrl() || space.iconUrl);

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
			memberMsg = t('settings.roleSaved');
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
		if (!confirm(t('settings.confirmDeleteMember', { name: `${label} (${m.email})` }))) return;
		memberMsg = '';
		memberBusy = true;
		try {
			await removeMember(m.email, { actorEmail: operatorEmail || actor.email });
			memberMsg = t('settings.removedFromSpace');
		} catch (err) {
			memberMsg = err instanceof Error ? err.message : String(err);
		} finally {
			memberBusy = false;
		}
	}

	async function disconnectThisProfile() {
		const email = targetEmail || activeEmailSafe();
		const label = displayNameFromEmail(email) || email || t('common.someone');
		if (!confirm(t('settings.confirmDisconnect', { name: label }))) return;
		memberMsg = '';
		try {
			if (email) removeDeviceProfile(email);
			if (deviceProfiles.length === 0) {
				clearSession();
				clearActor();
				forceClearSelection();
				await refreshFromDrive();
			}
			memberMsg = t('settings.disconnectedDevice');
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
			nameMsg = t('settings.unknownProfile');
			return;
		}
		const name = nameDraft.trim() || m.email.split('@')[0] || m.email;
		try {
			await upsertMember({ ...m, name });
			nameMsg = t('settings.nameSaved');
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
			picMsg = t('settings.pictureUpdated');
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
			picMsg = t('settings.pictureRemoved');
		} catch (err) {
			picMsg = err instanceof Error ? err.message : String(err);
		} finally {
			picBusy = false;
		}
	}

	/** @param {Event} e */
	async function onSpaceIconPick(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		spaceIconBusy = true;
		spaceIconMsg = '';
		try {
			await setSpaceIcon(file);
			spaceIconMsg = t('settings.spaceIconUpdated');
		} catch (err) {
			spaceIconMsg = err instanceof Error ? err.message : String(err);
		} finally {
			spaceIconBusy = false;
		}
	}

	async function saveApiToken() {
		setAdminToken(apiTokenDraft);
		apiTokenMsg = t('settings.tokenSaved');
		try {
			const { upsertAdminTokenSecret } = await import('$lib/drive/space-secrets.js');
			await upsertAdminTokenSecret(apiTokenDraft);
		} catch (e) {
			console.warn('persist admin token', e);
		}
	}

	async function saveMailboxPw() {
		if (!actor.email) {
			mailboxMsg = t('settings.pickWhoFirst');
			return;
		}
		mailboxBusy = true;
		mailboxMsg = '';
		try {
			if (mailboxPw.trim()) {
				await testMailboxLogin(actor.email, mailboxPw.trim());
				setMailboxPassword(actor.email, mailboxPw.trim());
				try {
					const { upsertMailboxSecret } = await import('$lib/drive/space-secrets.js');
					await upsertMailboxSecret(actor.email, mailboxPw.trim());
				} catch (err) {
					console.warn('persist mailbox secret', err);
				}
				await refreshMail();
				mailboxMsg = t('settings.mailboxConnected');
			} else {
				setMailboxPassword(actor.email, '');
				mailboxMsg = t('settings.mailboxCleared');
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
				? t('settings.loadFailed', { error: driveSession.error })
				: t('settings.mailboxConnected');
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
		msg = t('settings.disconnected');
	}

	async function clearCache() {
		cacheBusy = true;
		cacheMsg = '';
		try {
			const r = await clearLocalUiCache();
			cacheMsg = t('settings.cacheCleared', { n: r.clearedKeys.length || 0 });
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
			{t('settings.editProfile')}
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
					{picBusy
						? t('common.uploading')
						: me?.picture
							? t('settings.changePhoto')
							: t('settings.setPhoto')}
				</PrimaryButton>
				{#if me?.picture}
					<button type="button" class="btn ghost" disabled={picBusy} onclick={removePicture}
						>{t('settings.removePhoto')}</button
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
			<span>{t('settings.displayName')}</span>
			<input type="text" bind:value={nameDraft} autocomplete="nickname" disabled={!me} />
		</label>
		<div class="actions">
			<PrimaryButton size="sm" disabled={!me} onclick={saveName}>{t('common.save')}</PrimaryButton>
		</div>
		{#if nameMsg}<p class="status">{nameMsg}</p>{/if}

		{#if canAdminMembers && me && me.role !== 'owner'}
			<hr class="rule" />
			<p class="field-label">{t('settings.spaceRole')}</p>
			<div class="seg" role="radiogroup" aria-label={t('settings.spaceRole')}>
				<button
					type="button"
					class:on={roleDraft === 'member'}
					role="radio"
					aria-checked={roleDraft === 'member'}
					onclick={() => (roleDraft = 'member')}>{t('settings.roleMember')}</button
				>
				<button
					type="button"
					class:on={roleDraft === 'admin'}
					role="radio"
					aria-checked={roleDraft === 'admin'}
					onclick={() => (roleDraft = 'admin')}>{t('settings.roleAdmin')}</button
				>
			</div>
			<div class="actions">
				<PrimaryButton size="sm" disabled={memberBusy} onclick={() => void saveRole()}
					>{memberBusy ? t('common.saving') : t('settings.saveRole')}</PrimaryButton
				>
			</div>
			{#if !isSelf}
				<button
					type="button"
					class="btn danger"
					disabled={memberBusy}
					onclick={() => void deleteTargetMember()}
				>
					{t('settings.deleteFromSpace')}
				</button>
			{/if}
		{/if}

		<hr class="rule" />
		<p class="field-label">{t('settings.otherDevices')}</p>
		<p class="hint">{t('settings.otherDevicesHint')}</p>
		<div class="actions">
			<PrimaryButton
				size="sm"
				disabled={!targetEmail || !driveSession.connected}
				onclick={() => {
					deviceCodeMsg = '';
					if (!driveSession.connected) {
						deviceCodeMsg = t('settings.connectDriveFirst');
						return;
					}
					deviceCodeOpen = true;
				}}
			>
				{t('settings.createDeviceCode')}
			</PrimaryButton>
		</div>
		{#if deviceCodeMsg}<p class="status">{deviceCodeMsg}</p>{/if}

		<hr class="rule" />
		<button type="button" class="btn danger disconnect" onclick={() => void disconnectThisProfile()}>
			{displayNameFromEmail(targetEmail)
				? t('settings.disconnectProfile', { name: displayNameFromEmail(targetEmail) })
				: t('settings.disconnectProfileFallback')}
		</button>
		{#if memberMsg}<p class="status">{memberMsg}</p>{/if}
	</section>
	<ProfileInviteModal bind:open={deviceCodeOpen} email={targetEmail} mode="device" />
{:else if sectionId === 'notifications'}
	<section class="block">
		<p class="field-label">{t('settings.notificationsTitle')}</p>
		{#if pwaUi.standalone}
			<p class="hint">{t('settings.notificationsHintStandalone')}</p>
		{:else if pwaUi.ios}
			<p class="hint">
				{t('settings.notificationsHintIos')}
			</p>
		{:else}
			<p class="hint">{t('settings.notificationsHintDefault')}</p>
		{/if}
		<div class="actions">
			{#if !pwaUi.standalone && (pwaUi.canInstall || !pwaUi.ios)}
				<PrimaryButton size="sm" onclick={() => promptInstall()}>
					{pwaUi.canInstall ? t('settings.installApp') : t('settings.howToInstall')}
				</PrimaryButton>
			{/if}
			<PrimaryButton size="sm" disabled={pwaUi.busy || !actor.email} onclick={onTogglePush}>
				{#if pwaUi.busy}
					{t('common.working')}
				{:else if pwaUi.pushSubscribed}
					{t('settings.disableNotifications')}
				{:else}
					{t('settings.enableNotifications')}
				{/if}
			</PrimaryButton>
		</div>
		<p class="hint tight">
			{t('settings.permission', { perm: pwaUi.pushPermission })}
			{#if pwaUi.pushSubscribed}· {t('settings.subscribed')}{/if}
		</p>
		{#if pwaUi.message}<p class="status on">{pwaUi.message}</p>{/if}
	</section>
{:else if sectionId === 'appearance'}
	<section class="block">
		{#if isOperator}
			<p class="field-label">{t('settings.spaceIcon')}</p>
			<p class="hint">{t('settings.spaceIconHint')}</p>
			<div class="space-icon-row">
				<img class="space-icon-preview" src={spaceIconSrc} alt="" width="56" height="56" />
				<div class="actions">
					<PrimaryButton
						size="sm"
						disabled={spaceIconBusy}
						onclick={() => spaceIconInput?.click()}
					>
						{spaceIconBusy ? t('common.uploading') : t('settings.changeSpaceIcon')}
					</PrimaryButton>
				</div>
			</div>
			<input
				bind:this={spaceIconInput}
				type="file"
				accept="image/png,image/webp,image/jpeg"
				hidden
				onchange={onSpaceIconPick}
			/>
			{#if spaceIconMsg}<p class="status on">{spaceIconMsg}</p>{/if}
		{/if}
		<p class="field-label">{t('settings.language')}</p>
		<div class="seg" role="radiogroup" aria-label={t('settings.language')}>
			{#each localeChoices as lang (lang.id)}
				<button
					type="button"
					class:on={locale.value === lang.id}
					role="radio"
					aria-checked={locale.value === lang.id}
					onclick={() => setLocale(lang.id)}
				>
					{lang.native}
				</button>
			{/each}
		</div>
		<p class="field-label">{t('settings.theme')}</p>
		<div class="seg" role="radiogroup" aria-label={t('settings.appearance')}>
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
		<p class="field-label">{t('settings.storageTitle')}</p>
		<p class="hint">
			{#if storageLabel}
				{t('settings.storageBrowser', { label: storageLabel })}
			{:else}
				{t('settings.storageHint')}
			{/if}
			{pwaUi.storagePersisted ? ` ${t('settings.storageKept')}` : ''}
		</p>
		<div class="actions">
			<PrimaryButton size="sm" disabled={cacheBusy} onclick={clearCache}>
				{cacheBusy ? t('settings.clearing') : t('settings.clearCache')}
			</PrimaryButton>
		</div>
		<p class="hint tight">
			{t('settings.clearCacheHint')}
		</p>
		{#if cacheMsg}<p class="status on">{cacheMsg}</p>{/if}
	</section>
{:else if sectionId === 'mail'}
	<section class="block">
		<p class="field-label">{t('settings.mailTitle')}</p>
		<p class="hint">
			{t('settings.mailHint')}
		</p>
		<label class="row stack">
			<span>{t('settings.password')}</span>
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
				{mailboxBusy ? t('settings.checking') : t('settings.saveAndTest')}
			</PrimaryButton>
		</div>
		{#if mailboxMsg}<p class="status on">{mailboxMsg}</p>{/if}
	</section>
{:else if sectionId === 'publications' && isOperator}
	<section class="block">
		<p class="field-label">{t('settings.publicationsTitle')}</p>
		<p class="hint">{t('settings.publicationsHint')}</p>
		<label class="row stack">
			<span>{t('settings.adminToken')}</span>
			<input type="password" bind:value={apiTokenDraft} autocomplete="off" spellcheck="false" />
		</label>
		<div class="actions">
			<PrimaryButton size="sm" onclick={saveApiToken}>{t('settings.saveToken')}</PrimaryButton>
		</div>
		{#if apiTokenMsg}<p class="status on">{apiTokenMsg}</p>{/if}
	</section>
{:else if sectionId === 'drive' && isOperator}
	<section class="block">
		<p class="field-label">{t('settings.filesTitle')}</p>
		<p class="hint">
			{#if driveSession.connected}
				{t('settings.driveConnected')} ({driveSession.url}).
			{:else}
				{t('settings.notConnected')}
			{/if}
		</p>
		<button type="button" class="btn ghost" onclick={() => (advancedOpen = !advancedOpen)}>
			{advancedOpen ? t('settings.hideManual') : t('settings.showManual')}
		</button>
		{#if advancedOpen}
			<label class="row stack">
				<span>{t('settings.url')}</span>
				<input type="url" bind:value={url} autocomplete="off" spellcheck="false" />
			</label>
			<label class="row stack">
				<span>{t('settings.apiToken')}</span>
				<input type="password" bind:value={token} autocomplete="off" spellcheck="false" />
			</label>
			<label class="row stack">
				<span>{t('settings.rootKey')}</span>
				<input type="password" bind:value={rootKey} autocomplete="off" spellcheck="false" />
			</label>
			<div class="actions">
				<PrimaryButton
					size="sm"
					disabled={busy || !token.trim() || !rootKey.trim()}
					onclick={connect}
				>
					{busy
						? t('common.connecting')
						: driveSession.connected
							? t('settings.reconnect')
							: t('settings.connect')}
				</PrimaryButton>
				{#if driveSession.connected}
					<button type="button" class="btn ghost" disabled={busy} onclick={disconnectDrive}
						>{t('settings.disconnect')}</button
					>
				{/if}
			</div>
		{/if}
		{#if msg}<p class="status">{msg}</p>{/if}
	</section>
{:else}
	<p class="hint">{t('settings.unknownSection')}</p>
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
	.space-icon-row {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 0.35rem 0 1rem;
	}
	.space-icon-preview {
		width: 56px;
		height: 56px;
		border-radius: 999px;
		object-fit: cover;
		box-sizing: border-box;
		border: 1px solid var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
		flex-shrink: 0;
	}
	.space-icon-row .actions {
		margin: 0;
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
		flex-wrap: wrap;
		gap: 0.35rem;
		padding: 0.25rem;
		margin-bottom: 1rem;
		border-radius: 12px;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		border: 1px solid var(--white11);
	}
	.seg button {
		flex: 1 1 4.5rem;
		min-width: 4.5rem;
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
