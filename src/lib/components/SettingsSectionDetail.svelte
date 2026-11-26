<script>
	import SegmentedControl from '@alpha/ui/SegmentedControl.svelte';
	import Moon from '@alpha/ui/icons/Moon.svelte';
	import Sun from '@alpha/ui/icons/Sun.svelte';
	import ThemeSystem from '@alpha/ui/icons/ThemeSystem.svelte';
	import { onMount } from 'svelte';
	import AdminCreateMemberModal from './AdminCreateMemberModal.svelte';
	import PasswordRevealField from './PasswordRevealField.svelte';
	import ProfileInviteModal from './ProfileInviteModal.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import Crown from './icons/Crown.svelte';
	import Share from './icons/Share.svelte';
	import { actor, clearActor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import {
		deviceProfiles,
		removeDeviceProfile,
		switchDeviceProfile
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
		ensureMembers,
		memberFor,
		members,
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
	import { setUiScale, uiScaleChoice } from '$lib/ui-scale.svelte.js';
	import { space } from '$lib/sections.js';
	import { setSpaceIcon, spaceIconUrl } from '$lib/space-brand.svelte.js';
	import { setProfileTarget } from '$lib/settings-ui.svelte.js';
	import { forceClearSelection, refreshFromDrive, selectEntity } from '$lib/workspace.svelte.js';
	import { formatBytes, storageEstimate } from '$lib/offline-store.js';

	/** @type {{ sectionId: string, profileEmail?: string }} */
	let { sectionId, profileEmail = '' } = $props();

	/** Legacy bookmarks: advanced → admin */
	const sid = $derived(sectionId === 'advanced' ? 'admin' : sectionId);

	let deviceCodeOpen = $state(false);
	let deviceCodeMsg = $state('');
	let inviteOpen = $state(false);
	let inviteEmail = $state('');
	let createMemberOpen = $state(false);
	let rosterMsg = $state('');

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

	const LANG_EMOJI = /** @type {Record<string, string>} */ ({
		en: '🇬🇧',
		fr: '🇫🇷',
		nl: '🇳🇱',
		es: '🇪🇸'
	});

	const themeOptions = $derived.by(() => {
		locale.value;
		return [
			{ value: 'system', label: t('settings.themeSystem'), icon: ThemeSystem },
			{ value: 'light', label: t('settings.themeLight'), icon: Sun },
			{ value: 'dark', label: t('settings.themeDark'), icon: Moon }
		];
	});

	const langOptions = $derived.by(() => {
		locale.value;
		return localeChoices.map((lang) => ({
			value: lang.id,
			label: lang.native,
			emoji: LANG_EMOJI[lang.id] || '🌐'
		}));
	});

	const scaleOptions = $derived.by(() => {
		locale.value;
		return [
			{ value: 'small', label: t('settings.uiScaleSmall'), labelFontSize: '0.6875rem' },
			{ value: 'normal', label: t('settings.uiScaleNormal'), labelFontSize: '0.8125rem' },
			{ value: 'large', label: t('settings.uiScaleLarge'), labelFontSize: '1rem' }
		];
	});

	const spaceMembers = $derived.by(() =>
		members
			.filter((m) => m.status !== 'disabled')
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
	);

	let nameDraft = $state('');
	let picBusy = $state(false);
	let picMsg = $state('');
	let nameMsg = $state('');
	let mailboxPw = $state('');
	let mailboxMsg = $state('');
	let mailboxBusy = $state(false);
	/** Admin: view / rotate member invite↔mail passphrase. */
	let memberPassDraft = $state('');
	let memberPassMsg = $state('');
	let memberPassBusy = $state(false);
	let apiTokenDraft = $state('');
	let apiTokenMsg = $state('');
	/** Hide pubs token field once invite/space-secrets (or recovery save) hydrated it. */
	let pubsTokenReady = $state(Boolean(getAdminToken()));
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
		memberPassMsg = '';
		memberPassDraft = getMailboxPassword(targetEmail);
		if (canAdminMembers && targetEmail.includes('@') && driveSession.connected) {
			void (async () => {
				try {
					const { readMailboxPassphrase } = await import('$lib/invite-bootstrap.js');
					const pw = await readMailboxPassphrase(targetEmail);
					if (pw) memberPassDraft = pw;
				} catch {
					/* ignore */
				}
			})();
		}
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
		pubsTokenReady = Boolean(getAdminToken());
		mailboxPw = getMailboxPassword(actor.email);
		void refreshPwaStatus();
		void storageEstimate().then((e) => {
			if (e.quota) storageLabel = `${formatBytes(e.usage)} / ${formatBytes(e.quota)}`;
		});
		if (driveSession.connected) {
			void ensureMembers().catch(() => {});
			/* Re-check pubs token after space-secrets hydrate (invite / boot). */
			void (async () => {
				try {
					const { hydrateDeviceFromSpaceSecrets } = await import('$lib/drive/space-secrets.js');
					const { setMailboxPassword } = await import('$lib/jmap-mail.js');
					const { setAdminToken } = await import('$lib/mail-api.js');
					await hydrateDeviceFromSpaceSecrets(driveSession, actor.email, {
						setMailboxPassword,
						setAdminToken,
						getAdminToken,
						getMailboxPassword
					});
				} catch {
					/* ignore */
				}
				pubsTokenReady = Boolean(getAdminToken());
				apiTokenDraft = getAdminToken();
				mailboxPw = getMailboxPassword(actor.email);
			})();
		}
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
		pubsTokenReady = Boolean(getAdminToken());
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
				const secret = mailboxPw.trim();
				await testMailboxLogin(actor.email, secret);
				const { syncMailboxPassphrase } = await import('$lib/invite-bootstrap.js');
				await syncMailboxPassphrase(
					actor.email,
					secret,
					displayNameFromEmail(actor.email) || actor.email
				);
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

	async function saveMemberPassphrase() {
		if (!canAdminMembers || !targetEmail.includes('@')) return;
		const secret = memberPassDraft.trim();
		if (secret.length < 6) {
			memberPassMsg = t('settings.passphraseTooShort');
			return;
		}
		memberPassBusy = true;
		memberPassMsg = '';
		try {
			const { syncMailboxPassphrase } = await import('$lib/invite-bootstrap.js');
			const synced = await syncMailboxPassphrase(
				targetEmail,
				secret,
				me?.name || displayNameFromEmail(targetEmail) || targetEmail
			);
			if (isSelf) {
				try {
					await testMailboxLogin(targetEmail, secret);
					await refreshMail();
				} catch (err) {
					/* Provision may be deferred — still saved on Drive. */
					console.warn('member passphrase login test', err);
				}
			}
			memberPassMsg = synced.deferred
				? t('settings.memberPassphraseDeferred')
				: t('settings.memberPassphraseSaved');
		} catch (e) {
			memberPassMsg = e instanceof Error ? e.message : String(e);
		} finally {
			memberPassBusy = false;
		}
	}

	async function resetMemberPassphrase() {
		if (!canAdminMembers || !targetEmail.includes('@')) return;
		if (!confirm(t('settings.confirmResetPassphrase', { name: me?.name || targetEmail }))) return;
		memberPassBusy = true;
		memberPassMsg = '';
		try {
			const { generateMailboxPassword } = await import('$lib/stalwart-provision.js');
			const { syncMailboxPassphrase } = await import('$lib/invite-bootstrap.js');
			const secret = generateMailboxPassword();
			const synced = await syncMailboxPassphrase(
				targetEmail,
				secret,
				me?.name || displayNameFromEmail(targetEmail) || targetEmail
			);
			memberPassDraft = secret;
			if (isSelf) {
				try {
					await testMailboxLogin(targetEmail, secret);
					await refreshMail();
				} catch (err) {
					console.warn('member passphrase reset login test', err);
				}
			}
			memberPassMsg = synced.deferred
				? t('settings.memberPassphraseDeferred')
				: t('settings.memberPassphraseReset');
		} catch (e) {
			memberPassMsg = e instanceof Error ? e.message : String(e);
		} finally {
			memberPassBusy = false;
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

	/** @param {string} email */
	function openMemberProfile(email) {
		setProfileTarget(email);
		selectEntity('settings', 'profile');
	}

	/** @param {string} email */
	function openInviteFor(email) {
		inviteEmail = String(email || '')
			.trim()
			.toLowerCase();
		inviteOpen = true;
	}

	/** @param {string} email */
	function switchToMember(email) {
		rosterMsg = '';
		try {
			switchDeviceProfile(email);
			rosterMsg = t('settings.switchedTo', {
				name: displayNameFromEmail(email) || email
			});
		} catch (err) {
			rosterMsg = err instanceof Error ? err.message : String(err);
		}
	}

	const activeEmail = $derived(
		String(actor.email || '')
			.trim()
			.toLowerCase()
	);
</script>

{#if sid === 'profile'}
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
			<SegmentedControl
				options={[
					{ value: 'member', label: t('settings.roleMember') },
					{ value: 'admin', label: t('settings.roleAdmin') }
				]}
				value={roleDraft}
				label={t('settings.spaceRole')}
				onchange={(next) => {
					roleDraft = /** @type {'admin' | 'member'} */ (next);
				}}
			/>
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

		{#if canAdminMembers && me}
			<hr class="rule" />
			<p class="field-label">{t('settings.memberPassphrase')}</p>
			<p class="hint">{t('settings.memberPassphraseHint')}</p>
			<label class="row stack">
				<span>{t('settings.passphrase')}</span>
				<PasswordRevealField
					variant="pill"
					bind:value={memberPassDraft}
					autocomplete="off"
					spellcheck={false}
					disabled={memberPassBusy || !driveSession.connected}
				/>
			</label>
			<div class="actions">
				<PrimaryButton
					size="sm"
					disabled={memberPassBusy || !driveSession.connected || memberPassDraft.trim().length < 6}
					onclick={() => void saveMemberPassphrase()}
				>
					{memberPassBusy ? t('common.saving') : t('settings.savePassphrase')}
				</PrimaryButton>
				<button
					type="button"
					class="btn ghost"
					disabled={memberPassBusy || !driveSession.connected}
					onclick={() => void resetMemberPassphrase()}
				>
					{t('settings.resetPassphrase')}
				</button>
			</div>
			{#if memberPassMsg}<p class="status on">{memberPassMsg}</p>{/if}
		{/if}

		<hr class="rule" />
		<button type="button" class="btn danger disconnect" onclick={() => void disconnectThisProfile()}>
			{displayNameFromEmail(targetEmail)
				? t('settings.disconnectProfile', { name: displayNameFromEmail(targetEmail) })
				: t('settings.disconnectProfileFallback')}
		</button>
		{#if memberMsg}<p class="status">{memberMsg}</p>{/if}
	</section>
{:else if sid === 'devices'}
	<section class="block">
		<p class="field-label">{t('settings.otherDevices')}</p>
		<p class="hint">{t('settings.otherDevicesHint')}</p>
		<div class="actions">
			<PrimaryButton
				size="sm"
				disabled={!activeEmail || !driveSession.connected}
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
	</section>
	<ProfileInviteModal bind:open={deviceCodeOpen} email={activeEmail} mode="device" />
{:else if sid === 'notifications'}
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
{:else if sid === 'appearance'}
	<section class="block">
		<p class="field-label">{t('settings.language')}</p>
		<div class="seg-wrap">
			<SegmentedControl
				options={langOptions}
				value={locale.value}
				label={t('settings.language')}
				onchange={(next) => setLocale(/** @type {typeof localeChoices[number]['id']} */ (next))}
			/>
		</div>
		<p class="field-label">{t('settings.theme')}</p>
		<div class="seg-wrap">
			<SegmentedControl
				options={themeOptions}
				value={themeChoice.value}
				label={t('settings.theme')}
				onchange={(next) => setTheme(/** @type {'system' | 'light' | 'dark'} */ (next))}
			/>
		</div>
		<p class="field-label">{t('settings.uiScale')}</p>
		<div class="seg-wrap">
			<SegmentedControl
				options={scaleOptions}
				value={uiScaleChoice.value}
				label={t('settings.uiScale')}
				onchange={(next) => setUiScale(/** @type {'small' | 'normal' | 'large'} */ (next))}
			/>
		</div>
	</section>
{:else if sid === 'storage'}
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
		<p class="hint tight">{t('settings.clearCacheHint')}</p>
		{#if cacheMsg}<p class="status on">{cacheMsg}</p>{/if}
	</section>
{:else if sid === 'admin' || sid === 'mail' || sid === 'publications' || sid === 'drive'}
	<section class="block">
		<p class="lede">{t('settings.adminLede')}</p>

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

		<hr class="rule" />
		<p class="field-label">{t('settings.members')}</p>
		<p class="hint">{t('settings.membersHint')}</p>
		<ul class="member-list">
			{#each spaceMembers as m (m.email)}
				{@const isActive = m.email === activeEmail}
				<li class="member-card" class:on={isActive}>
					<button type="button" class="member-row" onclick={() => openMemberProfile(m.email)}>
						<ProfilePic
							name={displayNameFromEmail(m.email) || m.name}
							email={m.email}
							pictureUrl={pictureUrlFor(m.email)}
							size={40}
						/>
						<span class="member-meta">
							<span class="member-name">
								{displayNameFromEmail(m.email) || m.name}
								{#if m.role === 'owner' || m.role === 'admin'}
									<span class="member-crown" aria-hidden="true"><Crown size={11} /></span>
								{/if}
							</span>
							<span class="member-email">{m.email}</span>
						</span>
					</button>
					<div class="member-actions">
						{#if !isActive}
							<button
								type="button"
								class="text-pill"
								onclick={() => switchToMember(m.email)}
							>
								{t('settings.switchTo')}
							</button>
						{/if}
						<button
							type="button"
							class="text-pill"
							onclick={() => openMemberProfile(m.email)}
						>
							{t('settings.manage')}
						</button>
						<button
							type="button"
							class="icon-pill"
							aria-label={t('settings.shareInvite')}
							onclick={() => openInviteFor(m.email)}
						>
							<Share size={13} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
		{#if rosterMsg}<p class="status on">{rosterMsg}</p>{/if}
		<div class="actions">
			<PrimaryButton
				size="sm"
				disabled={!driveSession.connected || !canAdminMembers}
				onclick={() => {
					if (!driveSession.connected) return;
					createMemberOpen = true;
				}}
			>
				{t('invite.createProfile')}
			</PrimaryButton>
		</div>

		<hr class="rule" />
		<p class="field-label">{t('settings.mailTitle')}</p>
		<p class="hint">{t('settings.mailHint')}</p>
		<label class="row stack">
			<span>{t('settings.password')}</span>
			<PasswordRevealField
				variant="pill"
				bind:value={mailboxPw}
				autocomplete="current-password"
				spellcheck={false}
				disabled={!actor.email}
			/>
		</label>
		<div class="actions">
			<PrimaryButton size="sm" disabled={mailboxBusy || !actor.email} onclick={saveMailboxPw}>
				{mailboxBusy ? t('settings.checking') : t('settings.saveAndTest')}
			</PrimaryButton>
		</div>
		{#if mailboxMsg}<p class="status on">{mailboxMsg}</p>{/if}

		{#if isOperator}
			{#if !pubsTokenReady}
				<hr class="rule" />
				<p class="field-label">{t('settings.publicationsTitle')}</p>
				<p class="hint">{t('settings.publicationsRecoveryHint')}</p>
				<label class="row stack">
					<span>{t('settings.adminToken')}</span>
					<input
						type="password"
						bind:value={apiTokenDraft}
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
				<div class="actions">
					<PrimaryButton size="sm" onclick={saveApiToken}>{t('settings.saveToken')}</PrimaryButton>
				</div>
				{#if apiTokenMsg}<p class="status on">{apiTokenMsg}</p>{/if}
			{/if}

			<hr class="rule" />
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
		{/if}
	</section>
	<ProfileInviteModal bind:open={inviteOpen} email={inviteEmail} mode="invite" />
	<AdminCreateMemberModal bind:open={createMemberOpen} />
{:else}
	<p class="hint">{t('settings.unknownSection')}</p>
{/if}

<style>
	.block {
		max-width: 520px;
	}
	.lede {
		margin: 0 0 1.15rem;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--fg-66, var(--white66));
	}
	.field-label {
		margin: 0 0 0.75rem;
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--fg-66, var(--white66));
	}
	.hint {
		margin: 0 0 0.85rem;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}
	.hint.tight {
		margin-top: -0.35rem;
	}
	.seg-wrap {
		margin-bottom: 1.15rem;
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
		font-size: 0.875rem;
		font-weight: 600;
	}
	.row span {
		color: var(--fg-66, var(--white66));
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
		font-size: 0.75rem;
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
		font-size: 0.875rem;
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
		font-size: 0.9375rem;
	}
	.space-icon-row {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin: 0.35rem 0 1rem;
	}
	.space-icon-preview {
		width: 3.5rem;
		height: 3.5rem;
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
		color: var(--fg-66, var(--white66));
		border: 1px solid var(--fg-8, var(--white11));
		border-radius: 999px;
	}
	.status {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}
	.status.on {
		color: var(--fg, var(--white));
	}
	.member-list {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.member-card {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.625rem 0.625rem 0.75rem;
		border-radius: 0.875rem;
		background: transparent;
		box-sizing: border-box;
	}
	.member-card.on {
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
	}
	.member-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}
	.member-meta {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.member-name {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--fg, var(--white));
	}
	.member-crown {
		color: var(--fg-33, var(--white44));
		display: inline-grid;
		place-items: center;
	}
	.member-email {
		font-size: 0.75rem;
		color: var(--fg-66, var(--white66));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.member-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		/* Align under member meta: pic (2.5rem) + row gap (0.75rem) */
		padding-left: 3.25rem;
		flex-wrap: wrap;
	}
	.text-pill {
		height: 2rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg-66, var(--white66));
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.text-pill:hover {
		color: var(--fg, var(--white));
	}
	.icon-pill {
		width: 2rem;
		height: 2rem;
		border: 1px solid transparent;
		border-radius: 999px;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66, var(--white66));
		display: grid;
		place-items: center;
		cursor: pointer;
		padding: 0;
		font: inherit;
		line-height: 1;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		box-sizing: border-box;
	}
	.icon-pill:hover {
		color: var(--fg, var(--white));
		transform: scale(1.06);
	}
</style>
