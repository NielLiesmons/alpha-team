<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import { campaigns, persistCampaign, persistSendCampaign } from '$lib/publications.svelte.js';
	import { closeComposer, ui } from '$lib/workspace.svelte.js';

	let subject = $state('');
	let body = $state('');
	let busy = $state(false);
	let err = $state('');
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let subjectInput = $state();

	const editing = $derived(
		ui.composer?.kind === 'newsletter' && ui.composer.id
			? campaigns.find((c) => c.id === ui.composer.id)
			: null
	);
	const open = $derived(ui.composer?.kind === 'newsletter');

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		const key = editing?.id ?? '__new__';
		if (seededFor === key) return;
		seededFor = key;
		subject = editing?.subject ?? '';
		body = editing?.body ?? '';
		err = '';
		tick().then(() => subjectInput?.focus());
	});

	async function saveDraft() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		if (editing) {
			// API has no PATCH yet — only create new drafts from the modal for now
			err = 'Editing sent/draft text isn’t wired yet — create a new newsletter.';
			return;
		}
		busy = true;
		err = '';
		try {
			await persistCampaign({ subject: nextSubject, body: nextBody });
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function saveAndSend() {
		const nextSubject = subject.trim();
		const nextBody = body.trim();
		if (!nextSubject || !nextBody) return;
		if (!confirm('Send this newsletter to every subscribed address?')) return;
		busy = true;
		err = '';
		try {
			let id = editing?.id;
			if (!id) {
				const c = await persistCampaign({ subject: nextSubject, body: nextBody });
				id = c.id;
			}
			await persistSendCampaign(id);
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<CreateSheet {open} label={editing ? 'Newsletter' : 'New newsletter'} onclose={closeComposer}>
	<div class="sheet-title-row">
		<input
			bind:this={subjectInput}
			class="sheet-input"
			placeholder="Subject"
			bind:value={subject}
		/>
	</div>
	<div class="form-divider"></div>
	<textarea class="sheet-body" placeholder="Write the letter…" rows="12" bind:value={body}></textarea>
	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}
	<div class="sheet-bottom row">
		{#if !editing}
			<button
				type="button"
				class="ghost-btn"
				disabled={busy || !subject.trim() || !body.trim()}
				onclick={saveDraft}
			>
				{busy ? '…' : 'Save draft'}
			</button>
		{/if}
		<button
			type="button"
			class="publish-btn"
			disabled={busy || !subject.trim() || !body.trim()}
			onclick={saveAndSend}
		>
			{busy ? 'Sending…' : editing?.status === 'sent' ? 'Already sent' : 'Send to list'}
		</button>
	</div>
</CreateSheet>

<style>
	.sheet-body {
		display: block;
		width: 100%;
		min-height: 220px;
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

	.sheet-bottom.row {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.ghost-btn {
		height: 2.25rem;
		padding: 0 1rem;
		border-radius: 10px;
		border: 1px solid var(--hairline);
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}

	.ghost-btn:disabled,
	:global(.publish-btn:disabled) {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.err {
		margin: 0;
		padding: 0 14px 8px;
		font-size: 13px;
		color: var(--accent);
	}
</style>
