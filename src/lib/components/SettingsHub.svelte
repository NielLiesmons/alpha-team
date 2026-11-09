<script>
	/**
	 * Settings list: stacked active profile + expandable roster, then section rows.
	 * Detail opens in the third column via selectEntity('settings', id).
	 */
	import AddProfileSheet from './AddProfileSheet.svelte';
	import ProfileInviteModal from './ProfileInviteModal.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import Crown from './icons/Crown.svelte';
	import MoreDots from './icons/MoreDots.svelte';
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
	/** @type {string} */
	let inviteEmail = $state('');
	/** @type {string | null} */
	let menuEmail = $state(null);

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
				description: activeEmail || 'Name, photo, disconnect'
			},
			{
				id: 'notifications',
				title: t('settings.notifications'),
				description: pwaUi.pushSubscribed
					? 'Push on · this device'
					: pwaUi.standalone
						? 'Installed · enable push'
						: 'Install / enable push'
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
		menuEmail = null;
	}

	/** @param {string} id */
	function openSection(id) {
		menuEmail = null;
		if (id === 'profile') setProfileTarget(activeEmail);
		else clearProfileTarget();
		selectEntity('settings', id);
	}

	/** @param {string} email */
	function onSwitch(email) {
		try {
			switchDeviceProfile(email);
			shareMsg = '';
			menuEmail = null;
			profilesOpen = false;
		} catch (err) {
			shareMsg = err instanceof Error ? err.message : String(err);
		}
	}

	/** @param {string} email */
	function onEdit(email) {
		menuEmail = null;
		setProfileTarget(email);
		selectEntity('settings', 'profile');
	}

	/** @param {string} email */
	function onShare(email) {
		shareMsg = '';
		menuEmail = null;
		const e = String(email || '')
			.trim()
			.toLowerCase();
		if (!e.includes('@')) {
			shareMsg = 'Missing profile email.';
			return;
		}
		if (!driveSession.connected) {
			shareMsg = 'Connect Drive first to share an invite QR.';
			return;
		}
		inviteEmail = e;
		inviteOpen = true;
	}

	/** @param {MouseEvent} e */
	function onDocClick(e) {
		const t = /** @type {Node} */ (e.target);
		if (!(t instanceof Element) || !t.closest('.menu-wrap')) menuEmail = null;
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.addEventListener('click', onDocClick);
		return () => document.removeEventListener('click', onDocClick);
	});
</script>

<div class="hub" class:expanded={profilesOpen}>
	<div class="stack" class:open={profilesOpen}>
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
								<span class="crown" title="Admin" aria-label="Admin"><Crown size={13} /></span>
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
					aria-label={profilesOpen ? 'Collapse profiles' : 'Expand profiles'}
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
				<div class="menu-wrap">
					<button
						type="button"
						class="dots"
						aria-label="Profile actions"
						aria-expanded={menuEmail === activeProfile.email}
						onclick={(e) => {
							e.stopPropagation();
							menuEmail = menuEmail === activeProfile.email ? null : activeProfile.email;
						}}
					>
						<MoreDots size={16} />
					</button>
					{#if menuEmail === activeProfile.email}
						<div class="menu" role="menu">
							<button type="button" role="menuitem" onclick={() => onEdit(activeProfile.email)}
								>Edit profile</button
							>
							<button type="button" role="menuitem" onclick={() => onShare(activeProfile.email)}
								>Share invite</button
							>
						</div>
					{/if}
				</div>
			</article>
		{/if}

		{#if !profilesOpen && stackDepth > 0}
			{#each Array(stackDepth) as _, i}
				<div
					class="layer"
					style="--i: {i + 1}"
					aria-hidden="true"
				></div>
			{/each}
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
										<span class="crown" title="Admin" aria-label="Admin"><Crown size={12} /></span>
									{/if}
								</span>
								<span class="email">{p.email}</span>
							</span>
						</button>
						<div class="menu-wrap">
							<button
								type="button"
								class="dots"
								aria-label="Profile actions"
								aria-expanded={menuEmail === p.email}
								onclick={(e) => {
									e.stopPropagation();
									menuEmail = menuEmail === p.email ? null : p.email;
								}}
							>
								<MoreDots size={16} />
							</button>
							{#if menuEmail === p.email}
								<div class="menu" role="menu">
									<button type="button" role="menuitem" onclick={() => onSwitch(p.email)}
										>Switch to</button
									>
									<button type="button" role="menuitem" onclick={() => onEdit(p.email)}
										>Edit profile</button
									>
									<button type="button" role="menuitem" onclick={() => onShare(p.email)}
										>Share invite</button
									>
								</div>
							{/if}
						</div>
					</article>
				{/each}
				<button type="button" class="add-row" onclick={() => (addProfileOpen = true)}>
					<span class="add-plus" aria-hidden="true">+</span>
					<span>Add profile</span>
				</button>
			</div>
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
<ProfileInviteModal bind:open={inviteOpen} email={inviteEmail} />

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
	}

	.face {
		position: relative;
		z-index: 4;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 14px 10px 14px 14px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		box-sizing: border-box;
		transition: border-radius 0.28s ease;
	}

	.stack.open .face {
		border-radius: 16px 16px 0 0;
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
		font-size: 15px;
		font-weight: 650;
		color: var(--fg, var(--white));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.email {
		font-size: 12px;
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

	.chev,
	.dots {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-66, var(--white66));
		display: grid;
		place-items: center;
		cursor: pointer;
		padding: 0;
		font: inherit;
		font-size: 18px;
		line-height: 1;
	}

	.chev:hover,
	.dots:hover {
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg, var(--white));
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
		margin-top: -1px;
		border-radius: 0 0 calc(14px - var(--i) * 3px) calc(14px - var(--i) * 3px);
		background: color-mix(in srgb, var(--fg) calc(7% - var(--i) * 1.8%), transparent);
		z-index: calc(3 - var(--i));
		pointer-events: none;
	}

	.roster {
		width: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: 0 0 16px 16px;
		background: color-mix(in srgb, var(--fg) 5%, transparent);
		animation: roster-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes roster-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.row-card {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 10px 10px 14px;
		border-top: 1px solid var(--fg-8, var(--white11));
		box-sizing: border-box;
	}

	.add-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 14px;
		border: 0;
		border-top: 1px solid var(--fg-8, var(--white11));
		background: transparent;
		color: var(--fg-66, var(--white66));
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
	}

	.add-row:hover {
		color: var(--fg, var(--white));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
	}

	.add-plus {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 1.5px solid var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		font-size: 18px;
		line-height: 1;
	}

	.menu-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 20;
		min-width: 148px;
		padding: 6px;
		border-radius: 12px;
		background: var(--popover, var(--bg));
		border: 1px solid var(--fg-8, var(--white11));
		box-shadow: 0 12px 32px color-mix(in srgb, #000 22%, transparent);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.menu button {
		border: 0;
		background: transparent;
		color: var(--fg, var(--white));
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		text-align: left;
		padding: 9px 10px;
		border-radius: 8px;
		cursor: pointer;
	}

	.menu button:hover {
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.toast {
		margin: 10px 0 0;
		font-size: 13px;
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
		font-size: 15px;
		font-weight: 650;
		color: var(--fg, var(--white));
	}

	.section-desc {
		font-size: 12px;
		color: var(--fg-66, var(--white66));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-chev {
		font-size: 22px;
		line-height: 1;
		color: var(--fg-33, var(--white44));
	}
</style>
