<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import DropdownMenu from '@alpha/ui/DropdownMenu.svelte';

	/**
	 * @type {{
	 *   open?: boolean,
	 *   anchor?: HTMLElement | null,
	 *   point?: { x: number, y: number } | null,
	 *   placement?: 'above' | 'below',
	 *   align?: 'start' | 'end',
	 *   width?: number,
	 *   maxHeight?: number,
	 *   items?: { id?: string, label: string, danger?: boolean, disabled?: boolean, active?: boolean, hint?: string, icon?: import('svelte').Component<any>, onclick?: () => void }[],
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
</script>

{#if children}
	<DropdownMenu {open} {anchor} {point} {placement} {align} {width} {maxHeight} {onclose}>
		{@render children()}
	</DropdownMenu>
{:else}
	<DropdownMenu {open} {anchor} {point} {placement} {align} {width} {maxHeight} {items} {onclose} />
{/if}
