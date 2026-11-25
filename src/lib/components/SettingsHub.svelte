<script>
	/**
	 * Settings list: stacked active profile + expandable roster, then section rows.
	 * Detail opens in the third column via selectEntity('settings', id).
	 */
	import AddProfileSheet from './AddProfileSheet.svelte';
	import ProfileInviteModal from './ProfileInviteModal.svelte';
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
	import { canManageMembers, members, roleFor } from '$lib/members.svelte.js';
	import { setProfileTarget, clearProfileTarget } from '$lib/settings-ui.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { pwaUi } from '$lib/pwa.svelte.js';
	import { selectEntity, ui } from '$lib/workspace.svelte.js';

	let addProfileOpen = $state(false);
	let profilesOpen = $state(false);
	let shareMsg = $state('');
	let inviteOpen = $state(false);
	/** @type {'device' | 'invite'} */
	let inviteMode = $state('device');
	/** @type {string} */
	let inviteEmail = $state('');

	const isAdmin = $derived(canManageMembers(actor.email));
	const activeEmail = $derived((actor.email || '').trim().toLowerCase());
	const selectedSection = $derived(
		ui.selection?.kind === 'settings' ? String(ui.selection.id || '') : ''
	);

	function isAdminRole(role) {
		return role === 'owner' || role === 'admin';
	}

	/** Active profile first; admins see full Space directory, others device profiles. */
	const roster = $derived.by(() => {
		/** @type {{ email: string, name: string, role?: string }[]} */
		let list = [];
		if (isAdmin && driveSession.connected && members.length) {
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

	const sections = $derived.by(() => {
		locale.value; /* re-run when language changes */
		/** @type {{ id: string, title: string, description: string }[]} */
		const rows = [
			{
				id: 'profile',
				title: t('settings.profile'),
				description: activeEmail || t('settings.profileDesc')
			},
			{
				id: 'notifications',
				title: t('settings.notifications'),
				description: pwaUi.pushSubscribed
					? t('settings.notificationsPushOn')
					: pwaUi.standalone
						? t('settings.notificationsInstalled')
						: t('settings.notificationsInstall')
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
				})
			},
			{
				id: 'storage',
				title: t('settings.storage'),
				description: pwaUi.storageLabel || t('settings.storageDesc')
			},
			{
				id: 'mail',
				title: t('settings.mail'),
				description: actor.email ? actor.email : t('settings.mailDesc')
			}
		];
		if (isAdmin) {
			rows.push(
				{
					id: 'publications',
					title: t('settings.publications'),
					description: t('settings.publicationsDesc')
				},
				{
					id: 'drive',
					title: t('settings.files'),
					description: driveSession.connected
						? driveSession.url || t('settings.driveConnected')
						: t('settings.driveDisconnected')
				}
			);
		}
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

	/**
	 * @param {string} email
	 * @param {'device' | 'invite'} mode
	 */
	function onShare(email, mode = 'invite') {
		shareMsg = '';
		const e = String(email || '')
			.trim()
			.toLowerCase();
		if (!e.includes('@')) {
			shareMsg = t('settings.missingEmail');
			return;
		}
		if (!driveSession.connected) {
			shareMsg = t('settings.connectDriveFirst');
			return;
		}
		inviteEmail = e;
		inviteMode = mode;
		inviteOpen = true;
	}
</script>

<div class="hub" class:expanded={profilesOpen}>
	<div class="stack" class:open={profilesOpen}>
		<div class="card" class:stacked={!profilesOpen && stackDepth > 0}>
			{#if activeProfile}
				{@const admin = isAdminRole(activeProfile.role)}
				<article class="face">
					<button type="button" class="face-main" onclick={() => openSection('profile')}>
						<ProfilePic
							name={displayNameFromEmail(activeProfile.email) || activeProfile.name}
							email={activeProfile.email}
							pictureUrl={pictureUrlFor(activeProfile.email)}
							size={48}
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
									size={40}
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
							{#if isAdmin && !admin}
								<button
									type="button"
									class="invite-btn"
									onclick={(e) => {
										e.stopPropagation();
										onShare(p.email, 'invite');
									}}>{t('settings.invite')}</button
								>
							{/if}
						</article>
					{/each}
					<button type="button" class="add-row" onclick={() => (addProfileOpen = true)}>
						<span class="add-plus" aria-hidden="true">+</span>
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
					class:on={selectedSection === s.id}
					onclick={() => openSection(s.id)}
				>
					<span class="section-text">
						<span class="section-title">{s.title}</span>
						<span class="section-desc">{s.description}</span>
					</span>
					<span class="row-chev" aria-hidden="true">›</span>
				</button>
			</li>
		{/each}
	</ul>
</div>

<AddProfileSheet open={addProfileOpen} onclose={() => (addProfileOpen = false)} />
<ProfileInviteModal bind:open={inviteOpen} email={inviteEmail} mode={inviteMode} />

<style>
	.hub {
		padding: 8px 16px 28px;
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
	}

	.card {
		position: relative;
		z-index: 4;
		width: 100%;
		border-radius: 16px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		overflow: hidden;
		box-sizing: border-box;
	}

	/* Flat bottom only while decoy stack layers sit underneath */
	.card.stacked {
		border-radius: 16px 16px 0 0;
	}

	.face {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 10px 14px 14px;
		box-sizing: border-box;
		margin: 0;
		background: transparent;
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

	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
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
		transition: transform 0.15s ease, color 0.15s ease;
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
		padding: 10px 10px 10px 14px;
		border-top: 1px solid var(--fg-8, var(--white11));
		box-sizing: border-box;
		margin: 0;
	}

	.invite-btn {
		flex-shrink: 0;
		height: 28px;
		padding: 0 12px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg-66, var(--white66));
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.invite-btn:hover {
		color: var(--fg, var(--white));
		background: var(--fg-8, color-mix(in srgb, var(--fg) 10%, transparent));
	}

	.add-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 14px;
		border: 0;
		border-top: 1px solid var(--fg-8, var(--white11));
		background: transparent;
		color: var(--fg-66, var(--white66));
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
	}

	.add-row:hover {
		color: var(--fg, var(--white));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
	}

	.add-plus {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 1.5px solid var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		font-size: 1.375rem;
		line-height: 1;
		box-sizing: border-box;
		flex-shrink: 0;
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
		gap: 10px;
		padding: 13px 4px;
		border: 0;
		border-bottom: 1px solid var(--fg-8, var(--white11));
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.sections li:last-child .section-row {
		border-bottom: 0;
	}

	.section-row:hover,
	.section-row.on {
		background: color-mix(in srgb, var(--fg) 5%, transparent);
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

	.row-chev {
		font-size: 1.375rem;
		line-height: 1;
		color: var(--fg-33, var(--white44));
	}
</style>
