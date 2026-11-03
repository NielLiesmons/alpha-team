<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import CreateSheet from '@alpha/ui/CreateSheet.svelte';

	let {
		open = false,
		label = 'Create',
		onclose = () => {},
		children
	} = $props();
</script>

<CreateSheet {open} {label} {onclose}>{@render children?.()}</CreateSheet>
