<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import FloatPanel from '@alpha/ui/FloatPanel.svelte';

	let {
		open = false,
		anchor = null,
		placement = 'above',
		align = 'start',
		width = 280,
		maxHeight = 360,
		onclose = () => {},
		children
	} = $props();
</script>

<FloatPanel {open} {anchor} {placement} {align} {width} {maxHeight} {onclose}>
	{@render children?.()}
</FloatPanel>
