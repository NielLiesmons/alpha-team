<script>
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import {
		playerBrowse,
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
	<button
		type="button"
		class="row"
		class:on={playerBrowse.mode === 'songs'}
		onclick={() => setPlayerBrowse('songs')}
	>
		<span class="title">Songs</span>
	</button>
	<button
		type="button"
		class="row"
		class:on={playerBrowse.mode === 'artists'}
		onclick={() => setPlayerBrowse('artists')}
	>
		<span class="title">Artists</span>
	</button>

	<div class="group-header">
		<span class="eyebrow-label-xs">Playlists</span>
	</div>
	{#if !connected}
		<p class="hint">Connect Drive to sync playlists.</p>
	{:else if playlists.length === 0}
		<p class="hint">No playlists yet</p>
	{:else}
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
	{/if}
</nav>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 4px 6px 4px 16px;
		background: var(--white4);
		border-bottom: 1.4px solid var(--white11);
		box-sizing: border-box;
	}

	.eyebrow-label-xs {
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.hint {
		margin: 0;
		padding: 12px 16px;
		font-size: 13px;
		color: var(--white33);
		border-bottom: 1.4px solid var(--white11);
	}

	.row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.85rem 1rem;
		border: 0;
		border-bottom: 1.4px solid var(--white11);
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
		box-sizing: border-box;
	}

	.row:hover {
		background: var(--white4);
	}

	.row.on {
		background: var(--white8);
	}

	.title {
		display: block;
		width: 100%;
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
