<script>
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import {
		artistNames,
		playTrack,
		playerBrowse,
		playerUi,
		setPlayerBrowse,
		tracks,
		visibleTracks
	} from '$lib/player.svelte.js';
	import { ui } from '$lib/workspace.svelte.js';

	const connected = $derived(Boolean(activeSession()) && ui.source === 'drive');
	const list = $derived(visibleTracks());
	const artists = $derived(artistNames());
</script>

<div class="player-detail">
	{#if playerUi.uploadLabel}
		<p class="banner">{playerUi.uploadLabel}</p>
	{/if}
	{#if playerUi.error}
		<p class="banner err">{playerUi.error}</p>
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
				<ul class="list">
					{#each artists as name (name)}
						<li>
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
						</li>
					{/each}
				</ul>
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
			<ul class="list">
				{#each list as track (track.id)}
					<li>
						<button
							type="button"
							class="row"
							class:on={playerUi.currentId === track.id}
							onclick={() => playTrack(track).catch(() => {})}
						>
							<span class="row-title">{track.title}</span>
							<span class="row-meta">{track.artists?.join(', ')}</span>
						</button>
					</li>
				{/each}
			</ul>
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
		color: var(--white66);
		border-bottom: 1.4px solid var(--white11);
		flex-shrink: 0;
	}

	.banner.err {
		color: var(--white);
	}

	.body {
		flex: 1;
		min-height: 0;
		width: 100%;
		overflow: auto;
	}

	.empty {
		padding: 48px 16px;
		color: var(--white66);
		font-size: 14px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
	}

	.row {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 10px;
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

	.row-title {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 62%;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: var(--white);
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
		color: var(--white33);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
