<script>
	import { tick } from 'svelte';
	import {
		closePlaylistCreate,
		createPlaylist,
		playerUi
	} from '$lib/player.svelte.js';
	import CreateSheet from './CreateSheet.svelte';

	let title = $state('');
	let saving = $state(false);
	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state();

	const open = $derived(playerUi.playlistCreateOpen);

	$effect(() => {
		if (!open) return;
		title = '';
		saving = false;
		tick().then(() => titleInput?.focus());
	});

	async function save() {
		const nextTitle = title.trim();
		if (!nextTitle || saving) return;
		saving = true;
		try {
			await createPlaylist(nextTitle);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			saving = false;
		}
	}
</script>

<CreateSheet {open} label="New playlist" onclose={closePlaylistCreate}>
	<div class="sheet-title-row">
		<input
			bind:this={titleInput}
			class="sheet-input"
			placeholder="Playlist name"
			bind:value={title}
			aria-label="Playlist name"
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					save();
				}
			}}
		/>
	</div>
	<div class="form-divider"></div>
	<div class="sheet-bottom">
		<button
			type="button"
			class="publish-btn"
			disabled={saving || !title.trim()}
			onclick={save}
		>
			{saving ? 'Creating…' : 'Create'}
		</button>
	</div>
</CreateSheet>
