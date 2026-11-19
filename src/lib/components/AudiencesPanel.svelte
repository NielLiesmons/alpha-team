<script>
	/**
	 * Website → Audiences: named lists, CSV import, add email, publishers allow-list.
	 */
	import { onMount } from 'svelte';
	import {
		audiences,
		loadAudienceMembers,
		mailSettings,
		persistAddAudienceMember,
		persistCreateAudience,
		persistDeleteAudience,
		persistImportAudienceCsv,
		persistMailSettings,
		refreshAudiences
	} from '$lib/publications.svelte.js';
	import { getAdminToken } from '$lib/mail-api.js';
	import { t } from '$lib/i18n.svelte.js';

	/** @type {string | null} */
	let activeId = $state(null);
	/** @type {any[]} */
	let members = $state([]);
	let membersLoading = $state(false);
	let err = $state('');
	let info = $state('');
	let newTitle = $state('');
	let addEmail = $state('');
	let addName = $state('');
	let busy = $state(false);
	let publisherDraft = $state('');

	const active = $derived(audiences.find((a) => a.id === activeId) || null);

	onMount(() => {
		if (!audiences.length) void refreshAudiences().catch(() => {});
		if (!getAdminToken()) {
			err = t('aud.needToken');
		}
	});

	$effect(() => {
		if (!activeId && audiences.length) {
			activeId = audiences.find((a) => a.is_default)?.id || audiences[0]?.id || null;
		}
	});

	$effect(() => {
		const id = activeId;
		if (!id) {
			members = [];
			return;
		}
		let cancelled = false;
		membersLoading = true;
		err = '';
		void loadAudienceMembers(id, { all: true })
			.then((rows) => {
				if (!cancelled) members = rows;
			})
			.catch((e) => {
				if (!cancelled) err = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				if (!cancelled) membersLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	async function createList() {
		const title = newTitle.trim();
		if (!title || busy) return;
		busy = true;
		err = '';
		info = '';
		try {
			const a = await persistCreateAudience({ title });
			newTitle = '';
			activeId = a.id;
			info = t('aud.created');
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function removeList() {
		if (!active || active.is_default || busy) return;
		if (!confirm(t('aud.deleteConfirm', { title: active.title }))) return;
		busy = true;
		err = '';
		try {
			const id = active.id;
			await persistDeleteAudience(id);
			activeId = audiences.find((a) => a.is_default)?.id || audiences[0]?.id || null;
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function addMember() {
		if (!activeId || !addEmail.trim() || busy) return;
		busy = true;
		err = '';
		info = '';
		try {
			await persistAddAudienceMember(activeId, {
				email: addEmail.trim(),
				name: addName.trim() || undefined
			});
			addEmail = '';
			addName = '';
			members = await loadAudienceMembers(activeId, { all: true });
			info = t('aud.memberAdded');
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/** @param {Event} ev */
	async function onCsv(ev) {
		const input = /** @type {HTMLInputElement} */ (ev.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file || !activeId || busy) return;
		busy = true;
		err = '';
		info = '';
		try {
			const text = await file.text();
			const result = await persistImportAudienceCsv(activeId, text);
			members = await loadAudienceMembers(activeId, { all: true });
			info = t('aud.importDone', {
				n: String(result.imported ?? 0),
				skip: String(result.skipped ?? 0),
				bad: String(result.invalid ?? 0)
			});
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function addPublisher() {
		const email = publisherDraft.trim().toLowerCase();
		if (!email || !email.includes('@') || busy) return;
		busy = true;
		err = '';
		try {
			const next = [...mailSettings.publishers];
			if (!next.some((p) => p.email === email)) {
				next.push({ email, name: '' });
			}
			await persistMailSettings({ publishers: next });
			publisherDraft = '';
			info = t('aud.publisherAdded');
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/** @param {string} email */
	async function removePublisher(email) {
		busy = true;
		err = '';
		try {
			const next = mailSettings.publishers.filter((p) => p.email !== email);
			await persistMailSettings({ publishers: next });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="aud">
	{#if err}
		<p class="banner bad">{err}</p>
	{/if}
	{#if info}
		<p class="banner ok">{info}</p>
	{/if}

	<section class="lists">
		<div class="row-head">
			<span class="eyebrow">{t('aud.lists')}</span>
			<form
				class="new-list"
				onsubmit={(e) => {
					e.preventDefault();
					void createList();
				}}
			>
				<input
					type="text"
					placeholder={t('aud.newListPlaceholder')}
					bind:value={newTitle}
					disabled={busy}
				/>
				<button type="submit" class="pill" disabled={busy || !newTitle.trim()}>
					{t('aud.createList')}
				</button>
			</form>
		</div>
		<div class="cards">
			{#each audiences as a (a.id)}
				<button
					type="button"
					class="card"
					class:on={a.id === activeId}
					onclick={() => {
						activeId = a.id;
						info = '';
						err = '';
					}}
				>
					<span class="card-title">
						{a.title}
						{#if a.is_default}
							<span class="badge">{t('aud.default')}</span>
						{/if}
					</span>
					<span class="card-meta">{t('aud.memberCount', { n: String(a.member_count ?? 0) })}</span>
				</button>
			{:else}
				<p class="muted">{t('aud.emptyLists')}</p>
			{/each}
		</div>
	</section>

	{#if active}
		<section class="detail">
			<div class="row-head">
				<div>
					<h2 class="title">{active.title}</h2>
					{#if active.description}
						<p class="muted tight">{active.description}</p>
					{/if}
				</div>
				<div class="actions">
					<label class="pill file">
						{t('aud.importCsv')}
						<input type="file" accept=".csv,text/csv,text/plain" onchange={onCsv} disabled={busy} />
					</label>
					{#if !active.is_default}
						<button type="button" class="pill quiet" onclick={() => void removeList()} disabled={busy}>
							{t('common.delete')}
						</button>
					{/if}
				</div>
			</div>

			<form
				class="add-row"
				onsubmit={(e) => {
					e.preventDefault();
					void addMember();
				}}
			>
				<input
					type="email"
					placeholder={t('aud.emailPlaceholder')}
					bind:value={addEmail}
					disabled={busy}
					required
				/>
				<input
					type="text"
					placeholder={t('aud.namePlaceholder')}
					bind:value={addName}
					disabled={busy}
				/>
				<button type="submit" class="pill" disabled={busy || !addEmail.trim()}>
					{t('aud.addMember')}
				</button>
			</form>

			{#if membersLoading}
				<p class="muted">{t('common.loading')}</p>
			{:else if members.length === 0}
				<p class="muted">{t('aud.emptyMembers')}</p>
			{:else}
				<ul class="members">
					{#each members as m (m.id || m.email)}
						<li class="member" class:off={m.status !== 'subscribed'}>
							<span class="m-main">
								<span class="m-email">{m.email}</span>
								{#if m.name}
									<span class="m-name">{m.name}</span>
								{/if}
							</span>
							<span class="m-meta">
								{m.source || '—'}
								· {m.status}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<section class="publishers">
		<span class="eyebrow">{t('aud.publishers')}</span>
		<p class="hint">{t('aud.publishersHint')}</p>
		<form
			class="add-row"
			onsubmit={(e) => {
				e.preventDefault();
				void addPublisher();
			}}
		>
			<input
				type="email"
				placeholder={t('aud.publisherPlaceholder')}
				bind:value={publisherDraft}
				disabled={busy}
			/>
			<button type="submit" class="pill" disabled={busy || !publisherDraft.trim()}>
				{t('aud.addPublisher')}
			</button>
		</form>
		{#if mailSettings.publishers.length === 0}
			<p class="muted">{t('aud.noPublishers')}</p>
		{:else}
			<ul class="members">
				{#each mailSettings.publishers as p (p.email)}
					<li class="member">
						<span class="m-email">{p.email}</span>
						<button
							type="button"
							class="pill quiet"
							onclick={() => void removePublisher(p.email)}
							disabled={busy}
						>
							{t('common.remove')}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.aud {
		display: flex;
		flex-direction: column;
		gap: 28px;
		padding: 8px 4px 32px;
		min-height: 0;
	}
	.banner {
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 500;
	}
	.banner.bad {
		background: var(--fg-8);
		color: var(--fg);
	}
	.banner.ok {
		background: var(--fg-4);
		color: var(--fg-66);
	}
	.eyebrow {
		display: block;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-33);
		margin-bottom: 10px;
	}
	.row-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	.new-list,
	.add-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	input[type='text'],
	input[type='email'] {
		border: none;
		background: var(--fg-8);
		border-radius: 999px;
		padding: 8px 14px;
		font: inherit;
		font-size: 13px;
		color: var(--fg);
		min-width: 160px;
	}
	input:focus {
		outline: 2px solid var(--fg-33);
		outline-offset: 1px;
	}
	.pill {
		border: none;
		background: var(--fg-8);
		color: var(--fg);
		border-radius: 999px;
		padding: 8px 14px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.pill:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.pill.quiet {
		font-weight: 500;
		color: var(--fg-66);
	}
	.pill.file {
		position: relative;
		overflow: hidden;
	}
	.pill.file input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		text-align: left;
		border: none;
		background: transparent;
		border-radius: 14px;
		padding: 12px 14px;
		cursor: pointer;
		color: var(--fg);
		font: inherit;
	}
	.card.on {
		background: var(--fg-4);
	}
	.card-title {
		font-size: 14px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.badge {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-33);
		background: var(--fg-8);
		border-radius: 999px;
		padding: 2px 8px;
	}
	.card-meta {
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
	}
	.title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	.muted {
		color: var(--fg-33);
		font-size: 13px;
	}
	.muted.tight {
		margin: 4px 0 0;
	}
	.hint {
		margin: 0 0 12px;
		font-size: 13px;
		color: var(--fg-66);
		line-height: 1.4;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.members {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.member {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--fg-4);
	}
	.member.off {
		opacity: 0.55;
	}
	.m-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.m-email {
		font-size: 13px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.m-name {
		font-size: 12px;
		color: var(--fg-66);
	}
	.m-meta {
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
		white-space: nowrap;
	}
	.publishers {
		padding-top: 8px;
		border-top: 1px solid var(--fg-8);
	}
</style>
