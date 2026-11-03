<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import Trash from '@alpha/ui/icons/Trash.svelte';

	/** @type {{ size?: number, className?: string }} */
	let { size = 13, className = '' } = $props();
</script>

<Trash {size} {className} />
