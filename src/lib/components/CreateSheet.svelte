<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import CreateSheet from '@alpha/ui/CreateSheet.svelte';

	let {
		open = false,
		label = 'Create',
		fullscreen = false,
		dragDismiss = true,
		showHandle = true,
		onclose = () => {},
		children
	} = $props();
</script>

<CreateSheet {open} {label} {fullscreen} {dragDismiss} {showHandle} {onclose}
	>{@render children?.()}</CreateSheet
>
