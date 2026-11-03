<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import NavIcon from '@alpha/ui/NavIcon.svelte';

	/** @type {{ name?: string, size?: number }} */
	let { name = 'dot', size = 22 } = $props();
</script>

<NavIcon {name} {size} />
