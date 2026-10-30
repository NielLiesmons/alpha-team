<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import { members } from '$lib/actor.svelte.js';
	import { sendMail } from '$lib/mail.svelte.js';
	import { closeComposer, selectEntity, ui } from '$lib/workspace.svelte.js';

	let toRaw = $state('');
	let subject = $state('');
	let body = $state('');
	let busy = $state(false);
	let err = $state('');
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let toInput = $state();

	const open = $derived(ui.composer?.kind === 'mail');

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		const key = ui.composer?.id ?? '__new__';
		if (seededFor === key) return;
		seededFor = key;
		toRaw = typeof ui.composer?.to === 'string' ? ui.composer.to : '';
		subject = '';
		body = '';
		err = '';
		busy = false;
		tick().then(() => toInput?.focus());
	});

	function parseRecipients(raw) {
		return [
			...new Set(
				String(raw || '')
					.split(/[,;\s]+/)
					.map((s) => s.trim().toLowerCase())
					.filter((s) => s.includes('@'))
			)
		];
	}

	/** @param {string} email */
	function addMember(email) {
		const next = parseRecipients(toRaw);
		if (!next.includes(email)) next.push(email);
		toRaw = next.join(', ');
	}

	async function send() {
		const to = parseRecipients(toRaw);
		if (!to.length || busy) return;
		busy = true;
		err = '';
		try {
			const msg = await sendMail({ to, subject, body });
			closeComposer();
			selectEntity('mail', msg.id);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<CreateSheet {open} label="New message" onclose={closeComposer}>
	<div class="sheet-title-row to-row">
		<span class="to-label">To</span>
		<input
			bind:this={toInput}
			class="sheet-input"
			type="text"
			placeholder="name@bley.farm"
			bind:value={toRaw}
			autocomplete="off"
			spellcheck="false"
		/>
	</div>
	{#if members.length}
		<div class="member-chips">
			{#each members as m (m.email)}
				<button type="button" class="chip" onclick={() => addMember(m.email)}>{m.name}</button>
			{/each}
		</div>
	{/if}
	<div class="form-divider"></div>
	<div class="sheet-title-row">
		<input class="sheet-input" placeholder="Subject" bind:value={subject} />
	</div>
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="Write…" rows="10" bind:value={body}></textarea>
	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}
	<p class="hint">
		Stored on your Space Drive for recipients who share this Space. Internet SMTP / IMAP is not wired
		yet.
	</p>
	<div class="sheet-bottom">
		<button
			type="button"
			class="publish-btn"
			disabled={busy || parseRecipients(toRaw).length === 0 || (!subject.trim() && !body.trim())}
			onclick={() => void send()}
		>
			{busy ? 'Sending…' : 'Send'}
		</button>
	</div>
</CreateSheet>

<style>
	.to-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-inline: 14px;
	}

	.to-row :global(.sheet-input) {
		padding-inline: 0;
	}

	.to-label {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--fg-33);
	}

	.member-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 0 14px 10px;
	}

	.chip {
		height: 28px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.chip:hover {
		background: var(--fg-12);
		color: var(--fg);
	}

	.sheet-body {
		display: block;
		width: 100%;
		min-height: 180px;
		margin: 0;
		padding: 12px 14px;
		border: 0;
		resize: vertical;
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: 15px;
		line-height: 1.5;
		box-sizing: border-box;
	}

	.sheet-body:focus {
		outline: none;
	}

	.hint {
		margin: 0;
		padding: 0 14px 8px;
		font-size: 12px;
		line-height: 1.4;
		color: var(--fg-33);
	}

	.err {
		margin: 0;
		padding: 0 14px 8px;
		font-size: 13px;
		color: var(--accent);
	}

	.sheet-bottom {
		display: flex;
		justify-content: flex-end;
		padding: 0 14px;
	}
</style>
