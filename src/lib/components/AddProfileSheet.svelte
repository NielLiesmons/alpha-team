<script>
	/**
	 * Two-step invite claim for an already-signed-in device (add another profile).
	 */
	import { tick } from 'svelte';
	import AlphaLogo from '$lib/components/icons/AlphaLogo.svelte';
	import { setActiveEmail } from '$lib/actor.svelte.js';
	import { addDeviceProfile } from '$lib/device-profiles.svelte.js';
	import { health } from '$lib/drive/client.js';
	import { decodeInvite, isInvitePayload } from '$lib/drive/invite.js';
	import { saveSession } from '$lib/drive/session.svelte.js';
	import { setMailboxPassword } from '$lib/jmap-mail.js';
	import { markMemberJoined } from '$lib/members.svelte.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';

	/** @type {{ open: boolean, onclose?: () => void }} */
	let { open = false, onclose = () => {} } = $props();

	/** @type {'code' | 'password'} */
	let step = $state('code');
	let invitePayload = $state('');
	let invitePass = $state('');
	let busy = $state(false);
	let error = $state('');

	/** @type {HTMLTextAreaElement | HTMLInputElement | undefined} */
	let focusEl = $state();

	$effect(() => {
		if (!open) return;
		step = 'code';
		invitePayload = '';
		invitePass = '';
		error = '';
		void tick().then(() => focusEl?.focus());
	});

	function goPassword() {
		error = '';
		try {
			if (!isInvitePayload(invitePayload)) throw new Error('Not an Alpha invite');
			step = 'password';
			void tick().then(() => focusEl?.focus());
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function submitPassword() {
		error = '';
		busy = true;
		try {
			const session = await decodeInvite(invitePayload, invitePass);
			if (!session.email) {
				throw new Error('This invite has no profile — ask for a new member invite QR.');
			}
			const ok = await health(session);
			if (ok !== 'ok') throw new Error(`Drive health returned “${ok}”`);
			saveSession(session);
			addDeviceProfile({
				email: session.email,
				name: session.displayName || session.email.split('@')[0]
			});
			setActiveEmail(session.email);
			if (session.mailboxPassword) {
				setMailboxPassword(session.email, session.mailboxPassword);
			}
			await refreshFromDrive();
			await markMemberJoined(session.email);
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<div class="scrim" role="presentation" onclick={() => !busy && onclose()}>
		<div
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label="Add profile"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mark"><AlphaLogo size={40} /></div>
			{#if step === 'code'}
				<p class="lead">Paste an invite code to add a profile on this device.</p>
				<textarea
					bind:this={focusEl}
					rows="3"
					bind:value={invitePayload}
					spellcheck="false"
					placeholder="Paste invite code or link"
				></textarea>
				{#if error}
					<p class="err">{error}</p>
				{/if}
				<button type="button" class="btn" disabled={!invitePayload.trim()} onclick={goPassword}
					>Continue</button
				>
			{:else}
				<p class="lead">Passphrase</p>
				<input
					bind:this={focusEl}
					type="password"
					bind:value={invitePass}
					autocomplete="off"
					placeholder="Passphrase"
					onkeydown={(e) => e.key === 'Enter' && submitPassword()}
				/>
				{#if error}
					<p class="err">{error}</p>
				{/if}
				<button
					type="button"
					class="btn"
					disabled={busy || !invitePass.trim()}
					onclick={submitPassword}
				>
					{busy ? 'Adding…' : 'Add profile'}
				</button>
				<button type="button" class="link" disabled={busy} onclick={() => (step = 'code')}
					>Back</button
				>
			{/if}
			<button type="button" class="link" disabled={busy} onclick={onclose}>Cancel</button>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: end center;
		padding: 16px;
		padding-bottom: max(16px, env(safe-area-inset-bottom));
		background: color-mix(in srgb, #000 45%, transparent);
		box-sizing: border-box;
	}

	@media (min-width: 768px) {
		.scrim {
			place-items: center;
		}
	}

	.sheet {
		width: min(400px, 100%);
		padding: 22px 20px 16px;
		border-radius: 20px;
		background: var(--bg);
		border: 1px solid var(--hairline);
		box-shadow: 0 20px 60px var(--shadow-strong);
		display: flex;
		flex-direction: column;
		gap: 10px;
		box-sizing: border-box;
	}

	.mark {
		display: flex;
		justify-content: center;
		color: var(--white);
		margin-bottom: 4px;
	}

	.lead {
		margin: 0;
		text-align: center;
		font-size: 14px;
		color: var(--white66);
	}

	textarea,
	input {
		width: 100%;
		border-radius: 12px;
		border: 1px solid var(--hairline);
		background: var(--surface);
		color: var(--white);
		font: inherit;
		font-size: 16px;
		box-sizing: border-box;
	}

	textarea {
		padding: 12px 14px;
		min-height: 88px;
		resize: none;
	}

	input {
		height: 44px;
		padding: 0 14px;
		text-align: center;
	}

	.btn {
		height: 44px;
		border: 0;
		border-radius: 12px;
		background-image: var(--button-primary-bg);
		color: var(--whiteEnforced);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.btn:disabled {
		opacity: 0.45;
	}

	.link {
		border: 0;
		background: transparent;
		color: var(--white33);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		padding: 6px;
	}

	.err {
		margin: 0;
		text-align: center;
		font-size: 13px;
		color: var(--accent);
	}
</style>
