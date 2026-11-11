<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import ProfilePic from './ProfilePic.svelte';
	import { displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { profileNameCss } from '$lib/color.js';
	import { t } from '$lib/i18n.svelte.js';
	import { mailAddressBook, refreshMailAddressBook } from '$lib/mail-addressbook.svelte.js';
	import { plainMailBody } from '$lib/mail-body.js';
	import { sendMail } from '$lib/mail.svelte.js';
	import { themeChoice } from '$lib/theme.svelte.js';
	import { closeComposer, selectEntity, ui } from '$lib/workspace.svelte.js';

	let toRaw = $state('');
	let subject = $state('');
	let body = $state('');
	let busy = $state(false);
	let err = $state('');
	let bookReady = $state(false);
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let toInput = $state();
	/** @type {import('@tiptap/core').Editor | null} */
	let tipTap = $state(null);
	let query = $state('');
	let tokenStart = $state(0);
	let tokenEnd = $state(0);
	let dismissed = $state(false);
	let selected = $state(0);

	const open = $derived(ui.composer?.kind === 'mail');
	const editorKey = $derived(open ? String(ui.composer?.id ?? 'new') : 'closed');
	const plainBody = $derived(plainMailBody(body));

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	/** @param {string} raw */
	function parseRecipients(raw) {
		const found = [];
		const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
		for (const match of String(raw || '').matchAll(re)) {
			const email = match[0].toLowerCase();
			if (!found.includes(email)) found.push(email);
		}
		return found;
	}

	const suggestions = $derived.by(() => {
		mailAddressBook.length;
		const q = query.trim().toLowerCase();
		if (!q) return [];
		const taken = new Set(parseRecipients(toRaw));
		if (q.includes('@')) taken.delete(q);
		const rows = [];
		for (const contact of mailAddressBook) {
			if (taken.has(contact.email)) continue;
			const name = contact.name || displayNameFromEmail(contact.email);
			if (!contact.email.includes(q) && !name.toLowerCase().includes(q)) continue;
			const starts =
				contact.email.startsWith(q) || name.toLowerCase().startsWith(q) ? 0 : 1;
			rows.push({ ...contact, label: name, rank: starts });
		}
		rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
		return rows.slice(0, 8);
	});

	const menuOpen = $derived(query.trim().length > 0 && !dismissed && (suggestions.length > 0 || bookReady));

	$effect(() => {
		query;
		selected = 0;
	});

	$effect(() => {
		if (!open) {
			seededFor = null;
			bookReady = false;
			dismissed = false;
			query = '';
			return;
		}
		const key = ui.composer?.id ?? '__new__';
		if (seededFor === key) return;
		seededFor = key;
		toRaw = typeof ui.composer?.to === 'string' ? ui.composer.to : '';
		subject = typeof ui.composer?.subject === 'string' ? ui.composer.subject : '';
		body = typeof ui.composer?.body === 'string' ? ui.composer.body : '';
		err = '';
		busy = false;
		dismissed = false;
		query = '';
		bookReady = mailAddressBook.length > 0;
		void refreshMailAddressBook().finally(() => {
			if (open) bookReady = true;
		});
		tick().then(() => {
			requestAnimationFrame(() => {
				toInput?.focus();
				const end = toInput?.value.length ?? 0;
				toInput?.setSelectionRange(end, end);
				syncToken();
			});
		});
	});

	function syncToken() {
		const el = toInput;
		const value = el?.value ?? toRaw;
		const cursor = el?.selectionStart ?? value.length;
		const before = value.slice(0, cursor);
		const start = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1;
		const rawToken = before.slice(start);
		const nextQuery = rawToken.trim();
		if (nextQuery !== query) dismissed = false;
		query = nextQuery;
		tokenStart = start + rawToken.length - rawToken.trimStart().length;
		tokenEnd = cursor;
	}

	/** @param {{ email: string }} contact */
	function choose(contact) {
		const value = toInput?.value ?? toRaw;
		const head = value.slice(0, tokenStart).replace(/\s*$/, '');
		const prefix = head && !/[,;]$/.test(head) ? `${head}, ` : head ? `${head} ` : '';
		const tail = value.slice(tokenEnd).replace(/^\s*,?\s*/, '');
		const insert = `${contact.email}, `;
		toRaw = tail ? `${prefix}${insert}${tail}` : `${prefix}${insert}`;
		dismissed = true;
		query = '';
		const pos = (prefix + insert).length;
		queueMicrotask(() => {
			toInput?.focus();
			toInput?.setSelectionRange(pos, pos);
		});
	}

	/**
	 * @param {KeyboardEvent} e
	 */
	function onKeydown(e) {
		if (e.key === 'Escape' && (menuOpen || query)) {
			e.preventDefault();
			e.stopPropagation();
			dismissed = true;
			return;
		}
		if (!menuOpen || !suggestions.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selected = (selected + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selected = (selected - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			const item = suggestions[selected];
			if (item) choose(item);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			dismissed = true;
		}
	}

	async function send() {
		const to = parseRecipients(toRaw);
		const nextBody = plainBody ? body : '';
		if (!to.length || busy) return;
		if (!subject.trim() && !plainBody) return;
		busy = true;
		err = '';
		try {
			const msg = await sendMail({ to, subject, body: nextBody });
			closeComposer();
			selectEntity('mail', msg.id);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<CreateSheet {open} label={t('mail.newMessage')} onclose={closeComposer}>
	<div class="recipients-row">
		<input
			bind:this={toInput}
			class="recipients"
			type="text"
			inputmode="email"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			placeholder={t('mail.emailPlaceholder')}
			aria-label={t('mail.emailPlaceholder')}
			aria-autocomplete="list"
			aria-controls="mail-recipient-suggest"
			bind:value={toRaw}
			oninput={syncToken}
			onclick={syncToken}
			onkeyup={syncToken}
			onkeydown={onKeydown}
		/>
		{#if menuOpen}
			<div
				id="mail-recipient-suggest"
				class="suggest"
				role="listbox"
				tabindex="-1"
				aria-label={t('mail.emailPlaceholder')}
				onpointerdown={(e) => e.preventDefault()}
			>
				<div class="list">
					{#each suggestions as contact, i (contact.email)}
						<button
							type="button"
							class="item"
							class:on={i === selected}
							role="option"
							aria-selected={i === selected}
							onclick={() => choose(contact)}
						>
							<ProfilePic
								name={contact.label}
								email={contact.email}
								pictureUrl={pictureUrlFor(contact.email)}
								size={28}
							/>
							<span class="meta">
								<span
									class="label"
									style:color={profileNameCss(contact.email, contact.label, isDark)}
									>{contact.label}</span
								>
								<span class="sub">{contact.email}</span>
							</span>
						</button>
					{:else}
						<p class="empty">{t('mail.noContacts')}</p>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<div class="form-divider"></div>

	<div class="sheet-title-row">
		<input class="sheet-input" placeholder={t('mail.subject')} aria-label={t('mail.subject')} bind:value={subject} />
	</div>

	<div class="form-divider"></div>

	<div class="mail-body">
		{#key editorKey}
			{#if open}
				<NoteEditor
					value={body}
					placeholder={t('notes.typeCommands')}
					onChange={(html) => (body = html)}
					onReady={(ed) => (tipTap = ed)}
				/>
			{/if}
		{/key}
	</div>

	<div class="post-action-row">
		<EditorToolbar editor={tipTap} />
	</div>

	<div class="form-divider"></div>

	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}

	<div class="sheet-bottom">
		<PrimaryButton
			size="sheet"
			disabled={busy || parseRecipients(toRaw).length === 0 || (!subject.trim() && !plainBody)}
			onclick={() => void send()}
		>
			{busy ? t('mail.sending') : t('mail.send')}
		</PrimaryButton>
	</div>
</CreateSheet>

<style>
	.recipients-row {
		position: relative;
		z-index: 4;
		flex-shrink: 0;
		padding: 12px 16px 10px;
	}

	.recipients {
		display: block;
		width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		outline: none;
		color: var(--fg-83);
		caret-color: var(--fg);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 400;
		line-height: 1.55;
	}

	.recipients::placeholder {
		color: var(--fg-33);
		font-weight: 400;
	}

	.mail-body {
		min-height: 140px;
		max-height: min(48svh, 360px);
		overflow: auto;
		padding: 10px 16px;
		box-sizing: border-box;
	}

	.post-action-row {
		display: flex;
		align-items: center;
		padding: 0 16px 10px;
		flex-shrink: 0;
	}

	.sheet-bottom {
		justify-content: flex-end;
	}

	.err {
		margin: 0;
		padding: 0 16px 8px;
		font-size: 13px;
		color: var(--fg-66);
	}

	/* Same popover as the chat composer @ menu. */
	.suggest {
		position: absolute;
		left: 16px;
		top: calc(100% + 4px);
		z-index: 30;
		width: min(320px, calc(100vw - 32px));
		min-width: 240px;
		max-width: 320px;
		border: 0.33px solid color-mix(in srgb, var(--fg) 33%, transparent);
		border-radius: 12px;
		background: var(--popover, var(--bg));
		backdrop-filter: blur(var(--glass-blur, 14px));
		-webkit-backdrop-filter: blur(var(--glass-blur, 14px));
		box-shadow: 0 8px 24px color-mix(in srgb, #000 40%, transparent);
		overflow: hidden;
	}

	.list {
		max-height: 220px;
		overflow: auto;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.item:not(:last-child) {
		border-bottom: 0.33px solid var(--fg-8);
	}

	.item:hover,
	.item.on {
		background: var(--fg-8);
	}

	.meta {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.label {
		font-size: 14px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sub {
		font-size: 12px;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		margin: 0;
		padding: 12px 16px;
		font-size: 13px;
		color: var(--fg-33);
	}
</style>
