<script>
	import { brand, setBrand } from '$lib/brand.svelte.js';
	import { health } from '$lib/drive/client.js';
	import {
		clearSession,
		driveSession,
		saveSession
	} from '$lib/drive/session.svelte.js';
	import { refreshFromDrive } from '$lib/workspace.svelte.js';
	import { setTheme, themeChoice } from '$lib/theme.svelte.js';

	const choices = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'gray', label: 'Gray' },
		{ id: 'dark', label: 'Dark' },
		{ id: 'black', label: 'Black' }
	];

	const fonts = [
		{ id: 'Ovo', label: 'Ovo' },
		{ id: 'Georgia', label: 'Georgia' },
		{ id: 'Inter', label: 'Inter' }
	];

	let url = $state(driveSession.url);
	let token = $state(driveSession.token);
	let rootKey = $state(driveSession.rootKey);
	let busy = $state(false);
	let msg = $state('');

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
		msg = 'Disconnected — demo Tasks again.';
	}
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<header class="page-head">
	<div>
		<h1>Settings</h1>
		<p>Brand, appearance, and Drive credentials for this browser only.</p>
	</div>
</header>

<section class="block">
	<p class="field-label">Drive</p>
	<p class="hint">
		Bearer token + family root key stay in localStorage on this device. The server only ever sees
		ciphertext. Default URL is production.
	</p>
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
		<button type="button" class="btn" disabled={busy || !token.trim() || !rootKey.trim()} onclick={connect}>
			{busy ? 'Connecting…' : driveSession.connected ? 'Reconnect' : 'Connect'}
		</button>
		{#if driveSession.connected}
			<button type="button" class="btn ghost" disabled={busy} onclick={disconnect}>Disconnect</button>
		{/if}
	</div>
	{#if driveSession.connected}
		<p class="status on">Connected to {driveSession.url}</p>
	{:else}
		<p class="status">Demo mode (sample Tasks)</p>
	{/if}
	{#if msg}
		<p class="status">{msg}</p>
	{/if}
</section>

<section class="block">
	<p class="field-label">Brand</p>
	<p class="hint">
		Accent tints surfaces and marks selection. A second accent is derived automatically for Tasks
		(progress / urgent). CTAs stay ink-on-bg — never accent fills.
	</p>
	<label class="row">
		<span>Accent</span>
		<input
			type="color"
			value={brand.accent}
			oninput={(e) => setBrand({ accent: e.currentTarget.value })}
		/>
		<code>{brand.accent}</code>
	</label>
	<label class="row">
		<span>Display font</span>
		<select
			value={brand.fontDisplay}
			onchange={(e) => setBrand({ fontDisplay: e.currentTarget.value })}
		>
			{#each fonts as font}
				<option value={font.id}>{font.label}</option>
			{/each}
		</select>
	</label>
	<p class="sample" style="font-family: var(--font-display)">
		Bley · accents
		<span class="swatch" style="background: var(--accent)" title="accent"></span>
		<span class="swatch" style="background: var(--accent-2)" title="accent-2"></span>
	</p>
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

<style>
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
		background: var(--gray);
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
		background: var(--gray);
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
		background: var(--white);
		color: var(--black);
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
</style>
