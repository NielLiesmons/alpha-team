<!-- Re-export from @alpha/ui (shared design system). -->
<script>
	import Text from '@alpha/ui/icons/Text.svelte';

	/** @type {{ size?: number, className?: string }} */
	let { size = 15, className = '' } = $props();
</script>

<Text {size} {className} />
