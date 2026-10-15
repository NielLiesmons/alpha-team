<script>
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import {
		artistNames,
		clearTrackSelection,
		openBulkTrackEdit,
		openTrackEdit,
		playTrack,
		playerBrowse,
		playerUi,
		removeTracks,
		setPlayerBrowse,
		toggleTrackSelected,
		tracks,
		visibleTracks
	} from '$lib/player.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';

	const connected = $derived(Boolean(activeSession()) && ui.source === 'drive');
	const list = $derived(visibleTracks());
	const artists = $derived(artistNames());
	const selectedCount = $derived(playerUi.selectedIds.length);
	const allSelected = $derived(list.length > 0 && list.every((t) => playerUi.selectedIds.includes(t.id)));

	/** @param {any} track */
	function onRowClick(track) {
		if (selectedCount > 0) {
			toggleTrackSelected(track.id);
			return;
		}
		playTrack(track).catch(() => {});
	}

	function toggleSelectAll() {
		if (allSelected) clearTrackSelection();
		else playerUi.selectedIds = list.map((t) => t.id);
	}

	async function onDelete() {
		const n = selectedCount;
		if (!n) return;
		if (!confirm(`Delete ${n} track${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
		try {
			await removeTracks();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<div class="player-detail">
	{#if playerUi.uploadLabel}
		<p class="banner">{playerUi.uploadLabel}</p>
	{/if}
	{#if playerUi.error}
		<p class="banner err">{playerUi.error}</p>
	{/if}

	{#if selectedCount > 0 && !(playerBrowse.mode === 'artists' && !playerBrowse.artist)}
		<div class="select-bar">
			<button type="button" class="bar-btn" onclick={toggleSelectAll}>
				{allSelected ? 'Clear' : 'All'}
			</button>
			<span class="bar-count">{selectedCount} selected</span>
			<button type="button" class="bar-btn" onclick={openBulkTrackEdit}>Edit</button>
			<button type="button" class="bar-btn danger" onclick={onDelete}>Delete</button>
			<button type="button" class="bar-btn" onclick={clearTrackSelection}>Done</button>
		</div>
	{/if}

	<div class="body">
		{#if !connected}
			<p class="empty">Connect Drive in Settings to use the Player.</p>
		{:else if driveSession.loading && tracks.length === 0}
			<p class="empty">Loading library…</p>
		{:else if playerBrowse.mode === 'artists' && !playerBrowse.artist}
			{#if artists.length === 0}
				<p class="empty">No artists yet. Upload audio to build your library.</p>
			{:else}
				<div class="card-stack">
					{#each artists as name (name)}
						<button
							type="button"
							class="row"
							onclick={() => setPlayerBrowse('artists', { artist: name })}
						>
							<span class="row-title">{name}</span>
							<span class="row-meta"
								>{tracks.filter((t) => (t.artists?.[0] || 'Unknown') === name).length}</span
							>
						</button>
					{/each}
				</div>
			{/if}
		{:else if list.length === 0}
			<p class="empty">
				{#if playerBrowse.mode === 'playlist'}
					This playlist is empty.
				{:else}
					No tracks yet. Upload audio to build your library.
				{/if}
			</p>
		{:else}
			<div class="card-stack">
				{#each list as track (track.id)}
					{@const selected = playerUi.selectedIds.includes(track.id)}
					<div class="row-wrap" class:on={playerUi.currentId === track.id} class:selected>
						<button
							type="button"
							class="check"
							class:on={selected}
							aria-label={selected ? 'Deselect' : 'Select'}
							aria-pressed={selected}
							onclick={() => toggleTrackSelected(track.id)}
						>
							<span class="check-dot"></span>
						</button>
						<button type="button" class="row" onclick={() => onRowClick(track)}>
							<span class="row-title">{track.title}</span>
							<span class="row-meta">{track.artists?.join(', ')}</span>
						</button>
						<button
							type="button"
							class="edit-btn"
							aria-label="Edit {track.title}"
							onclick={() => openTrackEdit(track)}
						>
							<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5.4 12.84 2 13.5l.66-3.4L11.5 2.5Z"
									stroke="currentColor"
									stroke-width="1.4"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.player-detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		width: 100%;
		overflow: hidden;
	}

	.banner {
		margin: 0;
		padding: 10px 16px;
		font-size: 13px;
		color: var(--fg-66);
		flex-shrink: 0;
	}

	.banner.err {
		color: var(--fg);
	}

	.select-bar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		height: 40px;
		padding: 0 8px 0 12px;
		border-bottom: 1px solid var(--hairline);
		box-sizing: border-box;
		background: var(--fg-4);
	}

	.bar-count {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--fg-66);
	}

	.bar-btn {
		height: 30px;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.bar-btn:hover {
		background: var(--fg-8);
		color: var(--fg);
	}

	.bar-btn.danger {
		color: var(--fg-66);
	}

	.bar-btn.danger:hover {
		color: var(--fg);
	}

	.body {
		flex: 1;
		min-height: 0;
		width: 100%;
		overflow: auto;
		padding-bottom: 8px;
	}

	.empty {
		padding: 48px 16px;
		color: var(--fg-66);
		font-size: 14px;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 8px 10px;
		width: 100%;
		box-sizing: border-box;
	}

	.row-wrap {
		display: flex;
		align-items: center;
		gap: 2px;
		border-radius: 12px;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
	}

	.row-wrap:hover {
		background: var(--fg-4);
	}

	.row-wrap.on {
		background: var(--selection);
	}

	.row-wrap.selected {
		background: var(--fg-8);
	}

	.check {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		margin-left: 2px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: transparent;
		padding: 0;
		cursor: pointer;
	}

	.check-dot {
		width: 18px;
		height: 18px;
		border-radius: 6px;
		border: 1.5px solid var(--fg-33);
		box-sizing: border-box;
		background: transparent;
	}

	.check.on .check-dot {
		border-color: var(--fg);
		background: var(--fg);
		box-shadow: inset 0 0 0 3px var(--bg);
	}

	.row {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 10px;
		flex: 1;
		min-width: 0;
		padding: 0.85rem 0.5rem 0.85rem 0.4rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
		box-sizing: border-box;
	}

	.edit-btn {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		margin-right: 4px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-33);
		padding: 0;
		cursor: pointer;
		opacity: 0.7;
	}

	.edit-btn:hover {
		color: var(--fg);
		background: var(--fg-8);
		opacity: 1;
	}

	.row-title {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 62%;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-meta {
		flex: 1 1 auto;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
