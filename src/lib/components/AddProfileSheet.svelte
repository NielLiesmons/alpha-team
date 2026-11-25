<script>
	/**
	 * Add Profile — paste invite / profile code (WelcomeGate UX) inside DS Modal.
	 * Admin account creation lives in Admin → Create member, not here.
	 */
	import { tick } from 'svelte';
	import SheetTopbar from '@alpha/ui/SheetTopbar.svelte';
	import Modal from './Modal.svelte';
	import { setActiveEmail } from '$lib/actor.svelte.js';
	import { addDeviceProfile } from '$lib/device-profiles.svelte.js';
	import { health } from '$lib/drive/client.js';
	import {
		decodeInvite,
		extractInvitePayload,
		isInvitePayload
	} from '$lib/drive/invite.js';
	import { applyInviteBootstrap } from '$lib/invite-bootstrap.js';
	import { saveSession } from '$lib/drive/session.svelte.js';
	import { markMemberJoined, upsertMember } from '$lib/members.svelte.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {{ open: boolean, onclose?: () => void }} */
	let { open = $bindable(false), onclose = () => {} } = $props();

	/** @type {'code' | 'password' | 'warm'} */
	let step = $state('code');
	let invitePayload = $state('');
	let invitePass = $state('');
	let busy = $state(false);
	let error = $state('');
	let flashCode = $state(false);
	let panelCompact = $state(false);
	let progressPct = $state(0);
	let progressLabel = $state('');

	/** @type {HTMLTextAreaElement | HTMLInputElement | undefined} */
	let focusEl = $state();

	$effect(() => {
		if (!open) return;
		step = 'code';
		invitePayload = '';
		invitePass = '';
		busy = false;
		error = '';
		flashCode = false;
		panelCompact = false;
		progressPct = 0;
		progressLabel = '';
		void tick().then(() => focusEl?.focus());
	});

	function close() {
		if (busy) return;
		open = false;
		onclose();
	}

	/**
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

	async function pasteInvite() {
		error = '';
		/** @type {string} */
		let text = '';
		try {
			text = await navigator.clipboard.readText();
		} catch {
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
		void tick().then(() => focusEl?.focus());
	}

	async function submitPassword() {
		error = '';
		busy = true;
		panelCompact = true;
		step = 'warm';
		progressPct = 12;
		progressLabel = t('welcome.loadingSpace');
		try {
			const session = await decodeInvite(invitePayload, invitePass);
			if (!session.email) {
				throw new Error('This invite has no profile — ask for a new member invite QR.');
			}
			progressPct = 40;
			const ok = await health(session);
			if (ok !== 'ok') throw new Error(`Drive health returned “${ok}”`);
			saveSession(session);
			addDeviceProfile({
				email: session.email,
				name: session.displayName || session.email.split('@')[0]
			});
			setActiveEmail(session.email);
			progressPct = 70;
			progressLabel = t('welcome.loadingChat');
			await applyInviteBootstrap(session);
			progressPct = 90;
			await refreshFromDrive();
			/* Persist invite role so admin codes unlock full Admin roster on this device. */
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
				console.warn('add-profile upsert member', e);
			}
			await markMemberJoined(session.email);
			progressPct = 100;
			await new Promise((r) => setTimeout(r, 180));
			close();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			step = 'password';
			panelCompact = true;
		} finally {
			busy = false;
		}
	}

	function onCodeKeydown(e) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
			e.preventDefault();
			if (invitePayload.trim()) void flashThenPassphrase(invitePayload);
			else void pasteInvite();
		}
	}

	function onPassKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void submitPassword();
		}
	}
</script>

<Modal bind:open label={t('settings.addProfile')}>
	<div class="sheet">
		<SheetTopbar
			title={t('settings.addProfile')}
			trailing="none"
			closeLabel={t('common.close')}
			onclose={close}
		/>
		<div class="body" class:compact={panelCompact || step === 'warm'}>
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
					<button type="button" class="cta" onclick={pasteInvite}>
						{t('welcome.pasteCta')}
					</button>
				{:else if step === 'password'}
					<label class="field pass-field">
						<span class="sr-only">{t('welcome.passphrase')}</span>
						<input
							bind:this={focusEl}
							type="password"
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
						class="cta"
						disabled={busy || !invitePass.trim()}
						onclick={() => void submitPassword()}
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
				<button type="button" class="ghost" disabled={busy} onclick={backToCode}
					>{t('common.back')}</button
				>
			{:else if step === 'code'}
				<p class="hint">{t('settings.addProfileHint')}</p>
			{/if}
		</div>
	</div>
</Modal>

<style>
	.sheet {
		display: flex;
		flex-direction: column;
		max-height: min(78vh, 640px);
		overflow: auto;
		box-sizing: border-box;
	}

	.body {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 14px;
		padding: 8px 16px 20px;
		box-sizing: border-box;
		transition: gap 0.28s ease;
	}

	.body.compact {
		gap: 10px;
	}

	.invite-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		transition:
			min-height 0.28s ease,
			gap 0.28s ease;
	}

	.invite-panel.compact {
		gap: 10px;
	}

	.field {
		display: block;
		margin: 0;
	}

	.field textarea,
	.field input {
		width: 100%;
		box-sizing: border-box;
		border-radius: 18px;
		border: 1px solid var(--fg-8, var(--hairline));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		color: var(--fg, var(--white));
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		outline: none;
		padding: 14px 16px;
		resize: none;
		line-height: 1.4;
	}

	.field.pass-field input {
		border-radius: 999px;
		min-height: 48px;
		padding: 0 16px;
	}

	.field textarea:focus,
	.field input:focus {
		border-color: var(--fg-16, color-mix(in srgb, var(--fg) 16%, transparent));
	}

	.field textarea::placeholder,
	.field input::placeholder {
		color: var(--fg-33, var(--white33));
		font-weight: 500;
	}

	.field textarea.flash-text {
		animation: flash-pulse 0.72s ease;
	}

	@keyframes flash-pulse {
		0%,
		100% {
			opacity: 1;
		}
		40% {
			opacity: 0.55;
		}
	}

	.cta {
		height: 48px;
		border: 0;
		border-radius: 999px;
		background: var(--button-primary-bg, var(--fg));
		color: var(--button-primary-fg, var(--bg));
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 650;
		cursor: pointer;
	}

	.cta:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.ghost {
		border: 0;
		background: transparent;
		color: var(--fg-33, var(--white33));
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		padding: 4px;
		align-self: center;
	}

	.ghost:hover {
		color: var(--fg-66, var(--white66));
	}

	.hint {
		margin: 0;
		text-align: center;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--fg-33, var(--white33));
	}

	.err {
		margin: 0;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--fg-66, var(--white66));
	}

	.progress-bar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-height: 48px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid var(--fg-8, var(--hairline));
		background: color-mix(in srgb, var(--fg) 4%, transparent);
		overflow: hidden;
		box-sizing: border-box;
	}

	.progress-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--button-primary-bg, var(--fg-8));
		opacity: 0.55;
		transition: width 0.25s ease;
	}

	.progress-label,
	.progress-pct {
		position: relative;
		z-index: 1;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--fg, var(--white));
	}

	.progress-pct {
		color: var(--fg-66, var(--white66));
		font-weight: 500;
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
