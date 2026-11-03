<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import Spinner from '@alpha/ui/Spinner.svelte';

	/** @type {{ size?: number, label?: string }} */
	let { size = 22, label = 'Loading' } = $props();
</script>

<Spinner {size} {label} />
