<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import At from '@alpha/ui/icons/At.svelte';

	/** @type {{ size?: number, className?: string, strokeWidth?: number | string }} */
	let { size = 14, className = '', strokeWidth = 1.4 } = $props();
</script>

<At {size} {className} {strokeWidth} />
