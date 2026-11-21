<script>
	import { tick } from 'svelte';
	import CreateSheet from './CreateSheet.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import FloatPanel from './FloatPanel.svelte';
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

	/** @type {string[]} */
	let recipients = $state([]);
	/** @type {string[]} */
	let ccRecipients = $state([]);
	/** @type {string[]} */
	let bccRecipients = $state([]);
	let draft = $state('');
	let ccDraft = $state('');
	let bccDraft = $state('');
	let subject = $state('');
	let body = $state('');
	let busy = $state(false);
	let err = $state('');
	let bookReady = $state(false);
	/** @type {string | null} */
	let seededFor = $state(null);
	/** @type {HTMLInputElement | undefined} */
	let toInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let ccInput = $state();
	/** @type {HTMLInputElement | undefined} */
	let bccInput = $state();
	/** @type {import('@tiptap/core').Editor | null} */
	let tipTap = $state(null);
	let dismissed = $state(false);
	let selected = $state(0);
	/** @type {'to' | 'cc' | 'bcc' | 'body'} */
	let focusTarget = $state('to');
	let ccOpen = $state(false);
	let bccOpen = $state(false);
	let threadId = $state('');
	let inReplyTo = $state('');
	let scheduleOpen = $state(false);
	/** @type {string} */
	let scheduleLocal = $state('');
	/** @type {HTMLButtonElement | null} */
	let scheduleBtn = $state(null);

	const open = $derived(ui.composer?.kind === 'mail');
	const editorKey = $derived(open ? String(ui.composer?.id ?? 'new') : 'closed');
	const plainBody = $derived(plainMailBody(body));
	/** @type {'to' | 'cc' | 'bcc'} */
	const activeField = $derived(
		focusTarget === 'cc' || focusTarget === 'bcc' ? focusTarget : 'to'
	);
	const activeDraft = $derived(
		activeField === 'cc' ? ccDraft : activeField === 'bcc' ? bccDraft : draft
	);
	const query = $derived(activeDraft.trim());
	const sendDisabled = $derived(
		busy || recipients.length === 0 || (!subject.trim() && !plainBody)
	);
	const ccPillLabel = $derived(
		!ccOpen && ccRecipients.length
			? t('mail.ccCount', { count: ccRecipients.length })
			: t('mail.cc')
	);
	const bccPillLabel = $derived(
		!bccOpen && bccRecipients.length
			? t('mail.bccCount', { count: bccRecipients.length })
			: t('mail.bcc')
	);

	const isDark = $derived.by(() => {
		const choice = themeChoice.value;
		if (choice === 'light') return false;
		if (choice === 'gray' || choice === 'dark') return true;
		if (typeof document === 'undefined') return true;
		return document.documentElement.dataset.theme !== 'light';
	});

	/** @param {string} raw */
	function parseEmails(raw) {
		const found = [];
		const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
		for (const match of String(raw || '').matchAll(re)) {
			const email = match[0].toLowerCase();
			if (!found.includes(email)) found.push(email);
		}
		return found;
	}

	/** @param {string} email */
	function contactLabel(email) {
		const hit = mailAddressBook.find((c) => c.email === email);
		return hit?.name || displayNameFromEmail(email);
	}

	const takenEmails = $derived(
		new Set([...recipients, ...ccRecipients, ...bccRecipients])
	);

	const suggestions = $derived.by(() => {
		mailAddressBook.length;
		takenEmails.size;
		const q = query.toLowerCase();
		if (!q) return [];
		const rows = [];
		for (const contact of mailAddressBook) {
			if (takenEmails.has(contact.email)) continue;
			const name = contact.name || displayNameFromEmail(contact.email);
			if (!contact.email.includes(q) && !name.toLowerCase().includes(q)) continue;
			const starts =
				contact.email.startsWith(q) || name.toLowerCase().startsWith(q) ? 0 : 1;
			rows.push({ ...contact, label: name, rank: starts });
		}
		rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
		return rows.slice(0, 8);
	});

	const menuOpen = $derived(query.length > 0 && !dismissed && (suggestions.length > 0 || bookReady));

	$effect(() => {
		query;
		selected = 0;
	});

	$effect(() => {
		if (!open) {
			seededFor = null;
			bookReady = false;
			dismissed = false;
			draft = '';
			ccDraft = '';
			bccDraft = '';
			ccOpen = false;
			bccOpen = false;
			scheduleOpen = false;
			scheduleLocal = '';
			return;
		}
		const key = ui.composer?.id ?? '__new__';
		if (seededFor === key) return;
		seededFor = key;
		recipients = parseEmails(typeof ui.composer?.to === 'string' ? ui.composer.to : '');
		ccRecipients = parseEmails(typeof ui.composer?.cc === 'string' ? ui.composer.cc : '');
		bccRecipients = parseEmails(typeof ui.composer?.bcc === 'string' ? ui.composer.bcc : '');
		draft = '';
		ccDraft = '';
		bccDraft = '';
		/* Compact count when seeded; expand only if empty so reply-all stays tidy. */
		ccOpen = false;
		bccOpen = false;
		subject = typeof ui.composer?.subject === 'string' ? ui.composer.subject : '';
		body = typeof ui.composer?.body === 'string' ? ui.composer.body : '';
		threadId = typeof ui.composer?.threadId === 'string' ? ui.composer.threadId : '';
		inReplyTo = typeof ui.composer?.inReplyTo === 'string' ? ui.composer.inReplyTo : '';
		focusTarget = ui.composer?.focus === 'body' ? 'body' : 'to';
		err = '';
		busy = false;
		dismissed = false;
		scheduleOpen = false;
		scheduleLocal = '';
		bookReady = mailAddressBook.length > 0;
		void refreshMailAddressBook().finally(() => {
			if (open) bookReady = true;
		});
		tick().then(() => {
			requestAnimationFrame(() => {
				if (focusTarget === 'body') tipTap?.commands?.focus?.('end');
				else toInput?.focus();
			});
		});
	});

	$effect(() => {
		if (!open || focusTarget !== 'body' || !tipTap) return;
		queueMicrotask(() => tipTap?.commands?.focus?.('end'));
	});

	/** @param {'to' | 'cc' | 'bcc'} field */
	function fieldList(field) {
		if (field === 'cc') return ccRecipients;
		if (field === 'bcc') return bccRecipients;
		return recipients;
	}

	/** @param {'to' | 'cc' | 'bcc'} field @param {string[]} next */
	function setFieldList(field, next) {
		if (field === 'cc') ccRecipients = next;
		else if (field === 'bcc') bccRecipients = next;
		else recipients = next;
	}

	/** @param {'to' | 'cc' | 'bcc'} field */
	function fieldInput(field) {
		if (field === 'cc') return ccInput;
		if (field === 'bcc') return bccInput;
		return toInput;
	}

	/** @param {'to' | 'cc' | 'bcc'} field @param {string} email */
	function addRecipient(field, email) {
		const e = String(email || '')
			.trim()
			.toLowerCase();
		if (!e.includes('@') || takenEmails.has(e)) return;
		setFieldList(field, [...fieldList(field), e]);
		if (field === 'cc') ccDraft = '';
		else if (field === 'bcc') bccDraft = '';
		else draft = '';
		dismissed = true;
		queueMicrotask(() => fieldInput(field)?.focus());
	}

	/** @param {'to' | 'cc' | 'bcc'} field @param {string} email */
	function removeRecipient(field, email) {
		setFieldList(
			field,
			fieldList(field).filter((r) => r !== email)
		);
		queueMicrotask(() => fieldInput(field)?.focus());
	}

	/** @param {{ email: string }} contact */
	function choose(contact) {
		addRecipient(activeField, contact.email);
	}

	/** @param {'to' | 'cc' | 'bcc'} field */
	function commitDraftEmails(field) {
		const raw = field === 'cc' ? ccDraft : field === 'bcc' ? bccDraft : draft;
		const found = parseEmails(raw);
		if (!found.length) return false;
		for (const e of found) addRecipient(field, e);
		if (field === 'cc') ccDraft = '';
		else if (field === 'bcc') bccDraft = '';
		else draft = '';
		return true;
	}

	/**
	 * @param {'to' | 'cc' | 'bcc'} field
	 * @param {KeyboardEvent} e
	 */
	function onKeydown(field, e) {
		const raw = field === 'cc' ? ccDraft : field === 'bcc' ? bccDraft : draft;
		if (e.key === 'Escape' && (menuOpen || query)) {
			e.preventDefault();
			e.stopPropagation();
			dismissed = true;
			return;
		}
		const list = fieldList(field);
		if (e.key === 'Backspace' && !raw && list.length) {
			e.preventDefault();
			removeRecipient(field, list[list.length - 1]);
			return;
		}
		if ((e.key === ',' || e.key === ';' || e.key === 'Enter') && raw.trim()) {
			if (menuOpen && suggestions.length && (e.key === 'Enter' || e.key === 'Tab')) {
				/* fall through to suggestion select below */
			} else if (parseEmails(raw).length) {
				e.preventDefault();
				commitDraftEmails(field);
				return;
			}
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

	/** @param {'to' | 'cc' | 'bcc'} field */
	function onDraftInput(field) {
		dismissed = false;
		const raw = field === 'cc' ? ccDraft : field === 'bcc' ? bccDraft : draft;
		const trailing = /[,;]\s*$/.test(raw);
		if (trailing && parseEmails(raw).length) {
			commitDraftEmails(field);
		}
	}

	function toggleCc() {
		ccOpen = !ccOpen;
		if (ccOpen) {
			focusTarget = 'cc';
			bccOpen = false;
			tick().then(() => ccInput?.focus());
		} else {
			focusTarget = 'to';
			queueMicrotask(() => toInput?.focus());
		}
	}

	function toggleBcc() {
		bccOpen = !bccOpen;
		if (bccOpen) {
			focusTarget = 'bcc';
			ccOpen = false;
			tick().then(() => bccInput?.focus());
		} else {
			focusTarget = 'to';
			queueMicrotask(() => toInput?.focus());
		}
	}

	/** @param {string | null} [at] */
	function send(at = null) {
		if (busy) return;
		if (parseEmails(draft).length) commitDraftEmails('to');
		if (parseEmails(ccDraft).length) commitDraftEmails('cc');
		if (parseEmails(bccDraft).length) commitDraftEmails('bcc');
		const to = recipients;
		const nextBody = plainBody ? body : '';
		if (!to.length) return;
		if (!subject.trim() && !plainBody) return;
		/* Lock before any await/close so a second click cannot submit twice. */
		busy = true;
		err = '';
		try {
			const msg = sendMail({
				to,
				cc: ccRecipients,
				bcc: bccRecipients,
				subject,
				body: nextBody,
				threadId: threadId || undefined,
				inReplyTo: inReplyTo || undefined,
				scheduleAt: at
			});
			closeComposer();
			selectEntity('mail', String(msg.threadId || msg.id));
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			busy = false;
		}
	}

	function confirmSchedule() {
		if (!scheduleLocal) return;
		const iso = new Date(scheduleLocal).toISOString();
		scheduleOpen = false;
		send(iso);
	}
</script>

<CreateSheet {open} label={t('mail.newMessage')} onclose={closeComposer}>
	<div class="recipients-block">
		<div class="recipients-row">
			<div class="recipients-field">
				{#each recipients as email (email)}
					<span class="to-pill">
						<ProfilePic
							name={contactLabel(email)}
							email={email}
							pictureUrl={pictureUrlFor(email)}
							size={18}
						/>
						<span class="pill-label">{contactLabel(email)}</span>
						<button
							type="button"
							class="pill-x"
							aria-label={t('common.remove')}
							onclick={() => removeRecipient('to', email)}>×</button
						>
					</span>
				{/each}
				<input
					bind:this={toInput}
					class="recipients"
					type="text"
					inputmode="email"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					placeholder={recipients.length ? '' : t('mail.emailPlaceholder')}
					aria-label={t('mail.to')}
					aria-autocomplete="list"
					aria-controls="mail-recipient-suggest"
					bind:value={draft}
					onfocus={() => (focusTarget = 'to')}
					oninput={() => onDraftInput('to')}
					onkeydown={(e) => onKeydown('to', e)}
				/>
			</div>
			<div class="recipients-toggles" role="group" aria-label={t('mail.cc')}>
				<button
					type="button"
					class="hdr-pill"
					class:on={ccOpen}
					class:has={ccRecipients.length > 0}
					aria-pressed={ccOpen}
					onclick={toggleCc}
				>
					{ccPillLabel}
				</button>
				<button
					type="button"
					class="hdr-pill"
					class:on={bccOpen}
					class:has={bccRecipients.length > 0}
					aria-pressed={bccOpen}
					onclick={toggleBcc}
				>
					{bccPillLabel}
				</button>
			</div>
			{#if menuOpen && activeField === 'to'}
				<div
					id="mail-recipient-suggest"
					class="suggest alpha-popover"
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

		{#if ccOpen}
			<div class="recipients-row extra" class:suggesting={menuOpen && activeField === 'cc'}>
				<span class="field-label">{t('mail.cc')}</span>
				<div class="recipients-field">
					{#each ccRecipients as email (email)}
						<span class="to-pill">
							<ProfilePic
								name={contactLabel(email)}
								email={email}
								pictureUrl={pictureUrlFor(email)}
								size={18}
							/>
							<span class="pill-label">{contactLabel(email)}</span>
							<button
								type="button"
								class="pill-x"
								aria-label={t('common.remove')}
								onclick={() => removeRecipient('cc', email)}>×</button
							>
						</span>
					{/each}
					<input
						bind:this={ccInput}
						class="recipients"
						type="text"
						inputmode="email"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						placeholder={ccRecipients.length ? '' : t('mail.emailPlaceholder')}
						aria-label={t('mail.cc')}
						aria-autocomplete="list"
						aria-controls="mail-cc-suggest"
						bind:value={ccDraft}
						onfocus={() => (focusTarget = 'cc')}
						oninput={() => onDraftInput('cc')}
						onkeydown={(e) => onKeydown('cc', e)}
					/>
				</div>
				{#if menuOpen && activeField === 'cc'}
					<div
						id="mail-cc-suggest"
						class="suggest alpha-popover"
						role="listbox"
						tabindex="-1"
						aria-label={t('mail.cc')}
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
		{/if}

		{#if bccOpen}
			<div class="recipients-row extra" class:suggesting={menuOpen && activeField === 'bcc'}>
				<span class="field-label">{t('mail.bcc')}</span>
				<div class="recipients-field">
					{#each bccRecipients as email (email)}
						<span class="to-pill">
							<ProfilePic
								name={contactLabel(email)}
								email={email}
								pictureUrl={pictureUrlFor(email)}
								size={18}
							/>
							<span class="pill-label">{contactLabel(email)}</span>
							<button
								type="button"
								class="pill-x"
								aria-label={t('common.remove')}
								onclick={() => removeRecipient('bcc', email)}>×</button
							>
						</span>
					{/each}
					<input
						bind:this={bccInput}
						class="recipients"
						type="text"
						inputmode="email"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						placeholder={bccRecipients.length ? '' : t('mail.emailPlaceholder')}
						aria-label={t('mail.bcc')}
						aria-autocomplete="list"
						aria-controls="mail-bcc-suggest"
						bind:value={bccDraft}
						onfocus={() => (focusTarget = 'bcc')}
						oninput={() => onDraftInput('bcc')}
						onkeydown={(e) => onKeydown('bcc', e)}
					/>
				</div>
				{#if menuOpen && activeField === 'bcc'}
					<div
						id="mail-bcc-suggest"
						class="suggest alpha-popover"
						role="listbox"
						tabindex="-1"
						aria-label={t('mail.bcc')}
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

	{#if err}
		<p class="err" role="alert">{err}</p>
	{/if}

	<div class="post-action-row">
		<EditorToolbar editor={tipTap} />
		<div
			class="send-split"
			class:is-disabled={sendDisabled}
			role="group"
			aria-label={t('mail.send')}
		>
			<PrimaryButton
				size="sheet"
				class="send-main"
				disabled={sendDisabled}
				onclick={() => send(null)}
			>
				{t('mail.send')}
			</PrimaryButton>
			<span class="send-divider" aria-hidden="true"></span>
			<button
				type="button"
				class="send-schedule"
				bind:this={scheduleBtn}
				aria-label={t('mail.sendLater')}
				aria-expanded={scheduleOpen}
				disabled={sendDisabled}
				onclick={() => (scheduleOpen = !scheduleOpen)}
			>
				<span class="send-chevron" aria-hidden="true">
					<svg width="16" height="16" viewBox="0 0 12 12" fill="none">
						<path
							d="M3 4.5 6 7.5 9 4.5"
							stroke="currentColor"
							stroke-width="1.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
			</button>
		</div>
	</div>
</CreateSheet>

<FloatPanel
	open={scheduleOpen}
	anchor={scheduleBtn}
	placement="above"
	align="end"
	width={240}
	maxHeight={220}
	onclose={() => (scheduleOpen = false)}
>
	<div class="schedule-panel">
		<label class="schedule-label" for="mail-schedule-at">{t('mail.scheduleAt')}</label>
		<input
			id="mail-schedule-at"
			class="schedule-input"
			type="datetime-local"
			bind:value={scheduleLocal}
		/>
		<button
			type="button"
			class="schedule-confirm"
			disabled={!scheduleLocal}
			onclick={confirmSchedule}
		>
			{t('mail.scheduleSend')}
		</button>
	</div>
</FloatPanel>

<style>
	.recipients-block {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.recipients-row {
		position: relative;
		z-index: 4;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 10px 16px 8px;
	}

	.recipients-row.extra {
		padding-top: 0;
		z-index: 3;
	}

	.recipients-row.extra.suggesting {
		z-index: 5;
	}

	.field-label {
		flex-shrink: 0;
		padding-top: 5px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--fg-33);
		min-width: 2rem;
	}

	.recipients-field {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.recipients-toggles {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		padding-top: 2px;
	}

	.hdr-pill {
		margin: 0;
		padding: 0 10px;
		height: 26px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg-66);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
		line-height: 1;
	}

	.hdr-pill:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 10%, transparent);
	}

	.hdr-pill.on,
	.hdr-pill.has {
		color: var(--fg);
	}

	.to-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		height: 26px;
		padding: 0 4px 0 3px;
		border-radius: 9999px;
		background: var(--fg-8);
		box-sizing: border-box;
	}

	.pill-label {
		min-width: 0;
		max-width: 10rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 500;
		line-height: 1;
		color: var(--fg-66);
	}

	.pill-x {
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 9999px;
		background: transparent;
		color: var(--fg-33);
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}

	.pill-x:hover {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.recipients {
		flex: 1 1 8rem;
		min-width: 6rem;
		margin: 0;
		padding: 4px 0;
		border: 0;
		background: transparent;
		outline: none;
		color: var(--fg-83);
		caret-color: var(--fg);
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 400;
		line-height: 1.4;
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
		--ctrl-h: 32px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 16px;
		flex-shrink: 0;
	}

	.send-split {
		position: relative;
		margin-left: auto;
		display: inline-flex;
		align-items: stretch;
		height: var(--ctrl-h, 32px);
		border-radius: 9999px;
		overflow: visible;
		flex-shrink: 0;
		background:
			var(--button-primary-bg) padding-box,
			var(--glass-shine) border-box;
		border: 1px solid transparent;
		box-sizing: border-box;
	}

	/* Whole split fades like a normal PrimaryButton — avoid double-dimming children. */
	.send-split.is-disabled {
		opacity: 0.5;
	}

	.send-split :global(.send-main.alpha-btn.sheet) {
		margin-left: 0;
		border-radius: 9999px 0 0 9999px;
		padding-right: 14px;
		padding-left: 16px;
		border: 0;
		background: transparent;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		height: 100%;
		min-height: 0;
		transform: none;
	}

	.send-split.is-disabled :global(.send-main.alpha-btn.sheet:disabled),
	.send-split.is-disabled :global(.send-main.alpha-btn.sheet.disabled) {
		opacity: 1;
	}

	.send-split :global(.send-main.alpha-btn.sheet:hover:not(:disabled)),
	.send-split :global(.send-main.alpha-btn.sheet:active:not(:disabled)) {
		transform: none;
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.send-divider {
		width: 1px;
		align-self: stretch;
		margin: 0;
		background: color-mix(in srgb, var(--button-primary-fg, var(--fg)) 22%, transparent);
		flex-shrink: 0;
		z-index: 1;
	}

	.send-schedule {
		width: 30px;
		margin: 0;
		padding: 0 8px 0 6px;
		border: 0;
		border-radius: 0 9999px 9999px 0;
		display: grid;
		place-items: center;
		background: transparent;
		color: color-mix(in srgb, var(--button-primary-fg, var(--fg)) 55%, transparent);
		cursor: pointer;
		line-height: 0;
		box-sizing: border-box;
		-webkit-tap-highlight-color: transparent;
	}

	.send-chevron {
		display: grid;
		place-items: center;
		padding-top: 2px;
		line-height: 0;
	}

	.send-schedule:disabled {
		opacity: 1;
		cursor: default;
	}

	.send-schedule:not(:disabled):hover {
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}

	.schedule-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		box-sizing: border-box;
	}

	.schedule-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-66);
	}

	.schedule-input {
		width: 100%;
		margin: 0;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		box-sizing: border-box;
	}

	.schedule-confirm {
		margin: 0;
		padding: 8px 12px;
		border: 0;
		border-radius: 9999px;
		background: var(--fg-8);
		color: var(--fg);
		font: inherit;
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
	}

	.schedule-confirm:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.err {
		margin: 0;
		padding: 0 16px 8px;
		font-size: 13px;
		color: var(--fg-66);
	}

	.suggest {
		position: absolute;
		left: 16px;
		top: calc(100% + 4px);
		z-index: 30;
		width: min(320px, calc(100vw - 32px));
		min-width: 240px;
		max-width: 320px;
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
