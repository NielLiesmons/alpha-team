<script>
	import { listEntries, uploadFile } from '$lib/drive/entities.js';
	import { activeSession, driveSession } from '$lib/drive/session.svelte.js';
	import { projects, ui } from '$lib/workspace.svelte.js';

	const BUCKETS = [
		{ id: 'files', label: 'Files', path: 'files' },
		{ id: 'photos', label: 'Photos', path: 'media/photos' },
		{ id: 'video', label: 'Video', path: 'media/video' },
		{ id: 'audio', label: 'Audio', path: 'media/audio' },
		{ id: 'publications', label: 'Publications', path: 'publications' }
	];

	let bucket = $state('files');
	/** @type {{ path: string, kind: string }[]} */
	let entries = $state([]);
	let loading = $state(false);
	let uploading = $state(false);
	let err = $state('');
	/** @type {HTMLInputElement | undefined} */
	let fileInput;

	const destinations = $derived([
		...BUCKETS,
		...projects
			.filter((p) => ui.source === 'drive')
			.map((p) => ({
				id: `home-${p.id}`,
				label: `${p.title} home`,
				path: `projects/${p.id}/home`
			}))
	]);

	const currentPath = $derived(destinations.find((d) => d.id === bucket)?.path ?? 'files');

	const visible = $derived(
		entries.filter((e) => e.path === currentPath || e.path.startsWith(`${currentPath}/`))
	);

	async function reload() {
		const session = activeSession();
		if (!session) {
			entries = [];
			return;
		}
		loading = true;
		err = '';
		try {
			entries = await listEntries(session);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (ui.source === 'drive' || driveSession.connected) {
			reload();
		}
	});

	async function onFiles(/** @type {Event} */ e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const files = input.files;
		const session = activeSession();
		if (!session || !files?.length) return;
		uploading = true;
		err = '';
		try {
			for (const file of files) {
				await uploadFile(session, currentPath, file);
			}
			await reload();
		} catch (ex) {
			err = ex instanceof Error ? ex.message : String(ex);
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<svelte:head><title>Drive</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Drive</h1>
		<p>
			{#if ui.source === 'drive'}
				Content-type folders first. Upload here — no CLI seed.
			{:else}
				<a href="/settings">Connect Drive</a> to browse and upload.
			{/if}
		</p>
	</div>
	{#if ui.source === 'drive'}
		<button
			type="button"
			class="new-btn"
			disabled={uploading}
			onclick={() => fileInput?.click()}
		>
			{uploading ? 'Uploading…' : 'Upload'}
		</button>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			hidden
			onchange={onFiles}
		/>
	{/if}
</header>

{#if ui.source !== 'drive'}
	<p class="empty">Drive is disconnected. Connect in Settings, then upload from this page.</p>
{:else}
	<div class="buckets" role="tablist" aria-label="Folders">
		{#each destinations as dest (dest.id)}
			<button
				type="button"
				class="chip"
				class:on={bucket === dest.id}
				role="tab"
				aria-selected={bucket === dest.id}
				onclick={() => (bucket = dest.id)}
			>
				{dest.label}
			</button>
		{/each}
	</div>

	<p class="path">Uploading into <code>{currentPath}/</code></p>

	{#if err}
		<p class="err">{err}</p>
	{/if}
	{#if loading}
		<p class="muted">Loading…</p>
	{:else if visible.length === 0}
		<p class="empty">Nothing in this folder yet. Upload something.</p>
	{:else}
		<ul class="list">
			{#each visible as entry (entry.path)}
				<li>
					<span class="kind">{entry.kind}</span>
					<span class="epath">{entry.path}</span>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.page-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1rem 0.75rem;
	}

	.page-head p {
		margin: 0.35rem 0 0;
		font-size: 13px;
		color: var(--white66);
	}

	.page-head a {
		color: var(--white);
	}

	.new-btn {
		flex-shrink: 0;
		height: 2.25rem;
		padding: 0 1rem;
		border: 0;
		border-radius: 10px;
		background: var(--white);
		color: var(--black);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.new-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.buckets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0 1rem 0.75rem;
	}

	.chip {
		height: 1.85rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 999px;
		background: var(--white8);
		color: var(--white66);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.chip.on {
		background: var(--white);
		color: var(--black);
	}

	.path {
		margin: 0;
		padding: 0 1rem 0.5rem;
		font-size: 12px;
		color: var(--white33);
	}

	.path code {
		color: var(--white66);
	}

	.muted,
	.empty {
		padding: 1.5rem 1rem;
		color: var(--white66);
	}

	.err {
		padding: 0 1rem;
		color: var(--white66);
		font-size: 13px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.list li {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.65rem 1rem;
		border-bottom: 1.4px solid var(--white11);
		font-size: 13px;
	}

	.kind {
		flex-shrink: 0;
		color: var(--white33);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		min-width: 4.5rem;
	}

	.epath {
		color: var(--white);
		word-break: break-all;
		font-family: ui-monospace, monospace;
		font-size: 12px;
	}
</style>
