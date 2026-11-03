<script>
	/**
	 * Detail-column browser for a Files folder (3rd column / deeper page).
	 */
	import folderUrl from '@alpha/ui/icons/folder.svg';
	import {
		fileDisplayTitle,
		fileTypeColors,
		splitFileTitle
	} from '$lib/file-display.js';
	import { childrenOf } from '$lib/drive/tree.js';
	import { selectEntity } from '$lib/workspace.svelte.js';

	/**
	 * @type {{
	 *   folderPath: string,
	 *   entries: { path: string, kind: string, display_name?: string | null }[],
	 *   title?: string
	 * }}
	 */
	let { folderPath = '', entries = [], title = '' } = $props();

	const items = $derived(childrenOf(entries, folderPath));
	const heading = $derived(title || fileDisplayTitle({ path: folderPath, name: folderPath }));

	/** @param {import('$lib/drive/tree.js').TreeItem} item */
	function openItem(item) {
		selectEntity('file', item.path);
	}
</script>

<div class="files-detail">
	<h2 class="heading">{heading}</h2>
	{#if items.length === 0}
		<p class="empty">Empty folder</p>
	{:else}
		<div class="card-stack">
			{#each items as item (item.path)}
				{@const titleText = fileDisplayTitle(item)}
				{@const parts = splitFileTitle(titleText, { isFolder: item.isFolder })}
				{@const colors = fileTypeColors(parts.ext || 'file')}
				<button type="button" class="row" onclick={() => openItem(item)}>
					{#if item.isFolder}
						<img class="folder-ico" src={folderUrl} alt="" width="18" height="18" />
						<span class="folder-name">{parts.stem}</span>
						<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M6 3.5 10.5 8 6 12.5"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{:else}
						<span
							class="type-box"
							style:color={colors.ink}
							style:background={colors.wash}
							aria-hidden="true">{parts.label || 'FILE'}</span
						>
						<span class="name-line">
							<span class="stem">{parts.stem}</span>
							{#if parts.ext}
								<span class="ext">.{parts.ext}</span>
							{/if}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.files-detail {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 4px 24px;
		min-height: 0;
	}

	.heading {
		margin: 0 12px 10px;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--fg);
	}

	.empty {
		margin: 0;
		padding: 16px 12px;
		color: var(--fg-33);
		font-size: 13px;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		padding: 0 6px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 40px;
		padding: 6px 10px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}

	.row:hover {
		background: var(--fg-4);
	}

	.folder-ico {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		object-fit: contain;
		opacity: 0.72;
	}

	.folder-name {
		flex: 1;
		min-width: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 13px;
		font-weight: 400;
		color: var(--fg-66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chev {
		flex-shrink: 0;
		color: var(--fg-33);
		opacity: 0.55;
	}

	.type-box {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.name-line {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 14px;
		font-weight: 500;
	}

	.stem {
		color: var(--fg);
	}

	.ext {
		color: var(--fg-33);
		font-weight: 500;
	}
</style>
