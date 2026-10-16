<script>
	import { onMount } from 'svelte';
	import {
		createCampaign,
		fetchCampaigns,
		fetchMailSettings,
		getAdminToken,
		saveMailSettings,
		sendCampaign,
		setAdminToken
	} from '$lib/mail-api.js';

	/** @type {'welcome' | 'campaigns'} */
	let tab = $state('welcome');
	let busy = $state(false);
	let msg = $state('');
	let err = $state('');
	let tokenDraft = $state('');

	let from = $state('');
	let welcomeEnabled = $state(false);
	let subjectFr = $state('');
	let subjectEn = $state('');
	let bodyFr = $state('');
	let bodyEn = $state('');

	/** @type {any[]} */
	let campaigns = $state([]);
	let draftSubject = $state('');
	let draftBody = $state('');

	async function load() {
		err = '';
		busy = true;
		try {
			const settings = await fetchMailSettings();
			from = settings.from || '';
			welcomeEnabled = Boolean(settings.welcome?.enabled);
			subjectFr = settings.welcome?.subject_fr || '';
			subjectEn = settings.welcome?.subject_en || '';
			bodyFr = settings.welcome?.body_fr || '';
			bodyEn = settings.welcome?.body_en || '';
			const list = await fetchCampaigns();
			campaigns = list.items || [];
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		tokenDraft = getAdminToken();
		load();
	});

	function saveToken() {
		setAdminToken(tokenDraft);
		msg = 'API token saved on this device.';
		load();
	}

	async function saveWelcome() {
		err = '';
		msg = '';
		busy = true;
		try {
			await saveMailSettings({
				from,
				welcome: {
					enabled: welcomeEnabled,
					subject_fr: subjectFr,
					subject_en: subjectEn,
					body_fr: bodyFr,
					body_en: bodyEn
				}
			});
			msg = 'Welcome settings saved.';
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function onCreateCampaign() {
		err = '';
		msg = '';
		busy = true;
		try {
			const c = await createCampaign({ subject: draftSubject, body: draftBody });
			campaigns = [c, ...campaigns];
			draftSubject = '';
			draftBody = '';
			msg = 'Draft created.';
			tab = 'campaigns';
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/**
	 * @param {string} id
	 */
	async function onSend(id) {
		if (!confirm('Send this newsletter to every subscribed address?')) return;
		err = '';
		msg = '';
		busy = true;
		try {
			const c = await sendCampaign(id);
			campaigns = campaigns.map((x) => (x.id === id ? c : x));
			msg = `Sent to ${c.sent_count} subscriber(s).`;
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Mail</title>
</svelte:head>

<header class="page-head">
	<div>
		<h1>Mail</h1>
		<p>Welcome message + newsletter drafts for the Bley list (Resend).</p>
	</div>
</header>

<section class="block">
	<p class="field-label">API access</p>
	<p class="hint">
		Uses <code>api.bley.farm</code>. Paste the same <code>ALPHA_API_ADMIN_TOKEN</code> as on the
		server (stored only in this browser).
	</p>
	<label class="row stack">
		<span>Admin token</span>
		<input type="password" bind:value={tokenDraft} autocomplete="off" spellcheck="false" />
	</label>
	<div class="actions">
		<button type="button" class="btn" onclick={saveToken}>Save token</button>
		<button type="button" class="btn ghost" disabled={busy} onclick={load}>Reload</button>
	</div>
</section>

<div class="tabs" role="tablist">
	<button type="button" class="tab" class:on={tab === 'welcome'} onclick={() => (tab = 'welcome')}
		>Welcome</button
	>
	<button
		type="button"
		class="tab"
		class:on={tab === 'campaigns'}
		onclick={() => (tab = 'campaigns')}>Newsletters</button
	>
</div>

{#if err}
	<p class="err" role="alert">{err}</p>
{/if}
{#if msg}
	<p class="status">{msg}</p>
{/if}

{#if tab === 'welcome'}
	<section class="block">
		<p class="field-label">Sender</p>
		<label class="row stack">
			<span>From</span>
			<input
				type="text"
				bind:value={from}
				placeholder="Bley &lt;news@bley.farm&gt;"
				autocomplete="off"
				spellcheck="false"
			/>
		</label>
		<p class="hint">Falls back to server <code>RESEND_FROM</code> when empty.</p>

		<label class="check">
			<input type="checkbox" bind:checked={welcomeEnabled} />
			<span>Send welcome email on new subscribe</span>
		</label>

		<p class="field-label">French</p>
		<label class="row stack">
			<span>Subject</span>
			<input type="text" bind:value={subjectFr} />
		</label>
		<label class="row stack">
			<span>Body</span>
			<textarea rows="6" bind:value={bodyFr}></textarea>
		</label>

		<p class="field-label">English</p>
		<label class="row stack">
			<span>Subject</span>
			<input type="text" bind:value={subjectEn} />
		</label>
		<label class="row stack">
			<span>Body</span>
			<textarea rows="6" bind:value={bodyEn}></textarea>
		</label>

		<div class="actions">
			<button type="button" class="btn" disabled={busy} onclick={saveWelcome}>
				{busy ? 'Saving…' : 'Save welcome'}
			</button>
		</div>
	</section>
{:else}
	<section class="block">
		<p class="field-label">New newsletter</p>
		<label class="row stack">
			<span>Subject</span>
			<input type="text" bind:value={draftSubject} />
		</label>
		<label class="row stack">
			<span>Body</span>
			<textarea rows="8" bind:value={draftBody} placeholder="Plain text / short paragraphs…"
			></textarea>
		</label>
		<div class="actions">
			<button
				type="button"
				class="btn"
				disabled={busy || !draftSubject.trim() || !draftBody.trim()}
				onclick={onCreateCampaign}
			>
				Save draft
			</button>
		</div>
	</section>

	<section class="block">
		<p class="field-label">Drafts &amp; sent</p>
		{#if campaigns.length === 0}
			<p class="hint">No campaigns yet.</p>
		{:else}
			<ul class="camp-list">
				{#each campaigns as c (c.id)}
					<li class="camp">
						<div class="camp-main">
							<span class="camp-sub">{c.subject}</span>
							<span class="camp-meta">{c.status}{#if c.sent_count} · {c.sent_count} sent{/if}</span
							>
						</div>
						{#if c.status === 'draft' || c.status === 'failed'}
							<button type="button" class="btn" disabled={busy} onclick={() => onSend(c.id)}
								>Send</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.block {
		max-width: 560px;
		margin-bottom: 1.75rem;
	}

	.hint {
		margin: 0 0 0.85rem;
		font-size: 13px;
		color: var(--white66);
	}

	.hint code {
		font-size: 12px;
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
		min-width: 5rem;
		color: var(--white66);
		font-weight: 500;
	}

	.row input,
	.row textarea {
		width: 100%;
		padding: 0.55rem 0.65rem;
		border-radius: 10px;
		border: 1px solid var(--hairline);
		background: var(--surface);
		color: var(--white);
		font: inherit;
		font-weight: 400;
		box-sizing: border-box;
	}

	.row input {
		height: 2.25rem;
		padding-top: 0;
		padding-bottom: 0;
	}

	.row textarea {
		min-height: 6rem;
		resize: vertical;
		line-height: 1.45;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0.5rem 0 1rem;
		font-size: 14px;
		color: var(--white);
		cursor: pointer;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0 0.75rem;
		flex-wrap: wrap;
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
		border: 1px solid var(--hairline);
	}

	.tabs {
		display: flex;
		gap: 4px;
		margin: 0 0 1.25rem;
		padding: 4px;
		max-width: 280px;
		border-radius: 12px;
		background: var(--white4);
	}

	.tab {
		flex: 1;
		height: 34px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--white33);
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
	}

	.tab.on {
		background: var(--white8);
		color: var(--white);
	}

	.status {
		margin: 0 0 0.75rem;
		font-size: 13px;
		color: var(--accent, var(--white66));
	}

	.err {
		margin: 0 0 0.75rem;
		font-size: 13px;
		color: var(--accent);
	}

	.camp-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.camp {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--hairline);
		background: var(--surface);
	}

	.camp-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.camp-sub {
		font-size: 14px;
		font-weight: 600;
		color: var(--white);
	}

	.camp-meta {
		font-size: 12px;
		color: var(--white33);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
</style>
