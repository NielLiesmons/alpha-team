<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import Archive from '@alpha/ui/icons/Archive.svelte';

	/** @type {{ size?: number, className?: string, filled?: boolean, strokeWidth?: number | string }} */
	let { size = 14, className = '', filled = false, strokeWidth = 1.35 } = $props();
</script>

<Archive {size} {className} {filled} {strokeWidth} />
