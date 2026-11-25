<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import ChevronRight from '@alpha/ui/icons/ChevronRight.svelte';

	/** @type {{ size?: number, className?: string, strokeWidth?: number | string }} */
	let { size = 14, className = '', strokeWidth = 1.5 } = $props();
</script>

<ChevronRight {size} {className} {strokeWidth} />
