<!-- Re-export from @alpha/ui (shared design system — metaball product loader). -->
<script>
	import Spinner from '@alpha/ui/Spinner.svelte';

	/** @type {{ size?: number | 'sm' | 'default', label?: string }} */
	let { size = 22, label = 'Loading' } = $props();
</script>

<Spinner {size} {label} />
