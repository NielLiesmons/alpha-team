<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import { mailSettings, persistMailSettings } from '$lib/publications.svelte.js';
	import { closeComposer, ui } from '$lib/workspace.svelte.js';

	let from = $state('');
	let enabled = $state(false);
	let subjectFr = $state('');
	let subjectEn = $state('');
	let bodyFr = $state('');
	let bodyEn = $state('');
	let busy = $state(false);
	let err = $state('');
	/** @type {string | null} */
	let seededFor = $state(null);

	const open = $derived(ui.composer?.kind === 'welcome');

	$effect(() => {
		if (!open) {
			seededFor = null;
			return;
		}
		if (seededFor === 'welcome') return;
		seededFor = 'welcome';
		from = mailSettings.from;
		enabled = mailSettings.welcome.enabled;
		subjectFr = mailSettings.welcome.subject_fr;
		subjectEn = mailSettings.welcome.subject_en;
		bodyFr = mailSettings.welcome.body_fr;
		bodyEn = mailSettings.welcome.body_en;
		err = '';
		tick();
	});

	async function save() {
		busy = true;
		err = '';
		try {
			await persistMailSettings({
				from,
				welcome: {
					enabled,
					subject_fr: subjectFr,
					subject_en: subjectEn,
					body_fr: bodyFr,
					body_en: bodyEn
				}
			});
			closeComposer();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<CreateSheet {open} label="Welcome message" onclose={closeComposer}>
	<label class="check">
		<input type="checkbox" bind:checked={enabled} />
		<span>Send on new subscribe</span>
	</label>
	<div class="form-divider"></div>
	<div class="sheet-title-row">
		<input class="sheet-input" placeholder="From — Bley &lt;news@bley.farm&gt;" bind:value={from} />
	</div>
	<div class="form-divider"></div>
	<p class="lang">French</p>
	<div class="sheet-title-row">
		<input class="sheet-input" placeholder="Subject (FR)" bind:value={subjectFr} />
	</div>
	<textarea class="sheet-body" rows="5" placeholder="Body (FR)" bind:value={bodyFr}></textarea>
	<div class="form-divider"></div>
	<p class="lang">English</p>
	<div class="sheet-title-row">
		<input class="sheet-input" placeholder="Subject (EN)" bind:value={subjectEn} />
	</div>
	<textarea class="sheet-body" rows="5" placeholder="Body (EN)" bind:value={bodyEn}></textarea>
	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}
	<div class="sheet-bottom">
		<button type="button" class="publish-btn" disabled={busy} onclick={save}>
			{busy ? 'Saving…' : 'Save welcome'}
		</button>
	</div>
</CreateSheet>

<style>
	.check {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0;
		padding: 12px 14px;
		font-size: 14px;
		color: var(--fg);
		cursor: pointer;
	}

	.lang {
		margin: 0;
		padding: 8px 14px 0;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
	}

	.sheet-body {
		display: block;
		width: 100%;
		min-height: 100px;
		margin: 0;
		padding: 10px 14px;
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

	.err {
		margin: 0;
		padding: 0 14px 8px;
		font-size: 13px;
		color: var(--accent);
	}
</style>
