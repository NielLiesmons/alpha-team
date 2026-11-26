<script>
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import { displayNameFromEmail, setActiveEmail } from '$lib/actor.svelte.js';
	import {
		addDeviceProfile,
		deviceProfiles,
		loadDeviceProfiles,
		switchDeviceProfile
	} from '$lib/device-profiles.svelte.js';
	import { beginInviteOnboarding, endInviteOnboarding } from '$lib/boot.svelte.js';
	import { health } from '$lib/drive/client.js';
	import {
		decodeInvite,
		extractInvitePayload,
		invitePayloadFromLocation,
		isInvitePayload
	} from '$lib/drive/invite.js';
	import { driveSession, saveSession } from '$lib/drive/session.svelte.js';
	import { applyInviteBootstrap } from '$lib/invite-bootstrap.js';
	import {
		beginInviteFlow,
		endInviteFlow,
		inviteFlow,
		setInviteProgress
	} from '$lib/invite-flow.svelte.js';
	import { markMemberJoined, upsertMember } from '$lib/members.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import PasswordRevealField from '$lib/components/PasswordRevealField.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import { redirectToReturnToIfAny } from '$lib/return-to.js';
	import { space, syncSpaceFromHost } from '$lib/sections.js';
	import { spaceBrand, spaceIconUrl, syncSpaceBrandDefaults } from '$lib/space-brand.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {'pick' | 'code' | 'password' | 'warm'} */
	let step = $state('code');
	let invitePayload = $state('');
	let invitePass = $state('');
	let busy = $state(false);
	let error = $state('');
	/** Flash pasted text before morphing away. */
	let flashCode = $state(false);
	/** Panel hugs CTA / progress after code animates out. */
	let panelCompact = $state(false);
	/** Avoid re-flashing the same /join?i= payload. */
	let absorbedUrlPayload = $state('');

	/** @type {HTMLTextAreaElement | HTMLInputElement | undefined} */
	let focusEl = $state();

	const canPick = $derived(driveSession.connected && deviceProfiles.length > 0);
	const spaceName = $derived(String(space.name || '').trim() || t('invite.spaceFallback'));
	const iconSrc = $derived(spaceIconUrl() || spaceBrand.iconUrl);
	const progressPct = $derived(inviteFlow.progress);
	const progressLabel = $derived(
		inviteFlow.label || t('welcome.loadingSpace')
	);

	function absorbInviteFromUrl() {
		const found =
			invitePayloadFromLocation($page.url) ||
			(typeof location !== 'undefined' ? invitePayloadFromLocation(location.href) : null);
		if (!found) return;
		if (found === absorbedUrlPayload) return;
		if (step === 'password' || step === 'warm') return;
		absorbedUrlPayload = found;
		invitePayload = found;
		/* Prefill from /join?i= — brief flash then passphrase. */
		void flashThenPassphrase(found);
	}

	/**
	 * Show code briefly, animate away, shrink panel, open passphrase.
	 * @param {string} raw
	 */
	async function flashThenPassphrase(raw) {
		error = '';
		try {
			invitePayload = extractInvitePayload(raw);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return;
		}
		if (!isInvitePayload(invitePayload)) {
			error = t('welcome.pasteInvite');
			return;
		}
		step = 'code';
		flashCode = true;
		panelCompact = false;
		await tick();
		await new Promise((r) => setTimeout(r, 720));
		flashCode = false;
		panelCompact = true;
		await new Promise((r) => setTimeout(r, 280));
		step = 'password';
		await tick();
		focusEl?.focus();
	}

	onMount(() => {
		syncSpaceFromHost();
		syncSpaceBrandDefaults();
		loadDeviceProfiles();
		absorbInviteFromUrl();
		if (step === 'code' && driveSession.connected && deviceProfiles.length > 0) {
			step = 'pick';
		}
		queueMicrotask(() => focusEl?.focus());
	});

	$effect(() => {
		$page.url.href;
		absorbInviteFromUrl();
	});

	$effect(() => {
		step;
		if (step !== 'warm') void tick().then(() => focusEl?.focus());
	});

	/**
	 * Progressive invite hydrate: chat + mail first (never block on full Space crawl).
	 * Progress is honest step markers — not a fake empty-ready state.
	 */
	async function warmInviteEssentials() {
		setInviteProgress(12, t('welcome.loadingSpace'));
		try {
			const { refreshChatFeed } = await import('$lib/chat.svelte.js');
			setInviteProgress(40, t('welcome.loadingChat'));
			await refreshChatFeed();
		} catch (e) {
			console.warn('invite chat warm', e);
		}
		try {
			const { refreshMail } = await import('$lib/mail.svelte.js');
			setInviteProgress(70, t('welcome.loadingMail'));
			await refreshMail();
		} catch (e) {
			console.warn('invite mail warm', e);
		}
		try {
			const { refreshMembersAndAvatars } = await import('$lib/avatar.svelte.js');
			void refreshMembersAndAvatars().catch(() => {});
		} catch {
			/* ignore */
		}
		setInviteProgress(100, t('welcome.loadingSpace'));
		await new Promise((r) => setTimeout(r, 220));
		endInviteOnboarding();
		endInviteFlow();
		void import('$lib/drive-refresh.js').then(({ refreshBackgroundDrive }) => {
			void refreshBackgroundDrive().catch((e) => console.warn('invite background drive', e));
		});
	}

	async function connectSession(session) {
		const ok = await health(session);
		if (ok !== 'ok') throw new Error(`Drive health returned “${ok}”`);
		saveSession(session);
		/* Don't await full workspace crawl — show Space loading, warm chat+mail, unlock. */
		ui.entitiesReady = false;
		syncSpaceFromHost();
		beginInviteOnboarding(space.name);
		try {
			const { loadSpaceBrand } = await import('$lib/space-brand.svelte.js');
			void loadSpaceBrand(session).catch(() => {});
		} catch {
			/* ignore */
		}
		if (typeof history !== 'undefined' && $page.url.pathname === '/join') {
			history.replaceState({}, '', '/');
		} else if (typeof history !== 'undefined' && $page.url.searchParams.has('i')) {
			history.replaceState({}, '', $page.url.pathname || '/');
		}
		// Shared cookies are written — send phone browsers back to Player same-tab.
		redirectToReturnToIfAny();
	}

	async function pasteInvite() {
		error = '';
		/** @type {string} */
		let text = '';
		try {
			text = await navigator.clipboard.readText();
		} catch {
			/* Fall through to focus field for manual paste. */
			focusEl?.focus();
			error = t('welcome.clipboardBlocked');
			return;
		}
		const trimmed = String(text || '').trim();
		if (!trimmed) {
			error = t('welcome.pasteInvite');
			return;
		}
		await flashThenPassphrase(trimmed);
	}

	/** @param {ClipboardEvent} e */
	function onPaste(e) {
		const text = e.clipboardData?.getData('text') || '';
		if (!text.trim()) return;
		e.preventDefault();
		void flashThenPassphrase(text);
	}

	function backToCode() {
		error = '';
		invitePass = '';
		panelCompact = false;
		flashCode = false;
		step = 'code';
	}

	async function submitPassword() {
		error = '';
		busy = true;
		beginInviteFlow();
		panelCompact = true;
		step = 'warm';
		setInviteProgress(5, t('welcome.loadingSpace'));
		try {
			const session = await decodeInvite(invitePayload, invitePass);
			if (!session.email) {
				throw new Error('This invite has no profile — ask for a new member invite QR.');
			}
			setInviteProgress(18, t('welcome.loadingSpace'));
			addDeviceProfile({
				email: session.email,
				name: session.displayName || session.email.split('@')[0]
			});
			setActiveEmail(session.email);
			await connectSession(session);
			await applyInviteBootstrap(session, { passphrase: invitePass });
			/* Genesis / first invite: directory may be empty — upsert from the invite itself.
			 * upsertMember hydrates Drive first so redeem cannot wipe the Space roster. */
			const role =
				session.role === 'owner' || session.role === 'admin' || session.role === 'member'
					? session.role
					: 'member';
			try {
				await upsertMember({
					email: session.email,
					name: session.displayName || session.email.split('@')[0] || session.email,
					role,
					status: 'active',
					joined_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
				});
			} catch (e) {
				console.warn('welcome upsert member', e);
			}
			await markMemberJoined(session.email);
			/* Chat + mail first; full Space crawl stays in background after the gate lifts. */
			await warmInviteEssentials();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			endInviteFlow();
			step = 'password';
			panelCompact = true;
		} finally {
			busy = false;
		}
	}

	function onPassKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void submitPassword();
		}
	}

	function onCodeKeydown(e) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
			e.preventDefault();
			if (invitePayload.trim()) void flashThenPassphrase(invitePayload);
			else void pasteInvite();
		}
	}
</script>

<main class="welcome">
	<div class="stage" class:compact={panelCompact} class:warm={step === 'warm'}>
		<div class="brand-mark" aria-hidden="true">
			<img class="space-icon" src={iconSrc} alt="" width="88" height="88" />
		</div>

		<h1 class="space-name">{spaceName}</h1>
		<p class="subtitle">{t('welcome.teamspace')}</p>

		{#if step === 'pick'}
			<p class="hint-line">{t('welcome.whosUsing')}</p>
			<ul class="pick-list">
				{#each deviceProfiles as p (p.email)}
					<li>
						<button
							type="button"
							class="pick"
							onclick={() => {
								switchDeviceProfile(p.email);
								redirectToReturnToIfAny();
							}}
						>
							<ProfilePic
								name={displayNameFromEmail(p.email)}
								email={p.email}
								pictureUrl={pictureUrlFor(p.email)}
								size={40}
							/>
							<span class="pick-meta">
								<span class="pick-name">{displayNameFromEmail(p.email)}</span>
								<span class="pick-email">{p.email}</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
			<button type="button" class="ghost" onclick={() => (step = 'code')}>{t('welcome.addWithCode')}</button>
		{:else}
			<div
				class="invite-panel"
				class:compact={panelCompact || step === 'warm'}
				class:flash={flashCode}
				class:pass={step === 'password'}
				class:warming={step === 'warm'}
			>
				{#if step === 'code'}
					<label class="field">
						<span class="sr-only">{t('welcome.inviteCode')}</span>
						<textarea
							bind:this={focusEl}
							rows="3"
							bind:value={invitePayload}
							spellcheck="false"
							placeholder={flashCode ? '' : t('welcome.invitePlaceholder')}
							class:flash-text={flashCode}
							onpaste={onPaste}
							onkeydown={onCodeKeydown}
						></textarea>
					</label>
					{#if error}
						<p class="err" role="alert">{error}</p>
					{/if}
					<button type="button" class="cta active" onclick={pasteInvite}>
						{t('welcome.pasteCta')}
					</button>
				{:else if step === 'password'}
					<label class="field pass-field">
						<span class="sr-only">{t('welcome.passphrase')}</span>
						<PasswordRevealField
							variant="panel"
							bind:element={focusEl}
							bind:value={invitePass}
							autocomplete="off"
							placeholder={t('welcome.passphrase')}
							onkeydown={onPassKeydown}
						/>
					</label>
					{#if error}
						<p class="err" role="alert">{error}</p>
					{/if}
					<button
						type="button"
						class="cta active"
						disabled={busy || !invitePass.trim()}
						onclick={submitPassword}
					>
						{t('welcome.enter')}
					</button>
				{:else}
					<div
						class="progress-bar"
						role="progressbar"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={progressPct}
						aria-label={progressLabel}
					>
						<div class="progress-fill" style={`width: ${progressPct}%`}></div>
						<span class="progress-label">{progressLabel}</span>
						<span class="progress-pct">{progressPct}%</span>
					</div>
				{/if}
			</div>

			{#if step === 'password'}
				<button type="button" class="ghost" disabled={busy} onclick={backToCode}>{t('common.back')}</button>
			{:else if step === 'code' && canPick}
				<button type="button" class="ghost" onclick={() => (step = 'pick')}>{t('welcome.chooseProfile')}</button>
			{/if}
		{/if}
	</div>
</main>

<style>
	.welcome {
		min-height: 100dvh;
		min-height: 100svh;
		display: grid;
		place-items: center;
		padding: 32px 20px;
		padding-bottom: max(32px, env(safe-area-inset-bottom));
		background: var(--shell);
		box-sizing: border-box;
	}

	.stage {
		width: min(360px, 100%);
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
		animation: rise 0.45s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.brand-mark {
		display: flex;
		justify-content: center;
		margin-bottom: 8px;
	}

	.space-icon {
		width: 88px;
		height: 88px;
		border-radius: 999px;
		object-fit: cover;
		box-sizing: border-box;
		border: 1px solid var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
		background: var(--fg-4, color-mix(in srgb, var(--fg) 4%, transparent));
	}

	.space-name {
		margin: 0;
		text-align: center;
		font-size: 1.65rem;
		font-weight: 650;
		line-height: 1.15;
		color: var(--fg, var(--white));
		letter-spacing: -0.02em;
	}

	.subtitle {
		margin: 0 0 10px;
		text-align: center;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--fg-33, var(--white33));
	}

	.hint-line {
		margin: 0 0 2px;
		text-align: center;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--fg-66, var(--white66));
	}

	/* Design-system field chrome — composer-like panel, no mobile glow */
	.invite-panel {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
		padding: 12px;
		border-radius: 18px;
		box-sizing: border-box;
		position: relative;
		isolation: isolate;
		background: var(--composer-bg, color-mix(in srgb, var(--glass) 72%, transparent));
		backdrop-filter: blur(var(--glass-blur, 22px));
		-webkit-backdrop-filter: blur(var(--glass-blur, 22px));
		overflow: hidden;
		transition:
			padding 0.35s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)),
			min-height 0.35s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)),
			gap 0.35s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
		min-height: 148px;
	}

	.invite-panel::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		pointer-events: none;
		z-index: 1;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--fg, var(--ink)) 12%, transparent) 0%,
			color-mix(in srgb, var(--fg, var(--ink)) 3%, transparent) 45%,
			color-mix(in srgb, var(--fg, var(--ink)) 3%, transparent) 55%,
			color-mix(in srgb, var(--fg, var(--ink)) 9%, transparent) 100%
		);
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
	}

	@media (max-width: 767px) {
		.invite-panel::after {
			/* Thin hairline only — no shine / glow on mobile */
			background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		}
	}

	.invite-panel.compact {
		min-height: 0;
		padding: 10px;
		gap: 8px;
	}

	.invite-panel.warming {
		padding: 0;
		gap: 0;
		min-height: 48px;
		border-radius: 14px;
		overflow: hidden;
	}

	.invite-panel.warming::after {
		display: none;
	}

	.field {
		display: block;
		margin: 0;
		position: relative;
		z-index: 2;
	}

	.field textarea,
	.field input {
		width: 100%;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--fg, var(--white));
		font: inherit;
		font-size: 1rem;
		font-weight: 400;
		box-sizing: border-box;
		outline: none;
		box-shadow: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.field textarea::placeholder,
	.field input::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
		text-align: center;
	}

	.field textarea:focus,
	.field input:focus {
		outline: none;
		box-shadow: none;
	}

	.field textarea {
		padding: 18px 12px 8px;
		min-height: 72px;
		resize: none;
		line-height: 1.4;
		text-align: center;
		transition:
			opacity 0.35s ease,
			transform 0.35s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)),
			min-height 0.35s ease,
			padding 0.35s ease;
	}

	.field textarea.flash-text {
		animation: code-flash 0.7s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
	}

	@keyframes code-flash {
		0% {
			opacity: 0;
			transform: translateY(6px);
		}
		25% {
			opacity: 1;
			transform: none;
		}
		70% {
			opacity: 1;
			transform: none;
		}
		100% {
			opacity: 0;
			transform: translateY(-8px);
		}
	}

	.invite-panel.compact .field textarea {
		min-height: 0;
		height: 0;
		padding: 0;
		opacity: 0;
		pointer-events: none;
	}

	.field input {
		height: 44px;
		padding: 0 12px;
		text-align: center;
		letter-spacing: 0.02em;
	}

	.cta {
		position: relative;
		z-index: 2;
		width: 100%;
		height: 48px;
		border: 1px solid transparent;
		border-radius: 14px;
		background:
			var(--button-primary-bg) padding-box,
			var(--glass-shine) border-box;
		background-color: transparent;
		color: var(--button-primary-fg);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		flex-shrink: 0;
	}

	.cta.active {
		opacity: 1;
	}

	.cta:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.progress-bar {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		height: 48px;
		padding: 0 16px;
		border-radius: 14px;
		box-sizing: border-box;
		overflow: hidden;
		background: var(--fg-8, color-mix(in srgb, var(--fg) 8%, transparent));
		color: var(--fg, var(--white));
	}

	.progress-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--button-primary-bg, var(--fg-16));
		opacity: 0.85;
		transition: width 0.4s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
		pointer-events: none;
	}

	.progress-label,
	.progress-pct {
		position: relative;
		z-index: 1;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.progress-label {
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.progress-pct {
		color: var(--fg-66, var(--white66));
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.ghost {
		height: 40px;
		border: 0;
		background: transparent;
		color: var(--fg-33, var(--white33));
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}

	.err {
		margin: 0;
		position: relative;
		z-index: 2;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}

	.pick-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pick {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 14px;
		border: 1px solid var(--hairline);
		background: var(--bg);
		color: var(--white);
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.pick-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.pick-name {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.pick-email {
		font-size: 0.75rem;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
