<script>
	import { onMount } from 'svelte';
	import DriveInvite from '$lib/components/DriveInvite.svelte';
	import { health } from '$lib/drive/client.js';
	import {
		clearSession,
		driveSession,
		saveSession
	} from '$lib/drive/session.svelte.js';
	import { getAdminToken, setAdminToken } from '$lib/mail-api.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';
	import { setTheme, themeChoice } from '$lib/theme.svelte.js';

	const choices = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];

	let url = $state(driveSession.url);
	let token = $state(driveSession.token);
	let rootKey = $state(driveSession.rootKey);
	let busy = $state(false);
	let msg = $state('');
	let advancedOpen = $state(false);
	let apiTokenDraft = $state('');
	let apiTokenMsg = $state('');

	onMount(() => {
		apiTokenDraft = getAdminToken();
	});

	function saveApiToken() {
		setAdminToken(apiTokenDraft);
		apiTokenMsg = 'Saved on this device.';
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
				? `Connected, but load failed: ${driveSession.error}`
				: 'Connected — Tasks load from Drive.';
		} catch (e) {
			msg = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function disconnect() {
		clearSession();
		await refreshFromDrive();
		token = '';
		rootKey = '';
		msg = 'Disconnected — this device is signed out.';
	}
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<div class="feed settings">
<p class="lede">Accounts, Drive, Publications API, brand, and appearance.</p>

<section class="block">
	<p class="field-label">Accounts</p>
	<p class="hint">
		Family people: display name, mailbox (<code>you@bley.farm</code>), and Chatmail address —
		created here later so you don’t need the Stalwart UI. Until then, “I am” below is your
		signed-in mailbox id.
	</p>
</section>

<DriveInvite />

<section class="block">
	<p class="field-label">Publications API</p>
	<p class="hint">
		Bearer token for welcome + newsletters (<code>ALPHA_API_ADMIN_TOKEN</code> on
		<code>api.bley.farm</code>). Stored only in this browser — not for Mail inbox.
	</p>
	<label class="row stack">
		<span>Admin token</span>
		<input type="password" bind:value={apiTokenDraft} autocomplete="off" spellcheck="false" />
	</label>
	<div class="actions">
		<button type="button" class="btn primary" onclick={saveApiToken}>Save token</button>
	</div>
	{#if apiTokenMsg}
		<p class="status on">{apiTokenMsg}</p>
	{/if}
</section>

<section class="block">
	<p class="field-label">Drive (advanced)</p>
	<p class="hint">
		Manual credentials if you are not using an invite. Token + root key stay in localStorage on this
		device only.
	</p>
	<button type="button" class="btn ghost" onclick={() => (advancedOpen = !advancedOpen)}>
		{advancedOpen ? 'Hide' : 'Show'} manual fields
	</button>
	{#if advancedOpen}
		<label class="row stack">
			<span>URL</span>
			<input type="url" bind:value={url} autocomplete="off" spellcheck="false" />
		</label>
		<label class="row stack">
			<span>API token</span>
			<input type="password" bind:value={token} autocomplete="off" spellcheck="false" />
		</label>
		<label class="row stack">
			<span>Root key</span>
			<input type="password" bind:value={rootKey} autocomplete="off" spellcheck="false" />
		</label>
		<div class="actions">
			<button
				type="button"
				class="btn primary"
				disabled={busy || !token.trim() || !rootKey.trim()}
				onclick={connect}
			>
				{busy ? 'Connecting…' : driveSession.connected ? 'Reconnect' : 'Connect'}
			</button>
			{#if driveSession.connected}
				<button type="button" class="btn ghost" disabled={busy} onclick={disconnect}>Disconnect</button>
			{/if}
		</div>
	{:else if driveSession.connected}
		<div class="actions">
			<button type="button" class="btn ghost" disabled={busy} onclick={disconnect}>Disconnect</button>
		</div>
	{/if}
	{#if driveSession.connected}
		<p class="status on">Connected to {driveSession.url}</p>
	{:else}
		<p class="status">Not connected — use Join Drive above or reconnect manually.</p>
	{/if}
	{#if msg}
		<p class="status">{msg}</p>
	{/if}
</section>

<section class="block">
	<p class="field-label">Brand</p>
	<p class="hint">
		Admin uses a fixed accent trio for now (no custom Space colors): primary CTAs / closed tasks,
		progress, and urgent / destructive.
	</p>
	<p class="sample">
		Accents
		<span class="swatch" style="background: var(--accent-1)" title="accent-1"></span>
		<span class="swatch" style="background: var(--accent-2)" title="accent-2"></span>
		<span class="swatch" style="background: var(--accent-3)" title="accent-3"></span>
		<span class="swatch gradient" title="accent-1 gradient"></span>
	</p>
	<p class="hint">Admin stays Inter only — no display/serif face. Public sites may use Ovo separately.</p>
</section>

<section class="block">
	<p class="field-label">Appearance</p>
	<div class="seg" role="radiogroup" aria-label="Appearance">
		{#each choices as choice (choice.id)}
			<button
				type="button"
				class:on={themeChoice.value === choice.id}
				role="radio"
				aria-checked={themeChoice.value === choice.id}
				onclick={() => setTheme(choice.id)}
			>
				{choice.label}
			</button>
		{/each}
	</div>
</section>
</div>

<style>
	.settings {
		padding-left: 16px;
		padding-right: 16px;
		box-sizing: border-box;
	}

	.lede {
		margin: 0 0 1.25rem;
		font-size: 13px;
		color: var(--fg-33);
	}

	.block {
		max-width: 520px;
		margin-bottom: 1.75rem;
	}

	.hint {
		margin: 0 0 0.85rem;
		font-size: 13px;
		color: var(--white66);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		font-size: 14px;
		font-weight: 600;
	}

	.row.stack {
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
	}

	.row span {
		min-width: 6.5rem;
		color: var(--white66);
		font-weight: 500;
	}

	.row input[type='color'] {
		width: 2.5rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--white11);
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
	}

	.row input[type='url'],
	.row input[type='password'],
	.row input[type='text'] {
		width: 100%;
		height: 2.25rem;
		padding: 0 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: var(--surface);
		color: var(--white);
		font: inherit;
		font-weight: 400;
	}

	.row select {
		flex: 1;
		height: 2.25rem;
		padding: 0 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--white11);
		background: var(--surface);
		color: var(--white);
		font: inherit;
	}

	.row code {
		font-size: 12px;
		color: var(--white33);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0 0.75rem;
	}

	.btn {
		height: 2.25rem;
		padding: 0 1rem;
		border-radius: 10px;
		border: none;
		background-image: var(--button-primary-bg);
		background-color: transparent;
		color: var(--whiteEnforced);
		font: inherit;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}

	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn.ghost {
		background-image: none;
		background: transparent;
		color: var(--white66);
		border: 1px solid var(--white11);
	}

	.status {
		margin: 0.25rem 0 0;
		font-size: 13px;
		color: var(--white66);
	}

	.status.on {
		color: var(--accent, var(--white));
	}

	.sample {
		margin: 1rem 0 0;
		font-size: 1.35rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.swatch {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 999px;
	}

	.swatch.gradient {
		background: var(--gradient-accent-1);
	}
</style>
