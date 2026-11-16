<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import Folder from '@alpha/ui/icons/Folder.svelte';

	/** @type {{ size?: number, className?: string }} */
	let { size = 18, className = '' } = $props();
</script>

<Folder {size} {className} />
