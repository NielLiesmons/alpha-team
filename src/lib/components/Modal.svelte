<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import Modal from '@alpha/ui/Modal.svelte';

	let {
		open = $bindable(false),
		label = 'Dialog',
		children
	} = $props();
</script>

<Modal bind:open {label}>{@render children?.()}</Modal>
