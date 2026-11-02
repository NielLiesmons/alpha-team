<script>
	/**
	 * Zapchat-style Settings hub:
	 * horizontal profile cards (active + others + add) → section list → detail column / mobile modal.
	 */
	import AddProfileSheet from './AddProfileSheet.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { actor, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import {
		deviceProfiles,
		removeDeviceProfile,
		switchDeviceProfile
	} from '$lib/device-profiles.svelte.js';
	import { clearSession, driveSession } from '$lib/drive/session.svelte.js';
	import { canManageSpace, roleFor } from '$lib/members.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { pwaUi } from '$lib/pwa.svelte.js';
	import { refreshFromDrive, selectEntity, ui } from '$lib/workspace.svelte.js';

	let addProfileOpen = $state(false);
	let shareMsg = $state('');

	const isOperator = $derived(canManageSpace(actor.email));
	const myRole = $derived(roleFor(actor.email));
	const activeEmail = $derived((actor.email || '').trim().toLowerCase());

	const orderedProfiles = $derived.by(() => {
		const list = [...deviceProfiles];
		list.sort((a, b) => {
			const ae = a.email === activeEmail ? 0 : 1;
			const be = b.email === activeEmail ? 0 : 1;
			return ae - be;
		});
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

	async function shareActive() {
		shareMsg = '';
		const email = activeEmail;
		const name = displayNameFromEmail(email);
		const text = name && email ? `${name} <${email}>` : email || name;
		if (!text) return;
		try {
			if (navigator.share) {
				await navigator.share({ title: name || 'Profile', text });
			} else {
				await navigator.clipboard.writeText(text);
				shareMsg = 'Copied profile to clipboard.';
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') return;
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
			/* Last profile on device → drop Drive session too. */
			if (deviceProfiles.length === 0) {
				clearSession();
				await refreshFromDrive();
			}
		} catch (e) {
			shareMsg = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<div class="hub">
	<header class="profiles-head">
		<span class="profiles-icon" aria-hidden="true">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
				<path
					d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
					stroke="currentColor"
					stroke-width="1.6"
				/>
				<path
					d="M4.5 20.25a7.5 7.5 0 0 1 15 0"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
				/>
			</svg>
		</span>
		<h2 class="profiles-title">Profiles</h2>
	</header>

	<div class="cards-scroll">
		<div class="cards-row">
			{#each orderedProfiles as p (p.email)}
				{@const active = p.email === activeEmail}
				<article class="profile-card" class:active class:other={!active}>
					<button
						type="button"
						class="card-main"
						onclick={() => (active ? openSection('profile') : onSwitchProfile(p.email))}
					>
						<ProfilePic
							name={displayNameFromEmail(p.email)}
							email={p.email}
							pictureUrl={pictureUrlFor(p.email)}
							size={48}
						/>
						<div class="card-meta">
							<span class="card-name">{displayNameFromEmail(p.email)}</span>
							<span class="card-email">{p.email}</span>
							{#if active && myRole}
								<span class="card-role">{myRole}</span>
							{/if}
						</div>
					</button>
					{#if active}
						<div class="card-ctas">
							<button type="button" class="cta" onclick={() => openSection('profile')}>Edit</button>
							<button type="button" class="cta" onclick={shareActive}>Share</button>
						</div>
					{:else}
						<div class="card-ctas">
							<button type="button" class="cta" onclick={() => onSwitchProfile(p.email)}
								>Switch</button
							>
						</div>
					{/if}
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
		padding: 8px 0 28px;
		box-sizing: border-box;
	}

	.profiles-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 16px 12px;
	}

	.profiles-icon {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--fg) 10%, transparent);
		color: var(--white66);
	}

	.profiles-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--white);
	}

	.cards-scroll {
		overflow-x: auto;
		overflow-y: visible;
		padding: 0 16px 4px;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
	}

	.cards-row {
		display: flex;
		gap: 14px;
		width: max-content;
		padding-bottom: 8px;
	}

	.profile-card {
		width: min(256px, 72vw);
		min-height: 144px;
		padding: 14px;
		border-radius: 16px;
		border: 1px solid var(--white11);
		background: color-mix(in srgb, var(--fg) 5%, var(--surface, transparent));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.profile-card.active {
		border-color: color-mix(in srgb, var(--accent, #3d7ea6) 45%, var(--white11));
		background: color-mix(in srgb, var(--accent, #3d7ea6) 10%, var(--surface, transparent));
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
	}

	.card-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.card-name {
		font-size: 15px;
		font-weight: 650;
		color: var(--white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-email,
	.card-role {
		font-size: 12px;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-ctas {
		display: flex;
		gap: 8px;
		margin-top: auto;
	}

	.cta {
		flex: 1;
		height: 2rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: color-mix(in srgb, var(--fg) 6%, transparent);
		color: var(--white);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.cta:hover {
		border-color: color-mix(in srgb, var(--accent, #3d7ea6) 40%, var(--white11));
	}

	.add-card {
		align-items: flex-start;
		justify-content: center;
		gap: 12px;
		cursor: pointer;
		color: var(--white66);
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		border-style: dashed;
	}

	.add-plus {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--fg) 8%, transparent);
		font-size: 22px;
		line-height: 1;
		color: var(--white66);
	}

	.add-label {
		font-size: 14px;
		font-weight: 600;
	}

	.toast {
		margin: 0 16px 8px;
		font-size: 13px;
		color: var(--accent, var(--white));
	}

	.rule {
		border: 0;
		border-top: 1px solid var(--white11);
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
		outline: 1px solid color-mix(in srgb, var(--accent, #3d7ea6) 35%, transparent);
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
		color: var(--white);
	}

	.section-desc {
		font-size: 12px;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chev {
		font-size: 22px;
		line-height: 1;
		color: var(--white44, var(--white66));
		padding-right: 4px;
	}

	.disconnect-wrap {
		padding: 8px 16px 0;
	}

	.disconnect {
		width: 100%;
		height: 2.5rem;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, #c44 35%, var(--white11));
		background: color-mix(in srgb, #c44 10%, transparent);
		color: #e87878;
		font: inherit;
		font-size: 14px;
		font-weight: 650;
		cursor: pointer;
	}
</style>
