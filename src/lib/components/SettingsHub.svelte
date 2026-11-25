<script>
	/**
	 * Settings list: stacked active profile + expandable Space roster, then section rows.
	 * Detail opens in the third column via selectEntity('settings', id).
	 */
	import { onMount } from 'svelte';
	import Appearance from '@alpha/ui/icons/Appearance.svelte';
	import OtherDevices from '@alpha/ui/icons/OtherDevices.svelte';
	import Profile from '@alpha/ui/icons/Profile.svelte';
	import Storage from '@alpha/ui/icons/Storage.svelte';
	import AddProfileSheet from './AddProfileSheet.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import Crown from './icons/Crown.svelte';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		deviceProfiles,
		hasDeviceProfile,
		switchDeviceProfile
	} from '$lib/device-profiles.svelte.js';
	import { driveSession } from '$lib/drive/session.svelte.js';
	import {
		canManageMembers,
		canManageSpace,
		ensureMembers,
		members,
		roleFor
	} from '$lib/members.svelte.js';
	import { setProfileTarget, clearProfileTarget } from '$lib/settings-ui.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { pwaUi } from '$lib/pwa.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';
	import { formatBytes, storageEstimate } from '$lib/offline-store.js';

	let addProfileOpen = $state(false);
	let profilesOpen = $state(false);
	let shareMsg = $state('');
	let storageShort = $state('');

	/**
	 * Operator power from the signed-in profile or any unlocked device profile
	 * (same pattern as SettingsSectionDetail — switching away from admin must not
	 * lose Space-directory visibility).
	 */
	const isOperator = $derived.by(() => {
		if (canManageMembers(actor.email) || canManageSpace(actor.email)) return true;
		for (const p of deviceProfiles) {
			if (canManageMembers(p.email) || canManageSpace(p.email)) return true;
		}
		return false;
	});

	const activeEmail = $derived((actor.email || '').trim().toLowerCase());
	const selectedSection = $derived(
		ui.selection?.kind === 'settings' ? String(ui.selection.id || '') : ''
	);

	function isAdminRole(role) {
		return role === 'owner' || role === 'admin';
	}

	onMount(() => {
		if (driveSession.connected) {
			void ensureMembers().catch(() => {});
		}
		void storageEstimate().then((e) => {
			if (e.quota) storageShort = formatBytes(e.usage);
		});
	});

	/**
	 * Active profile first.
	 * Prior behavior (d2a7778 / 06be3fd): connected Drive → full Space directory so
	 * admins/operators can switch to any profile. The stacked rewrite gated this on
	 * `canManageMembers(actor.email)` only, which fell through to device-only (often
	 * just self) when role hydrate lagged — restore full directory for operators,
	 * device profiles for everyone else.
	 */
	const roster = $derived.by(() => {
		/** @type {{ email: string, name: string, role?: string }[]} */
		let list = [];
		if (isOperator && driveSession.connected && members.length) {
			list = members
				.filter((m) => m.status !== 'disabled')
				.map((m) => ({ email: m.email, name: m.name, role: m.role }));
		} else if (driveSession.connected && members.length) {
			list = members
				.filter((m) => m.status !== 'disabled' && hasDeviceProfile(m.email))
				.map((m) => ({ email: m.email, name: m.name, role: m.role }));
			if (!list.length) {
				list = deviceProfiles.map((p) => ({
					email: p.email,
					name: p.name,
					role: roleFor(p.email) || undefined
				}));
			}
		} else {
			list = deviceProfiles.map((p) => ({
				email: p.email,
				name: p.name,
				role: roleFor(p.email) || undefined
			}));
		}
		const active = activeEmail;
		list.sort((a, b) => {
			const aA = a.email === active ? 0 : 1;
			const bA = b.email === active ? 0 : 1;
			if (aA !== bA) return aA - bA;
			return a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
		});
		return list;
	});

	const activeProfile = $derived(roster.find((p) => p.email === activeEmail) || roster[0]);
	const otherProfiles = $derived(roster.filter((p) => p.email !== activeEmail));
	const stackDepth = $derived(Math.min(3, otherProfiles.length));

	/** Admin (ops) → Notifications → Profile → Appearance → Other Devices → Storage.
	 *  Non-admin: Notifications first. */
	const sections = $derived.by(() => {
		locale.value; /* re-run when language changes */
		storageShort;
		/** @type {{ id: string, title: string, description: string, icon: 'admin' | 'profile' | 'appearance' | 'notifications' | 'devices' | 'storage' }[]} */
		const rows = [];
		if (isOperator) {
			rows.push({
				id: 'admin',
				title: t('settings.admin'),
				description: t('settings.adminDesc'),
				icon: 'admin'
			});
		}
		rows.push(
			{
				id: 'notifications',
				title: t('settings.notifications'),
				description: pwaUi.pushSubscribed
					? t('settings.notificationsPushOn')
					: pwaUi.standalone
						? t('settings.notificationsInstalled')
						: t('settings.notificationsInstall'),
				icon: 'notifications'
			},
			{
				id: 'profile',
				title: t('settings.profile'),
				description: t('settings.profileDesc'),
				icon: 'profile'
			},
			{
				id: 'appearance',
				title: t('settings.appearance'),
				description: t('settings.appearanceDesc', {
					theme: t(
						themeChoice.value === 'light'
							? 'settings.themeLight'
							: themeChoice.value === 'dark'
								? 'settings.themeDark'
								: 'settings.themeSystem'
					)
				}),
				icon: 'appearance'
			},
			{
				id: 'devices',
				title: t('settings.otherDevices'),
				description: t('settings.otherDevicesDesc'),
				icon: 'devices'
			},
			{
				id: 'storage',
				title: t('settings.storage'),
				description: storageShort
					? t('settings.storageDescUsed', { used: storageShort })
					: t('settings.storageDesc'),
				icon: 'storage'
			}
		);
		return rows;
	});

	function toggleProfiles() {
		profilesOpen = !profilesOpen;
	}

	/** @param {string} id */
	function openSection(id) {
		if (id === 'profile') setProfileTarget(activeEmail);
		else clearProfileTarget();
		selectEntity('settings', id);
	}

	/** @param {string} email */
	function onSwitch(email) {
		try {
			switchDeviceProfile(email);
			shareMsg = '';
			profilesOpen = false;
		} catch (err) {
			shareMsg = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<div class="hub" class:expanded={profilesOpen}>
	<div class="stack" class:open={profilesOpen}>
		<div
			class="card"
			class:stacked={!profilesOpen && stackDepth > 0}
			class:selected={Boolean(activeProfile)}
		>
			{#if activeProfile}
				{@const admin = isAdminRole(activeProfile.role)}
				<article class="face">
					<button type="button" class="face-main" onclick={() => openSection('profile')}>
						<ProfilePic
							name={displayNameFromEmail(activeProfile.email) || activeProfile.name}
							email={activeProfile.email}
							pictureUrl={pictureUrlFor(activeProfile.email)}
							size={52}
						/>
						<span class="meta">
							<span class="name-row">
								<span class="name"
									>{displayNameFromEmail(activeProfile.email) || activeProfile.name}</span
								>
								{#if admin}
									<span class="crown" title={t('settings.admin')} aria-label={t('settings.admin')}
										><Crown size={13} /></span
									>
								{/if}
							</span>
							<span class="email">{activeProfile.email}</span>
						</span>
					</button>
					<div class="face-actions">
						<button
							type="button"
							class="chev"
							class:up={profilesOpen}
							aria-expanded={profilesOpen}
							aria-label={profilesOpen ? t('settings.collapseProfiles') : t('settings.expandProfiles')}
							onclick={(e) => {
								e.stopPropagation();
								toggleProfiles();
							}}
						>
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M4 6.5 8 10.5 12 6.5"
									stroke="currentColor"
									stroke-width="1.6"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
					</div>
				</article>
			{/if}

			{#if profilesOpen}
				<div class="roster">
					{#each otherProfiles as p (p.email)}
						{@const admin = isAdminRole(p.role)}
						<article class="row-card">
							<button type="button" class="row-main" onclick={() => onSwitch(p.email)}>
								<ProfilePic
									name={displayNameFromEmail(p.email) || p.name}
									email={p.email}
									pictureUrl={pictureUrlFor(p.email)}
									size={44}
								/>
								<span class="meta">
									<span class="name-row">
										<span class="name">{displayNameFromEmail(p.email) || p.name}</span>
										{#if admin}
											<span
												class="crown"
												title={t('settings.admin')}
												aria-label={t('settings.admin')}><Crown size={12} /></span
											>
										{/if}
									</span>
									<span class="email">{p.email}</span>
								</span>
							</button>
						</article>
					{/each}
					<button type="button" class="add-row" onclick={() => (addProfileOpen = true)}>
						<span class="add-plus" aria-hidden="true">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="none">
								<path
									d="M8 3.25v9.5M3.25 8h9.5"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
						</span>
						<span>{t('settings.addProfile')}</span>
					</button>
				</div>
			{/if}
		</div>

		{#if !profilesOpen && stackDepth > 0}
			{#each Array(stackDepth) as _, i}
				<div class="layer" style="--i: {i + 1}" aria-hidden="true"></div>
			{/each}
		{/if}
	</div>

	{#if shareMsg}
		<p class="toast">{shareMsg}</p>
	{/if}

	<ul class="sections" class:pushed={profilesOpen}>
		{#each sections as s (s.id)}
			<li>
				<button
					type="button"
					class="section-row"
					class:on={selectedSection === s.id || (s.id === 'admin' && selectedSection === 'advanced')}
					onclick={() => openSection(s.id)}
				>
					<span
						class="section-ico"
						class:admin={s.icon === 'admin'}
						class:notif={s.icon === 'notifications'}
						aria-hidden="true"
					>
						{#if s.icon === 'admin'}
							<span class="admin-glyph"></span>
						{:else if s.icon === 'profile'}
							<Profile size={20} />
						{:else if s.icon === 'appearance'}
							<Appearance size={20} />
						{:else if s.icon === 'devices'}
							<OtherDevices size={20} />
						{:else if s.icon === 'storage'}
							<Storage size={20} />
						{:else}
							<span class="notif-inner">
								<span class="notif-dot"></span>
							</span>
						{/if}
					</span>
					<span class="section-text">
						<span class="section-title">{s.title}</span>
						<span class="section-desc">{s.description}</span>
					</span>
				</button>
			</li>
		{/each}
	</ul>
</div>

<AddProfileSheet bind:open={addProfileOpen} onclose={() => (addProfileOpen = false)} />

<style>
	/* Match Tasks feed card-stack inset — feed already owns top/bottom chrome pad */
	.hub {
		padding: 4px 6px 10px;
		box-sizing: border-box;
		max-width: 720px;
	}

	.stack {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		gap: 0;
		box-sizing: border-box;
	}

	.card {
		position: relative;
		z-index: 4;
		width: 100%;
		border-radius: 16px;
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
		overflow: hidden;
		box-sizing: border-box;
		/* Slightly larger selected — grow inward so hub L/R pad (Tasks 6px) stays */
		transform: scale(1);
		transform-origin: top center;
		transition:
			transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 0.22s ease;
	}

	.card.selected {
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
		transform: scale(1.02);
		/* Counter scale growth so edges stay inside hub padding */
		width: calc(100% / 1.02);
	}

	/* Flat bottom only while decoy stack layers sit underneath */
	.card.stacked {
		border-radius: 16px 16px 0 0;
	}

	.face {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 16px 10px 16px 14px;
		box-sizing: border-box;
		margin: 0;
		background: transparent;
		min-height: 84px;
	}

	.face-main,
	.row-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		border: 0;
		background: transparent;
		padding: 0;
		text-align: left;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.face-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.meta {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.name {
		font-size: 0.9375rem;
		font-weight: 650;
		color: var(--fg, var(--white));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.email {
		font-size: 0.75rem;
		color: var(--fg-66, var(--white66));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.crown {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		color: var(--fg-33, var(--white44));
	}

	.chev {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
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
		-webkit-tap-highlight-color: transparent;
		transition:
			transform 0.15s ease,
			color 0.15s ease;
	}

	.chev:hover {
		color: var(--fg, var(--white));
		transform: scale(1.06);
	}

	.chev:active {
		transform: scale(0.96);
	}

	.chev svg {
		transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.chev.up svg {
		transform: rotate(180deg);
	}

	.layer {
		--i: 1;
		width: calc(100% - var(--i) * 18px);
		height: calc(10px - var(--i) * 1.5px);
		margin: 0;
		margin-top: 0;
		border-radius: 0 0 calc(14px - var(--i) * 3px) calc(14px - var(--i) * 3px);
		background: color-mix(in srgb, var(--fg) calc(7.5% - var(--i) * 1.5%), transparent);
		z-index: calc(3 - var(--i));
		pointer-events: none;
		flex-shrink: 0;
	}

	.roster {
		width: 100%;
		display: flex;
		flex-direction: column;
		margin: 0;
		background: transparent;
		animation: roster-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes roster-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.row-card {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 10px 14px 16px;
		border-top: 1px solid var(--fg-8, var(--white11));
		box-sizing: border-box;
		margin: 0;
		min-height: 76px;
	}

	.add-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 14px 16px;
		border: 0;
		border-top: 1px solid var(--fg-8, var(--white11));
		background: transparent;
		color: var(--fg-66, var(--white66));
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		min-height: 72px;
		box-sizing: border-box;
	}

	.add-row:hover {
		color: var(--fg, var(--white));
	}

	/* Match list-plus chrome: stroked circle + glyph, not a one-off text + */
	.add-plus {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 1.5px solid var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		color: var(--fg-66, var(--white66));
		box-sizing: border-box;
		flex-shrink: 0;
		background: transparent;
	}

	.add-row:hover .add-plus {
		color: var(--fg, var(--white));
		border-color: var(--fg-33, color-mix(in srgb, var(--fg) 33%, transparent));
	}

	.toast {
		margin: 10px 0 0;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}

	.sections {
		list-style: none;
		margin: 18px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
		transition:
			transform 0.34s cubic-bezier(0.22, 1, 0.36, 1),
			margin-top 0.34s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.sections.pushed {
		margin-top: 22px;
		transform: translateY(4px);
	}

	.section-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px;
		border: 0;
		border-radius: 14px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	/* No hover wash — selection is grayscale fill only when open in detail */
	.section-row:hover {
		background: transparent;
	}

	.section-row.on {
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
	}

	/* Glass rounded square + quiet glyph fill (--fg-66) for every section */
	.section-ico {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		border: 1px solid transparent;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		color: var(--fg-66, var(--white66));
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		box-sizing: border-box;
		position: relative;
	}

	/* Crown SVG gets accent-2 gradient — square stays glass */
	.section-ico.admin {
		color: transparent;
	}

	.admin-glyph {
		display: block;
		width: 20px;
		height: 15px;
		background: var(
			--gradient-accent-2,
			radial-gradient(circle at top left, #ffc736 0%, #ffa037 100%)
		);
		-webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 16'%3E%3Cpath fill='%23000' d='M11.171 2.91339C11.0944 2.76032 11.1511 2.57671 11.2746 2.45825C11.5455 2.1984 11.7143 1.83125 11.7143 1.42857C11.7143 0.639286 11.075 0 10.2857 0C9.49643 0 8.85714 0.639286 8.85714 1.42857C8.85714 1.83398 9.02581 2.19943 9.29666 2.45847C9.42034 2.57675 9.47698 2.76032 9.40045 2.91339L7.48928 6.73571C7.16429 7.38572 6.32143 7.57143 5.75357 7.11786L2.82053 4.77077C2.68161 4.6596 2.66007 4.45932 2.73277 4.29694C2.81248 4.11891 2.85714 3.92181 2.85714 3.71429C2.85714 2.925 2.21786 2.28571 1.42857 2.28571C0.639286 2.28571 0 2.925 0 3.71429C0 4.50357 0.639286 5.14286 1.42857 5.14286C1.44305 5.14286 1.45545 5.15321 1.45804 5.16745L3.08571 14.1214C3.28214 15.2071 4.22857 16 5.33571 16H15.2357C16.3393 16 17.2857 15.2107 17.4857 14.1214L19.1134 5.16745C19.116 5.15321 19.1284 5.14286 19.1429 5.14286C19.9321 5.14286 20.5714 4.50357 20.5714 3.71429C20.5714 2.925 19.9321 2.28571 19.1429 2.28571C18.3536 2.28571 17.7143 2.925 17.7143 3.71429C17.7143 3.92181 17.7589 4.11891 17.8387 4.29694C17.9114 4.45932 17.8898 4.6596 17.7509 4.77077L14.8179 7.11786C14.25 7.57143 13.4071 7.38572 13.0821 6.73571L11.171 2.91339Z'/%3E%3C/svg%3E");
		mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 16'%3E%3Cpath fill='%23000' d='M11.171 2.91339C11.0944 2.76032 11.1511 2.57671 11.2746 2.45825C11.5455 2.1984 11.7143 1.83125 11.7143 1.42857C11.7143 0.639286 11.075 0 10.2857 0C9.49643 0 8.85714 0.639286 8.85714 1.42857C8.85714 1.83398 9.02581 2.19943 9.29666 2.45847C9.42034 2.57675 9.47698 2.76032 9.40045 2.91339L7.48928 6.73571C7.16429 7.38572 6.32143 7.57143 5.75357 7.11786L2.82053 4.77077C2.68161 4.6596 2.66007 4.45932 2.73277 4.29694C2.81248 4.11891 2.85714 3.92181 2.85714 3.71429C2.85714 2.925 2.21786 2.28571 1.42857 2.28571C0.639286 2.28571 0 2.925 0 3.71429C0 4.50357 0.639286 5.14286 1.42857 5.14286C1.44305 5.14286 1.45545 5.15321 1.45804 5.16745L3.08571 14.1214C3.28214 15.2071 4.22857 16 5.33571 16H15.2357C16.3393 16 17.2857 15.2107 17.4857 14.1214L19.1134 5.16745C19.116 5.15321 19.1284 5.14286 19.1429 5.14286C19.9321 5.14286 20.5714 4.50357 20.5714 3.71429C20.5714 2.925 19.9321 2.28571 19.1429 2.28571C18.3536 2.28571 17.7143 2.925 17.7143 3.71429C17.7143 3.92181 17.7589 4.11891 17.8387 4.29694C17.9114 4.45932 17.8898 4.6596 17.7509 4.77077L14.8179 7.11786C14.25 7.57143 13.4071 7.38572 13.0821 6.73571L11.171 2.91339Z'/%3E%3C/svg%3E");
		-webkit-mask-size: contain;
		mask-size: contain;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-position: center;
		mask-position: center;
	}

	/* Nested glass square + accent-1 unread-style dot at top-right */
	.notif-inner {
		position: relative;
		width: 22px;
		height: 22px;
		border-radius: 7px;
		border: 1px solid transparent;
		background:
			linear-gradient(var(--glass), var(--glass)) padding-box,
			var(--glass-shine) border-box;
		box-sizing: border-box;
	}

	.notif-dot {
		position: absolute;
		top: -3px;
		right: -3px;
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: var(
			--gradient-accent-1,
			radial-gradient(circle at top left, #5c5fff 0%, #4542ff 100%)
		);
		box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--bg, #000) 55%, transparent);
	}

	.section-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 650;
		color: var(--fg, var(--white));
	}

	.section-desc {
		font-size: 0.75rem;
		color: var(--fg-66, var(--white66));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
