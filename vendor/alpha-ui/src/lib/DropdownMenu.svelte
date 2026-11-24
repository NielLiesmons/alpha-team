<script>
	/**
	 * Canonical dropdown / overflow menu — glass FloatPanel + shared popover rows.
	 * Items render with `.alpha-popover-ico` + muted label; missing icons → ChevronRight.
	 * Destructive rows use accent-3. Pass `point` for context menus (tap/pointer).
	 */
	import FloatPanel from './FloatPanel.svelte';
	import ChevronRight from './icons/ChevronRight.svelte';

	/**
	 * @typedef {{
	 *   id?: string,
	 *   label: string,
	 *   danger?: boolean,
	 *   disabled?: boolean,
	 *   active?: boolean,
	 *   hint?: string,
	 *   icon?: import('svelte').Component<any>,
	 *   onclick?: () => void
	 * }} DropdownItem
	 */

	/**
	 * @type {{
	 *   open?: boolean,
	 *   anchor?: HTMLElement | null,
	 *   point?: { x: number, y: number } | null,
	 *   placement?: 'above' | 'below',
	 *   align?: 'start' | 'end',
	 *   width?: number,
	 *   maxHeight?: number,
	 *   items?: DropdownItem[],
	 *   onclose?: () => void,
	 *   children?: import('svelte').Snippet
	 * }}
	 */
	let {
		open = false,
		anchor = null,
		point = null,
		placement = 'below',
		align = 'start',
		width = 200,
		maxHeight = 320,
		items = [],
		onclose = () => {},
		children
	} = $props();

	/** @param {DropdownItem} item */
	function activate(item) {
		if (item.disabled) return;
		item.onclick?.();
		onclose();
	}
</script>

<FloatPanel {open} {anchor} {point} {placement} {align} {width} {maxHeight} {onclose}>
	{#if children}
		{@render children()}
	{:else}
		<div class="alpha-popover-list dropdown-list" role="menu">
			{#each items as item, i (item.id ?? `${item.label}-${i}`)}
				{@const Icon = item.icon}
				<button
					type="button"
					class="alpha-popover-item dropdown-item"
					class:danger={item.danger}
					class:on={item.active}
					role="menuitem"
					disabled={item.disabled}
					aria-checked={item.active ? 'true' : undefined}
					onclick={() => activate(item)}
				>
					<span class="alpha-popover-ico" aria-hidden="true">
						{#if Icon}
							<Icon size={16} />
						{:else}
							<ChevronRight size={14} />
						{/if}
					</span>
					<span class="alpha-popover-label">{item.label}</span>
					{#if item.hint}
						<span class="alpha-popover-hint">{item.hint}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</FloatPanel>
