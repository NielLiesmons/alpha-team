<script>
	/**
	 * Settings hub: horizontal profile cards → section list → detail column.
	 * Follow ADR-shared-design-system + .cursor/rules/alpha-design-system.mdc
	 */
	import AddProfileSheet from './AddProfileSheet.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import Crown from './icons/Crown.svelte';
	import Pen from './icons/Pen.svelte';
	import Share from './icons/Share.svelte';
	import { actor, clearActor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		deviceProfiles,
		hasDeviceProfile,
		removeDeviceProfile,
		switchDeviceProfile
	} from '$lib/device-profiles.svelte.js';
	import { clearSession, driveSession } from '$lib/drive/session.svelte.js';
	import { canManageSpace, members, roleFor } from '$lib/members.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { pwaUi } from '$lib/pwa.svelte.js';
	import { refreshFromDrive, selectEntity, ui } from '$lib/workspace.svelte.js';

	let addProfileOpen = $state(false);
	let shareMsg = $state('');

	const isOperator = $derived(canManageSpace(actor.email));
	const activeEmail = $derived((actor.email || '').trim().toLowerCase());

	/** Admin capability = crown; no separate “admin@” identity required. */
	function isAdminRole(role) {
		return role === 'owner' || role === 'admin';
	}

	/**
	 * Stable name order — never jump the active card to the front (that made switch feel glitchy).
	 */
	const orderedProfiles = $derived.by(() => {
		/** @type {{ email: string, name: string, role?: string, onDevice: boolean }[]} */
		let list = [];
		if (driveSession.connected && members.length) {
			list = members
				.filter((m) => m.status !== 'disabled')
				.map((m) => ({
					email: m.email,
					name: m.name,
					role: m.role,
					onDevice: hasDeviceProfile(m.email)
				}));
		} else {
			list = deviceProfiles.map((p) => ({
				email: p.email,
				name: p.name,
				role: roleFor(p.email) || undefined,
				onDevice: true
			}));
		}
		list.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
		return list;
	});

	const activeSection = $derived(
		ui.selection?.kind === 'settings' ? String(ui.selection.id) : ''
	);

	const sections = $derived.by(() => {
		/** @type {{ id: string, title: string, description: string }[]} */
		const rows = [
			{
				id: 'notifications',
				title: 'Notifications',
				description: pwaUi.pushSubscribed
					? 'Push on · this device'
					: pwaUi.standalone
						? 'Installed · enable push'
						: 'Install / enable push'
			},
			{
				id: 'appearance',
				title: 'Appearance',
				description: `${String(themeChoice.value || 'system')} theme`
			},
			{
				id: 'storage',
				title: 'Storage',
				description: pwaUi.storageLabel || 'Caches & offline data'
			},
			{
				id: 'mail',
				title: 'Mail',
				description: actor.email ? actor.email : 'Mailbox password'
			}
		];
		if (isOperator) {
			rows.push(
				{
					id: 'publications',
					title: 'Publications',
					description: 'API token for letters'
				},
				{
					id: 'drive',
					title: 'Drive',
					description: driveSession.connected ? driveSession.url || 'Connected' : 'Not connected'
				}
			);
		}
		return rows;
	});

	/** @param {string} id */
	function openSection(id) {
		selectEntity('settings', id);
	}

	/** @param {string} email */
	function onSwitchProfile(email) {
		try {
			switchDeviceProfile(email);
			shareMsg = '';
		} catch (err) {
			shareMsg = err instanceof Error ? err.message : String(err);
		}
	}

	/** @param {string} email */
	function onEditProfile(email) {
		onSwitchProfile(email);
		openSection('profile');
	}

	/** @param {string} email */
	async function shareProfile(email) {
		shareMsg = '';
		const e = String(email || '')
			.trim()
			.toLowerCase();
		const name = displayNameFromEmail(e);
		const text = name && e ? `${name} <${e}>` : e || name;
		if (!text) return;
		try {
			if (navigator.share) {
				await navigator.share({ title: name || 'Profile', text });
			} else {
				await navigator.clipboard.writeText(text);
				shareMsg = 'Copied profile to clipboard.';
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') return;
			try {
				await navigator.clipboard.writeText(text);
				shareMsg = 'Copied profile to clipboard.';
			} catch {
				shareMsg = 'Could not share.';
			}
		}
	}

	async function disconnectProfile() {
		const email = activeEmail;
		const label = displayNameFromEmail(email) || email || 'this profile';
		if (!confirm(`Disconnect ${label} on this device?`)) return;
		try {
			if (email) removeDeviceProfile(email);
			if (deviceProfiles.length === 0) {
				clearSession();
				clearActor();
				await refreshFromDrive();
			}
		} catch (e) {
			shareMsg = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<div class="hub">
	<div class="cards-scroll">
		<div class="cards-row">
			{#each orderedProfiles as p (p.email)}
				{@const active = p.email === activeEmail}
				{@const admin = isAdminRole(p.role)}
				<article class="profile-card" class:active class:other={!active}>
					<button
						type="button"
						class="card-main"
						onclick={() => (active ? openSection('profile') : onSwitchProfile(p.email))}
					>
						<ProfilePic
							name={displayNameFromEmail(p.email) || p.name}
							email={p.email}
							pictureUrl={pictureUrlFor(p.email)}
							size={48}
						/>
						<div class="card-meta">
							<span class="card-name-row">
								<span class="card-name">{displayNameFromEmail(p.email) || p.name}</span>
								{#if admin}
									<span class="crown" title="Admin" aria-label="Admin">
										<Crown size={13} />
									</span>
								{/if}
							</span>
							<span class="card-email">{p.email}</span>
						</div>
					</button>
					<div class="card-ctas">
						<button
							type="button"
							class="icon-pill"
							aria-label="Edit profile"
							onclick={() => onEditProfile(p.email)}
						>
							<Pen size={12} />
						</button>
						<button
							type="button"
							class="icon-pill"
							aria-label="Share profile"
							onclick={() => void shareProfile(p.email)}
						>
							<Share size={13} />
						</button>
					</div>
				</article>
			{/each}

			<button type="button" class="profile-card add-card" onclick={() => (addProfileOpen = true)}>
				<span class="add-plus" aria-hidden="true">+</span>
				<span class="add-label">Add Profile</span>
			</button>
		</div>
	</div>

	{#if shareMsg}
		<p class="toast">{shareMsg}</p>
	{/if}

	<hr class="rule" />

	<ul class="section-list">
		{#each sections as s (s.id)}
			<li>
				<button
					type="button"
					class="section-row"
					class:on={activeSection === s.id}
					onclick={() => openSection(s.id)}
				>
					<span class="section-text">
						<span class="section-title">{s.title}</span>
						<span class="section-desc">{s.description}</span>
					</span>
					<span class="chev" aria-hidden="true">›</span>
				</button>
			</li>
		{/each}
	</ul>

	<hr class="rule" />

	<div class="disconnect-wrap">
		<button type="button" class="disconnect" onclick={disconnectProfile}>
			Disconnect {displayNameFromEmail(activeEmail) || 'profile'}
		</button>
	</div>
</div>

<AddProfileSheet open={addProfileOpen} onclose={() => (addProfileOpen = false)} />

<style>
	.hub {
		padding: 4px 0 28px;
		box-sizing: border-box;
	}

	.cards-scroll {
		overflow-x: auto;
		overflow-y: visible;
		padding: 8px 16px 10px;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
	}

	.cards-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: max-content;
		min-height: 168px;
	}

	.profile-card {
		width: 220px;
		min-height: 132px;
		padding: 14px;
		border-radius: 16px;
		border: 1px solid var(--fg-8, var(--white11));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.profile-card.active {
		width: 268px;
		min-height: 156px;
		padding: 16px;
		border: 0;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.card-main {
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
		min-width: 0;
		flex: 1;
	}

	.card-meta {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		min-width: 0;
	}

	.card-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.card-name {
		font-size: 15px;
		font-weight: 650;
		color: var(--fg, var(--white));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile-card.active .card-name {
		font-size: 16px;
	}

	.crown {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		color: var(--fg-33, var(--white44));
	}

	.card-email {
		font-size: 12px;
		color: var(--fg-66, var(--white66));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-ctas {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: auto;
	}

	.icon-pill {
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		border: 0;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg-33, var(--white44));
		display: grid;
		place-items: center;
		cursor: pointer;
		padding: 0;
	}

	.icon-pill:hover {
		background: var(--fg-12, color-mix(in srgb, var(--fg) 12%, transparent));
		color: var(--fg-66, var(--white66));
	}

	.add-card {
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 12px;
		width: 220px;
		min-height: 132px;
		cursor: pointer;
		color: var(--fg-66, var(--white66));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		border: 1px solid var(--fg-8, var(--white11));
		font: inherit;
		text-align: left;
	}

	.add-plus {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 2px solid var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		background: transparent;
		font-size: 28px;
		font-weight: 400;
		line-height: 1;
		color: var(--fg-66, var(--white66));
		flex-shrink: 0;
	}

	.add-label {
		font-size: 14px;
		font-weight: 600;
		color: var(--fg-66, var(--white66));
	}

	.toast {
		margin: 0 16px 8px;
		font-size: 13px;
		color: var(--fg-66, var(--white66));
	}

	.rule {
		border: 0;
		border-top: 1px solid var(--fg-8, var(--white11));
		margin: 10px 0;
	}

	.section-list {
		list-style: none;
		margin: 0;
		padding: 4px 10px 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.section-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 10px;
		border: 0;
		border-radius: 14px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.section-row:hover,
	.section-row.on {
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.section-row.on {
		outline: none;
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

	.chev {
		font-size: 22px;
		line-height: 1;
		color: var(--fg-33, var(--white44));
		padding-right: 4px;
	}

	.disconnect-wrap {
		padding: 8px 16px 0;
	}

	.disconnect {
		width: 100%;
		height: 2.35rem;
		border-radius: 999px;
		border: 0;
		background: transparent;
		color: var(--fg-33, var(--white44));
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.disconnect:hover {
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
		color: var(--fg-66, var(--white66));
	}
</style>
