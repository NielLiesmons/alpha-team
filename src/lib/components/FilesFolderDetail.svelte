<script>
	/**
	 * Detail-column browser for a Files folder (3rd column / deeper page).
	 * Top bar shows type "Folder"; hero carries the name + summary.
	 */
	import folderUrl from '@alpha/ui/icons/folder.svg';
	import {
		fileDisplayTitle,
		fileTypeColors,
		folderDisplayTitle,
		splitFileTitle
	} from '$lib/file-display.js';
	import { childrenOf } from '$lib/drive/tree.js';
	import { selectEntity } from '$lib/workspace.svelte.js';
	import { locale, t } from '$lib/i18n.svelte.js';

	/**
	 * @type {{
	 *   folderPath: string,
	 *   entries: { path: string, kind: string, display_name?: string | null }[],
	 *   title?: string
	 * }}
	 */
	let { folderPath = '', entries = [], title = '' } = $props();

	const items = $derived(childrenOf(entries, folderPath));
	const heading = $derived(
		folderDisplayTitle(title || fileDisplayTitle({ path: folderPath, name: folderPath }))
	);
	const folderCount = $derived(items.filter((i) => i.isFolder).length);
	const fileCount = $derived(items.length - folderCount);
	const countsLabel = $derived.by(() => {
		locale.value;
		const bits = [];
		if (folderCount) bits.push(
				t(folderCount === 1 ? 'drive.folderCount' : 'drive.folderCountPlural', { n: folderCount })
			);
		if (fileCount) bits.push(t(fileCount === 1 ? 'drive.fileCount' : 'drive.fileCountPlural', { n: fileCount }));
		if (!bits.length) return t('drive.empty');
		return bits.join(', ');
	});

	/** @param {import('$lib/drive/tree.js').TreeItem} item */
	function openItem(item) {
		selectEntity('file', item.path);
	}
</script>

<div class="files-detail">
	<section class="hero">
		<img class="hero-ico" src={folderUrl} alt="" width="72" height="72" />
		<div class="hero-text">
			<h2 class="hero-title">{heading}</h2>
			<p class="hero-meta">
				<span class="hero-counts">{countsLabel}</span>
				<span class="hero-enc">{t('drive.encrypted')}</span>
			</p>
		</div>
	</section>

	{#if items.length === 0}
		<p class="empty">{t('drive.emptyFolder')}</p>
	{:else}
		<div class="card-stack">
			{#each items as item (item.path)}
				{@const titleText = item.isFolder
					? folderDisplayTitle(item)
					: fileDisplayTitle(item)}
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
						<span class="name-line"
							><span class="stem">{parts.stem}</span
							>{#if parts.ext}<span class="ext">.{parts.ext}</span>{/if}</span
						>
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
		min-height: 0;
		flex: 1;
		gap: 8px;
	}

	.hero {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 4px 0 12px;
		min-width: 0;
	}

	.hero-ico {
		flex-shrink: 0;
		width: 72px;
		height: 72px;
		object-fit: contain;
		display: block;
	}

	.hero-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 4px;
	}

	.hero-title {
		margin: 0;
		font-family: 'Inter', var(--font), system-ui, sans-serif;
		font-size: 22px;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hero-meta {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
	}

	.hero-counts {
		color: var(--fg-66);
	}

	.hero-enc {
		color: var(--fg-33);
		font-weight: 500;
	}

	.empty {
		margin: 0;
		padding: 16px 0;
		color: var(--fg-33);
		font-size: 13px;
	}

	.card-stack {
		display: flex;
		flex-direction: column;
		padding: 0 0 16px;
		margin: 0 -10px;
		box-sizing: border-box;
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
