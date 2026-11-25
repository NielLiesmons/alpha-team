<script>
	import FeedSkeleton from '$lib/components/FeedSkeleton.svelte';
	import ProfilePic from '$lib/components/ProfilePic.svelte';
	import { asPerson, displayNameFromEmail } from '$lib/actor.svelte.js';
	import { pictureUrlFor } from '$lib/avatar.svelte.js';
	import { appBoot } from '$lib/boot.svelte.js';
	import { t } from '$lib/i18n.svelte.js';
	import { notePlainText } from '$lib/note-text.js';
	import { swipeLeftArchive } from '$lib/swipe-left-archive.js';
	import { archiveNote, notes, selectEntity, ui } from '$lib/workspace.svelte.js';

	const RECENT_MS = 7 * 86_400_000;

	/** @param {any} note */
	function noteEditedAt(note) {
		return note.updatedAt || note.createdAt || 0;
	}

	/** @param {any} note */
	function creatorFor(note) {
		const email = String(note?.author || '')
			.trim()
			.toLowerCase();
		if (!email) return null;
		const who = asPerson(email);
		return {
			email,
			name: who?.name || displayNameFromEmail(email) || '?',
			pictureUrl: pictureUrlFor(email)
		};
	}

	const filtered = $derived.by(() => {
		const f = ui.listFilter;
		const now = Date.now();
		let list = [...notes];
		if (f === 'archived') {
			list = list.filter((n) => Boolean(n.archived));
		} else {
			list = list.filter((n) => !n.archived);
			if (f === 'recent') {
				list = list.filter((n) => {
					const edited = noteEditedAt(n);
					return edited > 0 && now - edited < RECENT_MS;
				});
			} else if (f === 'linked') {
				list = list.filter((n) => (n.project_ids ?? []).length > 0);
			} else if (f === 'unlinked') {
				list = list.filter((n) => (n.project_ids ?? []).length === 0);
			}
		}
		return list.sort((a, b) => noteEditedAt(b) - noteEditedAt(a));
	});

</script>

<svelte:head><title>{t('notes.title')}</title></svelte:head>

<div class="feed">
	{#if (!appBoot.listsReady || !ui.entitiesReady) && notes.length === 0}
		<FeedSkeleton rows={8} />
	{:else if notes.length === 0}
		<p class="empty">{t('notes.empty')}</p>
	{:else if filtered.length === 0}
		<p class="empty">{t('notes.emptyFilter')}</p>
	{:else}
		<div class="card-stack">
			{#each filtered as note (note.id)}
				{@const creator = creatorFor(note)}
				<button
					type="button"
					class="row"
					class:on={ui.selection?.kind === 'note' && ui.selection.id === note.id}
					use:swipeLeftArchive={{
						label: t('action.archive'),
						disabled: Boolean(note.archived),
						onArchive: () => void archiveNote(note.id)
					}}
					onclick={() => selectEntity('note', note.id)}
				>
					<span class="title-row">
						<span class="title">{note.title || t('common.untitled')}</span>
						{#if note._pending}
							<span class="local-only" title={t('common.localOnly')} aria-label={t('common.localOnly')}>
								<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M4.5 12.5h7.2c1.7 0 3.1-1.3 3.1-3 0-1.5-1.1-2.7-2.5-2.9A4 4 0 0 0 4.8 5.2 3.2 3.2 0 0 0 2 8.3c0 1.8 1.3 3.2 2.5 3.2Z"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linejoin="round"
									/>
									<path
										d="M3 3.5 13 13.5"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
									/>
								</svg>
							</span>
						{/if}
						{#if creator}
							<span class="creator" aria-hidden="true">
								<ProfilePic
									name={creator.name}
									email={creator.email}
									pictureUrl={creator.pictureUrl}
									size={20}
								/>
							</span>
						{/if}
					</span>
					{#if notePlainText(note.body)}
						<span class="preview">{notePlainText(note.body).slice(0, 140)}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
	}

	.empty {
		padding: 48px 16px;
		color: var(--fg-66);
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 6px;
		box-sizing: border-box;
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(0.2rem + 2px);
		width: 100%;
		padding: calc(0.85rem - 4px) calc(0.9rem - 2px);
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
		position: relative;
		z-index: 1;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--fg-4);
	}

	.title-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-width: 0;
		margin: 0;
		padding: 0;
	}

	.title,
	.preview {
		display: block;
		margin: 0;
		padding: 0;
		text-align: left;
	}

	.title {
		flex: 1;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.25;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.local-only {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--fg-33);
		line-height: 0;
	}

	.creator {
		flex-shrink: 0;
		line-height: 0;
		padding-right: 2px;
		opacity: 0.66;
	}

	.preview {
		width: 100%;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 0.8125rem;
		line-height: 1.25;
		/* Quieter than Chat preview — body snippet, not a message line */
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
