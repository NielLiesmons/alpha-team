<script>
	/**
	 * Chat composer + picker — same content-type tiles as the nav Create modal,
	 * in a horizontally scrollable row.
	 */
	import Modal from '@alpha/ui/Modal.svelte';
	import NavIcon from '@alpha/ui/NavIcon.svelte';
	import SheetTopbar from '@alpha/ui/SheetTopbar.svelte';
	import { navPngUrl } from '@alpha/ui/nav-png.js';
	import { t } from '$lib/i18n.svelte.js';

	/**
	 * @typedef {{ kind: string, label: string, icon: string }} AttachItem
	 */

	/**
	 * @type {{
	 *   open?: boolean,
	 *   items?: AttachItem[],
	 *   onPick?: (kind: string) => void
	 * }}
	 */
	let { open = $bindable(false), items = [], onPick } = $props();

	/** @param {string} kind */
	function pick(kind) {
		open = false;
		onPick?.(kind);
	}
</script>

<Modal bind:open label={t('chat.attach')}>
	<div class="attach-modal">
		<SheetTopbar
			title={t('chat.attachTitle')}
			trailing="none"
			closeLabel={t('common.close')}
			onclose={() => (open = false)}
		/>
		<div class="row" role="menu">
			{#each items as item (item.kind)}
				{@const png = navPngUrl(item.icon)}
				<button type="button" class="tile" role="menuitem" onclick={() => pick(item.kind)}>
					<span class="tile-ico" aria-hidden="true">
						{#if png}
							<img class="tile-png" src={png} alt="" />
						{:else}
							<span class="tile-nav"><NavIcon name={item.icon} size={28} /></span>
						{/if}
					</span>
					<span class="tile-label">{item.label}</span>
				</button>
			{/each}
		</div>
	</div>
</Modal>

<style>
	.attach-modal {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}
	.row {
		display: flex;
		gap: 10px;
		overflow-x: auto;
		padding: 4px 12px 16px;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.row::-webkit-scrollbar {
		display: none;
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		flex: 0 0 auto;
		width: 96px;
		min-height: 96px;
		padding: 14px 8px 12px;
		border: 1px solid var(--fg-8);
		border-radius: 18px;
		background: var(--fg-4);
		color: var(--fg);
		font: inherit;
		cursor: pointer;
		box-sizing: border-box;
		transition: transform 0.15s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
	}
	.tile:hover {
		background: var(--fg-8);
		transform: scale(1.02);
	}
	.tile:active {
		transform: scale(0.97);
	}
	.tile-ico {
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		color: var(--fg-66);
	}
	.tile-png {
		display: block;
		width: 32px;
		height: 32px;
		object-fit: contain;
		border-radius: 8px;
	}
	.tile-nav {
		display: grid;
		place-items: center;
		color: var(--fg-66);
	}
	.tile-label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: -0.01em;
		text-align: center;
		line-height: 1.25;
		color: var(--fg);
	}
</style>
