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
		queuePlayNext,
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
	const selecting = $derived(selectedCount > 0);
	const allSelected = $derived(
		list.length > 0 && list.every((t) => playerUi.selectedIds.includes(t.id))
	);

	/** @type {string | null} */
	let menuFor = $state(null);

	/** @param {any} track */
	function onRowClick(track) {
		if (selecting) {
			toggleTrackSelected(track.id);
			return;
		}
		playTrack(track).catch(() => {});
	}

	function toggleSelectAll() {
		if (allSelected) clearTrackSelection();
		else playerUi.selectedIds = list.map((t) => t.id);
	}

	/** @param {string} id */
	function openMenu(id) {
		menuFor = menuFor === id ? null : id;
	}

	function closeMenu() {
		menuFor = null;
	}

	/**
	 * @param {any} track
	 * @param {'play' | 'next' | 'select' | 'edit' | 'delete'} action
	 */
	async function onMenu(track, action) {
		closeMenu();
		try {
			if (action === 'play') await playTrack(track);
			else if (action === 'next') queuePlayNext(track);
			else if (action === 'select') toggleTrackSelected(track.id);
			else if (action === 'edit') openTrackEdit(track);
			else if (action === 'delete') {
				if (!confirm(`Delete “${track.title}”?`)) return;
				await removeTracks([track.id]);
			}
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}

	async function onBulkDelete() {
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
	{#if playerUi.error}
		<p class="banner err">{playerUi.error}</p>
	{/if}

	{#if selecting && !(playerBrowse.mode === 'artists' && !playerBrowse.artist)}
		<div class="select-bar">
			<button type="button" class="bar-btn" onclick={toggleSelectAll}>
				{allSelected ? 'Clear' : 'All'}
			</button>
			<span class="bar-count">{selectedCount} selected</span>
			<button type="button" class="bar-btn" onclick={openBulkTrackEdit}>Edit</button>
			<button type="button" class="bar-btn" onclick={onBulkDelete}>Delete</button>
			<button type="button" class="bar-btn" onclick={clearTrackSelection}>Done</button>
		</div>
	{/if}

	<div class="feed">
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
							class="artist-row"
							onclick={() => setPlayerBrowse('artists', { artist: name })}
						>
							<span class="col title">{name}</span>
							<span class="col meta"
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
					{@const artist = track.artists?.join(', ') || '—'}
					{@const album = track.album || '—'}
					<div
						class="track-row"
						class:on={playerUi.currentId === track.id}
						class:selected
						class:selecting
					>
						{#if selecting}
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
						{/if}

						<button type="button" class="main" onclick={() => onRowClick(track)}>
							<span class="line-primary">
								<span class="col title">{track.title}</span>
								<span class="col artist">{artist}</span>
								<span class="col album">{album}</span>
							</span>
							<span class="line-secondary">
								<span class="sub">{artist}</span>
								{#if album && album !== '—'}
									<span class="dot" aria-hidden="true">·</span>
									<span class="sub">{album}</span>
								{/if}
							</span>
						</button>

						<div class="menu-wrap">
							<button
								type="button"
								class="more-btn"
								aria-label="More for {track.title}"
								aria-expanded={menuFor === track.id}
								onclick={() => openMenu(track.id)}
							>
								<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
									<circle cx="9" cy="4" r="1.35" fill="currentColor" />
									<circle cx="9" cy="9" r="1.35" fill="currentColor" />
									<circle cx="9" cy="14" r="1.35" fill="currentColor" />
								</svg>
							</button>
							{#if menuFor === track.id}
								<button type="button" class="menu-scrim" aria-label="Close menu" onclick={closeMenu}
								></button>
								<div class="more-menu" role="menu">
									<button type="button" role="menuitem" onclick={() => onMenu(track, 'play')}
										>Play</button
									>
									<button type="button" role="menuitem" onclick={() => onMenu(track, 'next')}
										>Play next</button
									>
									<button type="button" role="menuitem" onclick={() => onMenu(track, 'select')}
										>Select</button
									>
									<button type="button" role="menuitem" onclick={() => onMenu(track, 'edit')}
										>Edit</button
									>
									<button type="button" role="menuitem" onclick={() => onMenu(track, 'delete')}
										>Delete</button
									>
								</div>
							{/if}
						</div>
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
		padding: 0 8px 0 16px;
		border-bottom: 1px solid var(--hairline);
		box-sizing: border-box;
		background: var(--fg-4);
		width: 100%;
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

	.feed {
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
		padding: 8px;
		width: 100%;
		box-sizing: border-box;
	}

	.artist-row,
	.track-row {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		min-width: 0;
		border-radius: 12px;
		box-sizing: border-box;
	}

	.artist-row {
		padding: 0.85rem 0.9rem;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.artist-row:hover,
	.track-row:hover {
		background: var(--fg-4);
	}

	.track-row.on {
		background: var(--selection);
	}

	.track-row.selected {
		background: var(--fg-8);
	}

	.check {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		margin-left: 4px;
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
	}

	.check.on .check-dot {
		border-color: var(--fg);
		background: var(--fg);
		box-shadow: inset 0 0 0 3px var(--bg);
	}

	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 2px;
		padding: 0.75rem 0.4rem 0.75rem 0.75rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
		box-sizing: border-box;
	}

	.line-primary {
		display: flex;
		align-items: baseline;
		gap: 10px;
		min-width: 0;
		width: 100%;
	}

	.line-secondary {
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	/* Mobile: title + stacked artist/album */
	.col.title {
		flex: 1 1 auto;
		max-width: 100%;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col.artist,
	.col.album {
		display: none;
	}

	.col.meta {
		flex: 0 0 auto;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.line-secondary {
		display: flex;
	}

	.sub {
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dot {
		flex-shrink: 0;
		color: var(--fg-16);
	}

	.menu-wrap {
		position: relative;
		flex-shrink: 0;
		margin-right: 4px;
	}

	.more-btn {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-33);
		padding: 0;
		cursor: pointer;
	}

	.more-btn:hover,
	.more-btn[aria-expanded='true'] {
		color: var(--fg);
		background: var(--fg-8);
	}

	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.more-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 50;
		min-width: 148px;
		padding: 4px;
		background: var(--popover);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		box-shadow: 0 12px 32px var(--shadow-strong);
	}

	.more-menu button {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--fg-66);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.more-menu button:hover {
		background: var(--fg-8);
		color: var(--fg);
	}

	@media (min-width: 768px) {
		/* Desktop: title | artist | album columns */
		.line-secondary {
			display: none;
		}

		.col.title {
			flex: 0 0 42%;
			max-width: 42%;
		}

		.col.artist {
			display: block;
			flex: 0 0 28%;
			max-width: 28%;
			font-size: 13px;
			font-weight: 500;
			color: var(--fg-33);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.col.album {
			display: block;
			flex: 1 1 auto;
			min-width: 0;
			font-size: 13px;
			font-weight: 500;
			color: var(--fg-33);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.main {
			padding: 0.7rem 0.5rem 0.7rem 0.85rem;
		}
	}
</style>
