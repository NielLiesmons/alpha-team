<script>
	/** Re-export shared Search from @alpha/ui. */
	import Search from '@alpha/ui/icons/Search.svelte';

	/** @type {{ size?: number, className?: string }} */
	let { size = 16, className = '' } = $props();
</script>

<Search {size} {className} />
