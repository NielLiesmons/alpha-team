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
	<div class="card-stack top">
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
	</div>

	<div class="group-header">
		<span class="eyebrow-label-xs">Playlists</span>
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
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-33);
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
		width: 100%;
		padding: 0.85rem 0.9rem;
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

	.title {
		display: block;
		width: 100%;
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
