<script>
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import AlphaLogo from '$lib/components/icons/AlphaLogo.svelte';
	import { displayNameFromEmail, setActiveEmail } from '$lib/actor.svelte.js';
	import {
		addDeviceProfile,
		deviceProfiles,
		loadDeviceProfiles,
		switchDeviceProfile
	} from '$lib/device-profiles.svelte.js';
	import { health } from '$lib/drive/client.js';
	import { decodeInvite, invitePayloadFromLocation, isInvitePayload } from '$lib/drive/invite.js';
	import { driveSession, saveSession } from '$lib/drive/session.svelte.js';
	import { setMailboxPassword } from '$lib/jmap-mail.js';
	import { markMemberJoined } from '$lib/members.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import { redirectToReturnToIfAny } from '$lib/return-to.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {'pick' | 'code' | 'password'} */
	let step = $state('code');
	let invitePayload = $state('');
	let invitePass = $state('');
	let busy = $state(false);
	let error = $state('');

	/** @type {HTMLTextAreaElement | HTMLInputElement | undefined} */
	let focusEl = $state();

	const canPick = $derived(driveSession.connected && deviceProfiles.length > 0);

	function absorbInviteFromUrl() {
		const found =
			invitePayloadFromLocation($page.url) ||
			(typeof location !== 'undefined' ? invitePayloadFromLocation(location.href) : null);
		if (!found) return;
		invitePayload = found;
		step = 'password';
	}

	onMount(() => {
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
		void tick().then(() => focusEl?.focus());
	});

	async function connectSession(session) {
		const ok = await health(session);
		if (ok !== 'ok') throw new Error(`Drive health returned “${ok}”`);
		saveSession(session);
		await refreshFromDrive();
		if (driveSession.error) throw new Error(driveSession.error);
		if (typeof history !== 'undefined' && $page.url.pathname === '/join') {
			history.replaceState({}, '', '/');
		} else if (typeof history !== 'undefined' && $page.url.searchParams.has('i')) {
			history.replaceState({}, '', $page.url.pathname || '/');
		}
		// Shared cookies are written — send phone browsers back to Player same-tab.
		redirectToReturnToIfAny();
	}

	function goPassword() {
		error = '';
		const raw = invitePayload.trim();
		if (!raw) {
			error = t('welcome.pasteInvite');
			return;
		}
		try {
			if (!isInvitePayload(raw)) throw new Error('Not an Alpha invite');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return;
		}
		step = 'password';
	}

	function backToCode() {
		error = '';
		invitePass = '';
		step = 'code';
	}

	async function submitPassword() {
		error = '';
		busy = true;
		try {
			const session = await decodeInvite(invitePayload, invitePass);
			if (!session.email) {
				throw new Error('This invite has no profile — ask for a new member invite QR.');
			}
			addDeviceProfile({
				email: session.email,
				name: session.displayName || session.email.split('@')[0]
			});
			setActiveEmail(session.email);
			if (session.mailboxPassword) {
				setMailboxPassword(session.email, session.mailboxPassword);
			}
			await connectSession(session);
			await markMemberJoined(session.email);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function onCodeKeydown(e) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
			e.preventDefault();
			goPassword();
		}
	}
</script>

<main class="welcome">
	<div class="stage" class:pass={step === 'password'}>
		<div class="mark" aria-hidden="true">
			<AlphaLogo size={72} />
		</div>

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
		{:else if step === 'code'}
			<label class="field solo">
				<span class="sr-only">{t('welcome.inviteCode')}</span>
				<textarea
					bind:this={focusEl}
					rows="3"
					bind:value={invitePayload}
					spellcheck="false"
					placeholder={t('welcome.pasteInvite')}
					onkeydown={onCodeKeydown}
				></textarea>
			</label>
			{#if error}
				<p class="err" role="alert">{error}</p>
			{/if}
			<button
				type="button"
				class="primary"
				disabled={!invitePayload.trim()}
				onclick={goPassword}
			>
				{t('common.continue')}
			</button>
			{#if canPick}
				<button type="button" class="ghost" onclick={() => (step = 'pick')}>{t('welcome.chooseProfile')}</button>
			{/if}
		{:else}
			<p class="hint-line">{t('welcome.enterPassphrase')}</p>
			<label class="field solo">
				<span class="sr-only">{t('welcome.passphrase')}</span>
				<input
					bind:this={focusEl}
					type="password"
					bind:value={invitePass}
					autocomplete="off"
					placeholder={t('welcome.passphrase')}
					onkeydown={(e) => e.key === 'Enter' && submitPassword()}
				/>
			</label>
			{#if error}
				<p class="err" role="alert">{error}</p>
			{/if}
			<button
				type="button"
				class="primary"
				disabled={busy || !invitePass.trim()}
				onclick={submitPassword}
			>
				{busy ? t('common.connecting') : t('welcome.enter')}
			</button>
			<button type="button" class="ghost" disabled={busy} onclick={backToCode}>{t('common.back')}</button>
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
		gap: 14px;
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

	.mark {
		display: flex;
		justify-content: center;
		margin-bottom: 18px;
		color: var(--white);
	}

	.hint-line {
		margin: 0 0 2px;
		text-align: center;
		font-size: 14px;
		font-weight: 500;
		color: var(--white66);
	}

	.field.solo {
		display: block;
		margin: 0;
	}

	.field textarea,
	.field input {
		width: 100%;
		border-radius: 14px;
		border: 1px solid var(--fg-8, var(--hairline));
		background: var(--bg);
		color: var(--fg, var(--white));
		font: inherit;
		font-size: 16px;
		font-weight: 400;
		box-sizing: border-box;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.field textarea::placeholder,
	.field input::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
	}

	.field textarea:focus,
	.field input:focus {
		outline: none;
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.field textarea {
		padding: 14px 16px;
		min-height: 96px;
		resize: none;
		line-height: 1.4;
	}

	.field input {
		height: 48px;
		padding: 0 16px;
		text-align: center;
		letter-spacing: 0.02em;
	}

	.primary {
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
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
	}

	.primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.ghost {
		height: 40px;
		border: 0;
		background: transparent;
		color: var(--white33);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.err {
		margin: 0;
		text-align: center;
		font-size: 13px;
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
		font-size: 15px;
		font-weight: 600;
	}

	.pick-email {
		font-size: 12px;
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
