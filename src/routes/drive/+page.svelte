<script>
	import { nodeAt } from '$lib/fixtures.js';

	/** @type {string[]} */
	let path = $state([]);
	/** @type {string | null} */
	let openFile = $state(null);

	let folder = $derived(nodeAt(path));
	let entries = $derived(
		[...(folder?.children ?? [])].sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
			return a.name.localeCompare(b.name, 'fr');
		})
	);
	let file = $derived(entries.find((entry) => entry.kind === 'file' && entry.name === openFile) ?? null);

	/** @param {number} index */
	function go(index) {
		path = path.slice(0, index);
		openFile = null;
	}

	/** @param {string} name */
	function enter(name) {
		path = [...path, name];
		openFile = null;
	}
</script>

<header class="page-head">
	<div>
		<h1>Drive</h1>
		<p>Public files for the site, and the private folder.</p>
	</div>
</header>

<nav class="crumbs" aria-label="Folder">
	<button type="button" class:here={path.length === 0} onclick={() => go(0)}>Space</button>
	{#each path as part, index (part)}
		<span class="sep">/</span>
		<button type="button" class:here={index === path.length - 1} onclick={() => go(index + 1)}>
			{part}
		</button>
	{/each}
</nav>

<div class="split">
	<div class="panel">
		{#each entries as entry (entry.name)}
			{#if entry.kind === 'dir'}
				<button type="button" class="list-btn" onclick={() => enter(entry.name)}>
					<div class="list-title">
						<span>{entry.name}</span>
						<span class="file-kind">Folder</span>
					</div>
				</button>
			{:else}
				<button
					type="button"
					class="list-btn"
					class:selected={openFile === entry.name}
					onclick={() => (openFile = entry.name)}
				>
					<div class="list-title">
						<span>{entry.name}</span>
						<span class="file-kind">{entry.size}</span>
					</div>
				</button>
			{/if}
		{:else}
			<p class="empty">Empty folder.</p>
		{/each}
	</div>

	<div class="panel preview">
		{#if file}
			<p class="field-label">{file.name}</p>
			<pre>{file.preview}</pre>
		{:else}
			<p class="muted">Choose a file to preview it. <code>private/</code> never goes on the site.</p>
		{/if}
	</div>
</div>

<style>
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.92em;
	}
</style>
