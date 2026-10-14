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

<nav class="browse" aria-label="Library">
	<button
		type="button"
		class="nav-row"
		class:on={playerBrowse.mode === 'songs'}
		onclick={() => setPlayerBrowse('songs')}
	>
		Songs
	</button>
	<button
		type="button"
		class="nav-row"
		class:on={playerBrowse.mode === 'artists'}
		onclick={() => setPlayerBrowse('artists')}
	>
		Artists
	</button>

	<p class="eyebrow">Playlists</p>
	{#if !connected}
		<p class="hint">Connect Drive to sync playlists.</p>
	{:else if playlists.length === 0}
		<p class="hint">No playlists yet</p>
	{:else}
		{#each playlists as pl (pl.id)}
			<button
				type="button"
				class="nav-row nest"
				class:on={playerBrowse.mode === 'playlist' && playerBrowse.playlistId === pl.id}
				onclick={() => setPlayerBrowse('playlist', { playlistId: pl.id })}
			>
				{pl.title}
			</button>
		{/each}
	{/if}
</nav>

<style>
	.browse {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: 0 0 24px;
	}

	.eyebrow {
		margin: 18px 0 4px;
		padding: 0 16px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--white33);
	}

	.hint {
		margin: 0;
		padding: 8px 16px;
		font-size: 13px;
		color: var(--white33);
	}

	.nav-row {
		display: block;
		width: 100%;
		padding: 10px 16px;
		border: 0;
		border-bottom: 1px solid var(--white11);
		background: transparent;
		color: var(--white);
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.nav-row.nest {
		font-weight: 500;
		font-size: 14px;
		color: var(--white66);
	}

	.nav-row:hover {
		background: var(--white4);
	}

	.nav-row.on {
		background: var(--white8);
		color: var(--white);
	}
</style>
