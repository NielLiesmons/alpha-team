<script>
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import Spinner from '$lib/components/Spinner.svelte';
	import {
		openPlaylistCreate,
		playerBrowse,
		playerUi,
		playlists,
		refreshTracks,
		setPlayerBrowse
	} from '$lib/player.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';

	const connected = $derived(Boolean(activeSession()) && ui.source === 'drive');

	$effect(() => {
		if (ui.source === 'drive' || driveSession.connected) {
			refreshTracks();
		}
	});
</script>

<svelte:head><title>Player</title></svelte:head>

<nav class="feed" aria-label="Library">
	{#if playerUi.syncing}
		<div class="sync-pill" aria-live="polite">
			<Spinner size={12} label="Syncing library" />
			<span>Updating library…</span>
		</div>
	{/if}
	<div class="card-stack top">
		<button
			type="button"
			class="row"
			class:on={playerBrowse.mode === 'songs'}
			onclick={() => setPlayerBrowse('songs')}
		>
			<span class="row-icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<path
						d="M6 12.5V4.2l7-1.4v8.2"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<circle cx="4.5" cy="12.5" r="1.5" stroke="currentColor" stroke-width="1.4" />
					<circle cx="11.5" cy="11" r="1.5" stroke="currentColor" stroke-width="1.4" />
				</svg>
			</span>
			<span class="title">Songs</span>
		</button>
		<button
			type="button"
			class="row"
			class:on={playerBrowse.mode === 'artists'}
			onclick={() => setPlayerBrowse('artists')}
		>
			<span class="row-icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="5" r="2.25" stroke="currentColor" stroke-width="1.4" />
					<path
						d="M3.5 13c.6-2.2 2.2-3.5 4.5-3.5s3.9 1.3 4.5 3.5"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
					/>
				</svg>
			</span>
			<span class="title">Artists</span>
		</button>
		<button
			type="button"
			class="row"
			class:on={playerBrowse.mode === 'albums'}
			onclick={() => setPlayerBrowse('albums')}
		>
			<span class="row-icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" />
					<circle cx="8" cy="8" r="1.6" stroke="currentColor" stroke-width="1.4" />
				</svg>
			</span>
			<span class="title">Albums</span>
		</button>
		<button
			type="button"
			class="row"
			class:on={playerBrowse.mode === 'played'}
			onclick={() => setPlayerBrowse('played')}
		>
			<span class="row-icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<path
						d="M3 3.5h4.5v4.5H3zM8.5 3.5H13v4.5H8.5zM3 8.5h4.5V13H3zM8.5 8.5H13V13H8.5z"
						stroke="currentColor"
						stroke-width="1.3"
						stroke-linejoin="round"
					/>
				</svg>
			</span>
			<span class="title">Recently Played</span>
		</button>
		<button
			type="button"
			class="row"
			class:on={playerBrowse.mode === 'recent'}
			onclick={() => setPlayerBrowse('recent')}
		>
			<span class="row-icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" />
					<path
						d="M8 5v3.2l2 1.3"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</span>
			<span class="title">Recently Added</span>
		</button>
	</div>

	<div class="group-header">
		<span class="eyebrow-label-xs">Playlists</span>
		<span class="group-count">{playlists.length}</span>
		{#if connected}
			<button
				type="button"
				class="group-add-btn"
				aria-label="New playlist"
				onclick={openPlaylistCreate}
			>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		{/if}
	</div>
	{#if !connected}
		<p class="hint">Connect Drive to sync playlists.</p>
	{:else if playlists.length === 0}
		<p class="hint">No playlists yet</p>
	{:else}
		<div class="card-stack">
			{#each playlists as pl (pl.id)}
				<button
					type="button"
					class="row"
					class:on={playerBrowse.mode === 'playlist' && playerBrowse.playlistId === pl.id}
					onclick={() => setPlayerBrowse('playlist', { playlistId: pl.id })}
				>
					<span class="title">{pl.title}</span>
				</button>
			{/each}
		</div>
	{/if}
</nav>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding-bottom: 8px;
	}

	.sync-pill {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px 12px 0;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--fg-4);
		font-size: 12px;
		font-weight: 500;
		font-family: var(--font);
		color: var(--fg-66);
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 8px 4px 16px;
		background: var(--fg-4);
		border: 0;
		box-sizing: border-box;
	}

	.eyebrow-label-xs {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-66);
	}

	.group-count {
		font-family: var(--font);
		font-size: 11px;
		font-weight: 500;
		color: var(--fg-33);
	}

	.group-add-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: transparent;
		border: none;
		color: var(--fg-33);
		cursor: pointer;
		flex-shrink: 0;
		padding: 0;
	}

	.group-add-btn:hover {
		color: var(--fg);
		background: var(--fg-8);
	}

	.hint {
		margin: 0;
		padding: 12px 16px;
		font-size: 13px;
		color: var(--fg-33);
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 8px 10px;
		box-sizing: border-box;
	}

	.card-stack.top {
		padding-top: 4px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 0.75rem 0.9rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
		box-sizing: border-box;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.row.on {
		background: var(--selection);
	}

	.row-icon {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		color: var(--fg-33);
	}

	.row.on .row-icon {
		color: var(--fg);
	}

	.title {
		display: block;
		min-width: 0;
		flex: 1;
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 500;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
